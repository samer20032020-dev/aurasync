const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { shell, app } = require('electron');
const oauthPage = require('./oauth-page');
const providerCredentials = require('./provider-credentials');
const { listenWithFallback } = require('./oauth-server');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const AUTHORITY = (tenant) => `https://login.microsoftonline.com/${tenant || 'common'}/oauth2/v2.0`;
const SCOPES = 'offline_access Files.ReadWrite.All User.Read';
const REDIRECT_PORT = 58292;
const ROOT_BACKUP_FOLDER_NAME = 'AuraSync';
const LEGACY_ROOT_BACKUP_FOLDER_NAME = 'My Secure Cloud Backup';
const CHUNK_SIZE = 10 * 1024 * 1024; // multiple of 320 KiB as required by Graph

async function readChunk(filePath, start, end) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const length = end - start + 1;
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

class OneDriveService {
  constructor() {
    this.id = 'onedrive';
    this.label = 'OneDrive';
    this.tokens = null;
    this.userInfo = null;
    this.storage = null;
    this.rootFolderId = null;
    this.activeLoopbackServer = null;
    this.credentialsPath = this.resolveCredentialsPath();
    this.tokenPath = this.resolveTokenPath();
  }

  resolveCredentialsPath() {
    const candidates = [
      path.join(path.dirname(process.execPath || ''), 'onedrive-credentials.json'),
      path.join(process.cwd(), 'onedrive-credentials.json'),
      path.join(__dirname, '..', 'onedrive-credentials.json'),
      path.join((app && typeof app.getAppPath === 'function') ? app.getAppPath() : process.cwd(), 'onedrive-credentials.json'),
      path.join(process.resourcesPath || '', 'app', 'onedrive-credentials.json'),
      path.join(process.resourcesPath || '', 'onedrive-credentials.json')
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    return path.join(process.cwd(), 'onedrive-credentials.json');
  }

  resolveTokenPath() {
    try {
      const userData = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
      return path.join(userData, 'onedrive-token.json');
    } catch (e) {
      return path.join(process.cwd(), 'onedrive-token.json');
    }
  }

  loadCredentials() {
    let raw = null;
    try {
      if (fs.existsSync(this.credentialsPath)) {
        raw = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
      }
    } catch (_) {}

    if (!raw) {
      raw = providerCredentials.get('onedrive');
    }

    if (!raw || !raw.client_id) return null;
    return { clientId: raw.client_id, tenant: raw.tenant || 'common' };
  }

  isConfigured() {
    return !!this.loadCredentials();
  }

  isConnected() {
    return !!this.tokens && !!this.tokens.access_token;
  }

  getStatusInfo() {
    return {
      id: this.id,
      label: this.label,
      configured: this.isConfigured(),
      connected: this.isConnected(),
      user: this.userInfo,
      storage: this.storage,
      credentialsPath: this.credentialsPath
    };
  }

  saveTokens(tokens) {
    this.tokens = { ...(this.tokens || {}), ...tokens };
    if (this.tokens.expires_in) {
      this.tokens.expires_at = Date.now() + (parseInt(this.tokens.expires_in, 10) - 60) * 1000;
    }
    try {
      fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokens, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed saving OneDrive tokens:', e.message);
    }
  }

  async initialize() {
    if (!this.isConfigured()) return { connected: false, configured: false };
    try {
      if (fs.existsSync(this.tokenPath)) {
        this.tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        await this.ensureAccessToken();
        await this.fetchUserProfile();
        await this.ensureRootFolder();
        return { connected: true, user: this.userInfo };
      }
    } catch (err) {
      console.warn('OneDrive initialization:', err.message);
      this.tokens = null;
    }
    return { connected: false };
  }

  async ensureAccessToken() {
    if (!this.tokens || !this.tokens.access_token) {
      throw new Error('OneDrive is not authenticated');
    }
    if (this.tokens.expires_at && Date.now() < this.tokens.expires_at - 60000) {
      return this.tokens.access_token;
    }
    if (!this.tokens.refresh_token) {
      throw new Error('OneDrive session expired, please reconnect');
    }
    const creds = this.loadCredentials();
    if (!creds) throw new Error('OneDrive credentials file is missing');

    const body = new URLSearchParams({
      client_id: creds.clientId,
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
      scope: SCOPES
    });

    const res = await fetch(`${AUTHORITY(creds.tenant)}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.tokens = null;
      throw new Error(`OneDrive token refresh failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    this.saveTokens(data);
    return this.tokens.access_token;
  }

  async graph(pathname, options = {}) {
    const token = await this.ensureAccessToken();
    const res = await fetch(pathname.startsWith('http') ? pathname : `${GRAPH}${pathname}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if (options.raw) return res;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OneDrive API ${res.status}: ${text.slice(0, 250)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async fetchUserProfile() {
    const me = await this.graph('/me?$select=displayName,userPrincipalName,mail');
    let storage = null;
    try {
      const drive = await this.graph('/me/drive?$select=quota');
      if (drive && drive.quota) {
        storage = {
          limit: drive.quota.total != null ? drive.quota.total : null,
          usage: drive.quota.used || 0,
          usageInDrive: drive.quota.used || 0
        };
      }
    } catch (_) {}
    this.userInfo = {
      name: me.displayName || 'OneDrive User',
      email: me.userPrincipalName || me.mail || '',
      picture: null,
      storageQuota: storage
    };
    this.storage = storage;
    return this.userInfo;
  }

  getStorageState() {
    return this.storage;
  }

  isQuotaFull() {
    if (!this.storage || !this.storage.limit) return false;
    return this.storage.usage >= this.storage.limit;
  }

  async listFolderItems(parentId) {
    const children = [];
    let nextUrl = parentId
      ? `/me/drive/items/${parentId}/children?$top=1000`
      : '/me/drive/root/children?$top=1000';

    while (nextUrl) {
      const data = await this.graph(nextUrl);
      for (const it of data.value || []) {
        children.push({
          id: it.id,
          name: it.name,
          isDir: !!it.folder,
          size: it.size || 0,
          modifiedTime: it.lastModifiedDateTime || null
        });
      }
      nextUrl = data['@odata.nextLink'] || null;
    }
    children.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return children;
  }

  async findChildByName(parentId, name) {
    const items = await this.listFolderItems(parentId);
    return items.find((i) => i.name.toLowerCase() === String(name).toLowerCase()) || null;
  }

  async ensureFolderAt(parentId, name) {
    const existing = await this.findChildByName(parentId, name);
    if (existing && existing.isDir) return existing.id;

    const endpoint = parentId
      ? `/me/drive/items/${parentId}/children`
      : '/me/drive/root/children';
    const token = await this.ensureAccessToken();
    const res = await fetch(`${GRAPH}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      // If it already exists (race or case difference) return the existing one
      const again = await this.findChildByName(parentId, name);
      if (again && again.isDir) return again.id;
      const text = await res.text().catch(() => '');
      throw new Error(`OneDrive create folder failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.id;
  }

  async ensureFolder(name, parentId) {
    return this.ensureFolderAt(parentId, name);
  }

  async ensureRootFolder() {
    if (this.rootFolderId) return this.rootFolderId;

    const existing = await this.findChildByName(null, ROOT_BACKUP_FOLDER_NAME);
    if (existing && existing.isDir) {
      this.rootFolderId = existing.id;
      return this.rootFolderId;
    }

    // Upgrade path: rename the legacy root folder so previous backups stay in place
    try {
      const legacy = await this.findChildByName(null, LEGACY_ROOT_BACKUP_FOLDER_NAME);
      if (legacy && legacy.isDir) {
        await this.graph(`/me/drive/items/${legacy.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: ROOT_BACKUP_FOLDER_NAME })
        });
        this.rootFolderId = legacy.id;
        return this.rootFolderId;
      }
    } catch (_) {}

    this.rootFolderId = await this.ensureFolderAt(null, ROOT_BACKUP_FOLDER_NAME);
    return this.rootFolderId;
  }

  async ensureRootBackupFolder() {
    return this.ensureRootFolder();
  }

  async getRootFolderId() {
    return this.ensureRootFolder();
  }

  async listFolder(folderId = null) {
    const parent = folderId || await this.ensureRootFolder();
    return this.listFolderItems(parent);
  }

  async uploadFile({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize = null, onProgress = null, throttle = null }) {
    if (!this.isConnected()) throw new Error('OneDrive is not connected');
    if (!fs.existsSync(localPath)) throw new Error(`File does not exist: ${localPath}`);

    const size = fileSize != null ? fileSize : fs.statSync(localPath).size;
    const name = fileName || path.basename(localPath);

    // Empty file: simple upload
    if (size === 0) {
      const token = await this.ensureAccessToken();
      const endpoint = existingDriveFileId
        ? `${GRAPH}/me/drive/items/${existingDriveFileId}/content`
        : `${GRAPH}/me/drive/items/${parentFolderId}:/${encodeURIComponent(name)}:/content`;
      let res = await fetch(endpoint, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: Buffer.alloc(0),
        signal: AbortSignal.timeout(120000)
      });
      if (!res.ok && existingDriveFileId && (res.status === 404 || res.status === 410)) {
        const fallbackEndpoint = `${GRAPH}/me/drive/items/${parentFolderId}:/${encodeURIComponent(name)}:/content`;
        res = await fetch(fallbackEndpoint, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
          body: Buffer.alloc(0),
          signal: AbortSignal.timeout(120000)
        });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OneDrive empty upload failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const item = await res.json();
      if (onProgress) onProgress(0, 0);
      return { driveFileId: item.id, md5Checksum: null, size: String(item.size || 0), name: item.name };
    }

    // Chunked upload session (works for both new and existing files)
    const token = await this.ensureAccessToken();
    const sessionEndpoint = existingDriveFileId
      ? `${GRAPH}/me/drive/items/${existingDriveFileId}/createUploadSession`
      : `${GRAPH}/me/drive/items/${parentFolderId}:/${encodeURIComponent(name)}:/createUploadSession`;

    let sessionRes = await fetch(sessionEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
          name
        }
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!sessionRes.ok && existingDriveFileId && (sessionRes.status === 404 || sessionRes.status === 410)) {
      const fallbackEndpoint = `${GRAPH}/me/drive/items/${parentFolderId}:/${encodeURIComponent(name)}:/createUploadSession`;
      sessionRes = await fetch(fallbackEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
            name
          }
        }),
        signal: AbortSignal.timeout(60000)
      });
    }

    if (!sessionRes.ok) {
      const text = await sessionRes.text().catch(() => '');
      throw new Error(`OneDrive upload session failed (${sessionRes.status}): ${text.slice(0, 200)}`);
    }

    const session = await sessionRes.json();
    const uploadUrl = session.uploadUrl;
    if (!uploadUrl) throw new Error('OneDrive upload session URL missing');

    let offset = 0;
    let result = null;

    while (offset < size) {
      const end = Math.min(offset + CHUNK_SIZE, size) - 1;
      let attempt = 0;
      let chunkDone = false;

      while (!chunkDone) {
        try {
          const chunk = await readChunk(localPath, offset, end);
          if (typeof throttle === 'function') {
            await throttle(chunk.length);
          }
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(chunk.length),
              'Content-Range': `bytes ${offset}-${end}/${size}`
            },
            body: chunk,
            signal: AbortSignal.timeout(300000)
          });

          if (res.status === 202 || res.status === 200 || res.status === 201) {
            const data = await res.json().catch(() => null);
            if (res.status !== 202 && data && data.id) {
              result = data;
            }
            offset = end + 1;
            chunkDone = true;
            if (onProgress) onProgress(offset, size);
          } else if (res.status === 416) {
            // The chunk was already received but the response was lost:
            // Graph tells us where it expects the next range to start.
            const data = await res.json().catch(() => null);
            const nextRange = data && data.nextExpectedRanges && data.nextExpectedRanges[0];
            if (nextRange) {
              const start = parseInt(String(nextRange).split('-')[0], 10);
              if (!isNaN(start) && start > offset && start < size) {
                offset = start;
                if (onProgress) onProgress(offset, size);
                break; // recompute `end`, then read the next chunk
              }
            }
            const text = await res.text().catch(() => '');
            throw new Error(`OneDrive chunk upload failed (${res.status}): ${text.slice(0, 200)}`);
          } else {
            const text = await res.text().catch(() => '');
            throw new Error(`OneDrive chunk upload failed (${res.status}): ${text.slice(0, 200)}`);
          }
        } catch (err) {
          attempt++;
          if (attempt > 3) throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    if (!result || !result.id) {
      throw new Error('OneDrive upload finished without an item id');
    }

    return {
      driveFileId: result.id,
      md5Checksum: null,
      size: String(result.size || size),
      name: result.name || name
    };
  }

  async downloadFile({ fileId, destPath, onProgress = null }) {
    if (!this.isConnected()) throw new Error('OneDrive is not connected');

    let total = 0;
    try {
      const meta = await this.graph(`/me/drive/items/${fileId}?$select=size`);
      total = meta && meta.size ? meta.size : 0;
    } catch (_) {}

    const res = await this.graph(`/me/drive/items/${fileId}/content`, { raw: true });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OneDrive download failed (${res.status}): ${text.slice(0, 200)}`);
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    const { Readable } = require('stream');
    await new Promise((resolve, reject) => {
      let received = 0;
      const nodeStream = Readable.fromWeb(res.body);
      const dest = fs.createWriteStream(destPath);
      nodeStream.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      nodeStream.on('error', reject);
      dest.on('error', reject);
      dest.on('finish', resolve);
      nodeStream.pipe(dest);
    });

    return { destPath, size: total };
  }

  // Server-side copy (used by restore points). Graph copies are asynchronous —
  // we issue the copy then resolve the new item by name in the target folder.
  async copyFile({ sourceId, destParentId, name }) {
    const token = await this.ensureAccessToken();
    const res = await fetch(`${GRAPH}/me/drive/items/${sourceId}/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parentReference: destParentId ? { id: destParentId } : { path: '/drive/root' },
        name,
        '@microsoft.graph.conflictBehavior': 'replace'
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!(res.ok || res.status === 202)) {
      const text = await res.text().catch(() => '');
      throw new Error(`OneDrive copy failed (${res.status}): ${text.slice(0, 200)}`);
    }
    // Wait for the async copy to land, then find the new item by name
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const found = await this.findChildByName(destParentId || null, name);
      if (found) {
        return { id: found.id, name: found.name, size: found.size || 0, md5Checksum: null };
      }
    }
    throw new Error('OneDrive copy did not complete in time');
  }

  async trashFile(fileId) {
    if (!this.isConnected()) throw new Error('OneDrive is not connected');
    // DELETE moves the item to the recycle bin (recoverable)
    await this.graph(`/me/drive/items/${fileId}`, { method: 'DELETE' });
    return { id: fileId, trashed: true };
  }

  // Format / wipe all files and folders created by AuraSync in OneDrive down to 0 GB
  async formatCloud(onProgress = null) {
    if (!this.isConnected()) throw new Error('OneDrive is not connected');
    let deletedCount = 0;
    if (onProgress) onProgress({ current: 1, total: 3, name: 'تحديد مجلد AuraSync...' });

    const rootNames = [ROOT_FOLDER_NAME, LEGACY_ROOT_FOLDER_NAME];
    for (const name of rootNames) {
      try {
        const item = await this.graph(`/me/drive/root:/${encodeURIComponent(name)}`);
        if (item && item.id) {
          if (onProgress) onProgress({ current: 2, total: 3, name: `حذف مجلد ${name}...` });
          await this.trashFile(item.id);
          deletedCount++;
        }
      } catch (_) {}
    }

    this.rootFolderId = null;
    this.rootFolderPath = null;
    if (onProgress) onProgress({ current: 3, total: 3, name: 'تمت الإزالة بنجاح' });
    return { success: true, deletedCount };
  }

  // Remove every trace of AuraSync from OneDrive (permanently deletes root folders)
  async wipeTraces(onProgress = null) {
    const result = await this.formatCloud(onProgress);
    return { success: result.success, wipedCount: result.deletedCount };
  }

  async startOAuthFlow(port = REDIRECT_PORT) {
    const creds = this.loadCredentials();
    if (!creds) {
      throw new Error('OneDrive is not configured: create onedrive-credentials.json with your Azure app client_id');
    }

    if (this.activeLoopbackServer) {
      try { this.activeLoopbackServer.close(); } catch (_) {}
      this.activeLoopbackServer = null;
    }

    const redirectBase = 'http://localhost';
    let redirectUri = `http://localhost:${port}`;
    const state = crypto.randomBytes(16).toString('hex');

    const buildAuthUrl = () =>
      `${AUTHORITY(creds.tenant)}/authorize?` + new URLSearchParams({
        client_id: creds.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: SCOPES,
        state
      }).toString();

    return new Promise((resolve, reject) => {
      let resolved = false;

      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url, true);
          const code = parsedUrl.query && parsedUrl.query.code;
          const error = parsedUrl.query && parsedUrl.query.error;

          if (error) {
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(oauthPage.errorHtml({ message: parsedUrl.query.error_description || error, language: oauthPage.appLanguage() }));
            }
            reject(new Error(parsedUrl.query.error_description || error));
            try { server.close(); } catch (_) {}
            return;
          }

          if (code) {
            // CSRF protection: the state must match the one we sent
            if (parsedUrl.query.state !== state) {
              if (!res.headersSent) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(oauthPage.errorHtml({ message: 'Invalid OAuth state. Please try again.', language: oauthPage.appLanguage() }));
              }
              reject(new Error('OAuth state mismatch (possible CSRF)'));
              try { server.close(); } catch (_) {}
              return;
            }

            const body = new URLSearchParams({
              client_id: creds.clientId,
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              scope: SCOPES
            });

            const tokenRes = await fetch(`${AUTHORITY(creds.tenant)}/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              signal: AbortSignal.timeout(30000)
            });

            if (!tokenRes.ok) {
              const text = await tokenRes.text().catch(() => '');
              throw new Error(`Token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`);
            }

            const tokens = await tokenRes.json();
            this.saveTokens(tokens);
            await this.fetchUserProfile();
            await this.ensureRootFolder();

            resolved = true;
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(oauthPage.successHtml({ provider: 'OneDrive', language: oauthPage.appLanguage() }));
            }
            resolve({ success: true, user: this.userInfo });

            setTimeout(() => {
              try { server.close(); } catch (_) {}
            }, 1500);
          }
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(oauthPage.errorHtml({ message: e.message, language: oauthPage.appLanguage() }));
          }
          if (!resolved) reject(e);
          try { server.close(); } catch (_) {}
        }
      });

      const startServer = async () => {
        try {
          const actualPort = await listenWithFallback(server, port);
          this.activeLoopbackServer = server;
          redirectUri = `${redirectBase}:${actualPort}`;
          server.on('error', (err) => {
            if (!resolved) reject(err);
          });
          shell.openExternal(buildAuthUrl());
        } catch (err) {
          if (!resolved) reject(err);
        }
      };
      startServer();

      setTimeout(() => {
        if (!resolved) {
          try { server.close(); } catch (_) {}
          reject(new Error('OneDrive authentication timed out. Please try again.'));
        }
      }, 180000);
    });
  }

  async logout() {
    this.tokens = null;
    this.userInfo = null;
    this.storage = null;
    this.rootFolderId = null;
    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
    } catch (e) {
      console.error('Error removing OneDrive token:', e.message);
    }
    return { loggedOut: true };
  }

  // Format / wipe all files and folders in OneDrive AuraSync backup down to 0 GB
  async formatCloud(onProgress = null) {
    if (!this.isConnected()) throw new Error('OneDrive is not connected');

    let deletedCount = 0;
    const foldersToWipe = [ROOT_BACKUP_FOLDER_NAME, LEGACY_ROOT_BACKUP_FOLDER_NAME];

    for (const folderName of foldersToWipe) {
      try {
        const item = await this.findChildByName(null, folderName);
        if (item) {
          if (onProgress) {
            onProgress({ current: deletedCount + 1, total: deletedCount + 1, name: folderName });
          }
          // Wipe down to 0 GB: a plain DELETE only moves the folder to the
          // recycle bin (still counted against quota), so permanently delete.
          let deleted = false;
          try {
            await this.graph(`/me/drive/items/${item.id}/permanentDelete`, { method: 'POST' });
            deleted = true;
          } catch (_) {
            try {
              await this.graph(`/me/drive/items/${item.id}`, { method: 'DELETE' });
              deleted = true;
            } catch (err) {
              throw err;
            }
          }
          if (deleted) deletedCount++;
        }
      } catch (err) {
        console.warn(`Could not delete OneDrive folder ${folderName}:`, err.message);
      }
    }

    this.rootFolderId = null;

    try {
      await this.fetchUserProfile();
    } catch (_) {}

    return { success: true, deletedCount };
  }
}

module.exports = new OneDriveService();
