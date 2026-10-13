const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { Readable } = require('stream');
const { shell, app } = require('electron');
const oauthPage = require('./oauth-page');
const providerCredentials = require('./provider-credentials');
const { listenWithFallback } = require('./oauth-server');

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const REDIRECT_PORT = 58293;
const ROOT_FOLDER_NAME = 'AuraSync';
const LEGACY_ROOT_FOLDER_NAME = 'My Secure Cloud Backup';
const SIMPLE_UPLOAD_LIMIT = 140 * 1024 * 1024;
const SESSION_CHUNK = 64 * 1024 * 1024;

class DropboxService {
  constructor() {
    this.id = 'dropbox';
    this.type = 'dropbox';
    this.label = 'Dropbox';
    this.tokens = null;
    this.userInfo = null;
    this.storage = null;
    this.rootFolderPath = null;
    this.activeLoopbackServer = null;
    this.credentialsPath = this.resolveCredentialsPath();
    this.tokenPath = this.resolveTokenPath();
  }

  resolveCredentialsPath() {
    const candidates = [
      path.join(path.dirname(process.execPath || ''), 'dropbox-credentials.json'),
      path.join(process.cwd(), 'dropbox-credentials.json'),
      path.join(__dirname, '..', 'dropbox-credentials.json'),
      path.join((app && typeof app.getAppPath === 'function') ? app.getAppPath() : process.cwd(), 'dropbox-credentials.json'),
      path.join(process.resourcesPath || '', 'app', 'dropbox-credentials.json'),
      path.join(process.resourcesPath || '', 'dropbox-credentials.json')
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    return path.join(process.cwd(), 'dropbox-credentials.json');
  }

  resolveTokenPath() {
    try {
      const userData = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
      return path.join(userData, 'dropbox-token.json');
    } catch (_) {
      return path.join(process.cwd(), 'dropbox-token.json');
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
      raw = providerCredentials.get('dropbox');
    }

    if (!raw || !raw.app_key) return null;
    return { appKey: raw.app_key, appSecret: raw.app_secret || null };
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
      type: this.type,
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
      console.error('Failed saving Dropbox tokens:', e.message);
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
      console.warn('Dropbox initialization:', err.message);
      this.tokens = null;
    }
    return { connected: false };
  }

  async ensureAccessToken() {
    if (!this.tokens || !this.tokens.access_token) {
      throw new Error('Dropbox is not authenticated');
    }
    if (this.tokens.expires_at && Date.now() < this.tokens.expires_at - 60000) {
      return this.tokens.access_token;
    }
    if (!this.tokens.refresh_token) throw new Error('Dropbox session expired, please reconnect');

    const creds = this.loadCredentials();
    if (!creds) throw new Error('Dropbox credentials are missing, please reconfigure');
    const body = {
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
      client_id: creds.appKey
    };
    if (creds.appSecret) body.client_secret = creds.appSecret;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      this.tokens = null;
      const text = await res.text().catch(() => '');
      throw new Error(`Dropbox token refresh failed (${res.status}): ${text.slice(0, 200)}`);
    }
    this.saveTokens(await res.json());
    return this.tokens.access_token;
  }

  async rpc(endpoint, payload = {}) {
    const token = await this.ensureAccessToken();
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dropbox API ${res.status}: ${text.slice(0, 250)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Dropbox requires the Dropbox-API-Arg header to be ASCII: any non-ASCII
  // character (e.g. Arabic file names) must be escaped as \uXXXX.
  encodeApiArg(arg) {
    return JSON.stringify(arg).replace(/[^\x20-\x7E]/g, (ch) => {
      return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
    });
  }

  async contentRequest(endpoint, arg, body, extraHeaders = {}) {
    const token = await this.ensureAccessToken();
    const res = await fetch(`${CONTENT}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': this.encodeApiArg(arg),
        ...extraHeaders
      },
      body,
      duplex: body && typeof body.pipe === 'function' ? 'half' : undefined,
      signal: AbortSignal.timeout(300000)
    });
    return res;
  }

  async fetchUserProfile() {
    const account = await this.rpc('/users/get_current_account');
    let storage = null;
    try {
      const usage = await this.rpc('/users/get_space_usage');
      storage = {
        limit: usage.allocation && usage.allocation.allocated ? usage.allocation.allocated : null,
        usage: usage.used || 0,
        usageInDrive: usage.used || 0
      };
    } catch (_) {}
    this.userInfo = {
      name: account.name ? account.name.display_name : 'Dropbox User',
      email: account.email || '',
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

  async ensureRootFolder() {
    if (this.rootFolderPath) return this.rootFolderPath;
    const target = `/${ROOT_FOLDER_NAME}`;

    const exists = async (p) => {
      try {
        await this.rpc('/files/get_metadata', { path: p });
        return true;
      } catch (_) {
        return false;
      }
    };

    if (!(await exists(target))) {
      if (await exists(`/${LEGACY_ROOT_FOLDER_NAME}`)) {
        // Upgrade path: rename the legacy folder so previous backups stay in place
        try {
          await this.rpc('/files/move_v2', {
            from_path: `/${LEGACY_ROOT_FOLDER_NAME}`,
            to_path: target,
            autorename: false
          });
        } catch (_) {
          try {
            await this.rpc('/files/create_folder_v2', { path: target, autorename: false });
          } catch (createErr) {
            // 409 = already exists (created concurrently), which is fine
            if (!/409/.test(createErr.message)) {
              throw new Error(`Could not create Dropbox root folder: ${createErr.message}`);
            }
          }
        }
      } else {
        try {
          await this.rpc('/files/create_folder_v2', { path: target, autorename: false });
        } catch (createErr) {
          if (!/409/.test(createErr.message)) {
            throw new Error(`Could not create Dropbox root folder: ${createErr.message}`);
          }
        }
      }
    }

    this.rootFolderPath = target;
    return target;
  }

  async listFolder(folderId = null) {
    const basePath = folderId !== null && folderId !== undefined
      ? folderId
      : await this.ensureRootFolder();

    const items = [];
    let res = await this.rpc('/files/list_folder', {
      path: basePath === '/' ? '' : basePath,
      recursive: false,
      include_deleted: false
    });

    while (true) {
      for (const entry of res.entries || []) {
        items.push({
          id: entry.path_display || entry.path_lower,
          name: entry.name,
          isDir: entry['.tag'] === 'folder',
          size: entry.size || 0,
          modifiedTime: entry.client_modified || entry.server_modified || null
        });
      }
      if (!res.has_more) break;
      res = await this.rpc('/files/list_folder/continue', { cursor: res.cursor });
    }

    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return items;
  }

  async ensureFolder(name, parentId = null) {
    const parent = parentId !== null && parentId !== undefined && parentId !== ''
      ? (parentId === '/' ? '' : parentId)
      : await this.ensureRootFolder();
    const target = `${parent}/${name}`;
    try {
      await this.rpc('/files/create_folder_v2', { path: target, autorename: false });
    } catch (err) {
      // 409 = already exists, which is fine
      if (!/409/.test(err.message)) throw err;
    }
    return target;
  }

  async ensureRootBackupFolder() {
    return this.ensureRootFolder();
  }

  async getRootFolderId() {
    return this.ensureRootFolder();
  }

  async uploadFile({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize = null, onProgress = null, throttle = null }) {
    const size = fileSize != null ? fileSize : fs.statSync(localPath).size;
    const targetPath = existingDriveFileId || `${parentFolderId || ''}/${fileName}`;

    if (size <= SIMPLE_UPLOAD_LIMIT) {
      if (typeof throttle === 'function' && size > 0) {
        await throttle(size);
      }
      const stream = fs.createReadStream(localPath);
      if (onProgress) {
        let sent = 0;
        stream.on('data', (chunk) => {
          sent += chunk.length;
          onProgress(sent, size);
        });
      }
      const res = await this.contentRequest(
        '/files/upload',
        { path: targetPath, mode: 'overwrite', autorename: false, mute: true },
        stream,
        { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Dropbox upload failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return { driveFileId: data.path_display || data.path_lower || targetPath, md5Checksum: null, size: String(data.size || size), name: data.name || fileName };
    }

    // Large file: upload session
    const startRes = await this.contentRequest('/files/upload_session/start', { close: false }, Buffer.alloc(0));
    if (!startRes.ok) {
      const text = await startRes.text().catch(() => '');
      throw new Error(`Dropbox session start failed (${startRes.status}): ${text.slice(0, 200)}`);
    }
    const session = await startRes.json();

    let offset = 0;
    while (offset < size) {
      const end = Math.min(offset + SESSION_CHUNK, size) - 1;
      const chunkSize = end - offset + 1;
      if (typeof throttle === 'function') {
        await throttle(chunkSize);
      }
      const chunk = fs.createReadStream(localPath, { start: offset, end });
      let sent = offset;
      const counted = onProgress
        ? chunk.on('data', (c) => {
            sent += c.length;
            onProgress(sent, size);
          })
        : chunk;

      const isLast = end + 1 >= size;
      const arg = isLast
        ? {
            cursor: { session_id: session.session_id, offset },
            commit: { path: targetPath, mode: 'overwrite', autorename: false, mute: true }
          }
        : { cursor: { session_id: session.session_id, offset } };
      const endpoint = isLast ? '/files/upload_session/finish' : '/files/upload_session/append_v2';

      const res = await this.contentRequest(endpoint, arg, counted, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(chunkSize)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Dropbox chunk upload failed (${res.status}): ${text.slice(0, 200)}`);
      }

      if (isLast) {
        const data = await res.json();
        return { driveFileId: data.path_display || data.path_lower || targetPath, md5Checksum: null, size: String(data.size || size), name: data.name || fileName };
      }

      offset = end + 1;
    }

    throw new Error('Dropbox upload failed: no result');
  }

  async downloadFile({ fileId, destPath, onProgress = null }) {
    const res = await this.contentRequest('/files/download', { path: fileId }, undefined);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dropbox download failed (${res.status}): ${text.slice(0, 200)}`);
    }

    let total = 0;
    try {
      const meta = JSON.parse(res.headers.get('dropbox-api-result') || '{}');
      total = meta.size || 0;
    } catch (_) {}

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

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

  // Server-side copy (used by restore points)
  async copyFile({ sourceId, destParentId, name }) {
    const parent = destParentId !== null && destParentId !== undefined && destParentId !== ''
      ? (destParentId === '/' ? '' : destParentId)
      : await this.ensureRootFolder();
    const target = `${parent}/${name}`;
    const res = await this.rpc('/files/copy_v2', {
      from_path: sourceId,
      to_path: target,
      autorename: false
    });
    const md = res && res.metadata ? res.metadata : {};
    return {
      id: md.path_display || md.path_lower || target,
      name: md.name || name,
      size: md.size || 0,
      md5Checksum: null
    };
  }

  async trashFile(fileId) {
    await this.rpc('/files/delete_v2', { path: fileId });
    return { id: fileId, trashed: true };
  }

  // Format / wipe all files and folders created by AuraSync in Dropbox down to 0 GB
  async formatCloud(onProgress = null) {
    if (!this.tokens) throw new Error('Dropbox is not connected');
    let deletedCount = 0;
    if (onProgress) onProgress({ current: 1, total: 3, name: 'تحديد مجلد AuraSync...' });

    const rootPaths = [`/${ROOT_FOLDER_NAME}`, `/${LEGACY_ROOT_FOLDER_NAME}`];
    for (const p of rootPaths) {
      try {
        if (onProgress) onProgress({ current: 2, total: 3, name: `حذف ${p}...` });
        await this.rpc('/files/delete_v2', { path: p });
        deletedCount++;
      } catch (_) {}
    }

    this.rootFolderPath = null;
    if (onProgress) onProgress({ current: 3, total: 3, name: 'تمت الإزالة بنجاح' });
    return { success: true, deletedCount };
  }

  // Remove every trace of AuraSync from Dropbox (permanently deletes root folders)
  async wipeTraces(onProgress = null) {
    const result = await this.formatCloud(onProgress);
    return { success: result.success, wipedCount: result.deletedCount };
  }

  base64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async startOAuthFlow(port = REDIRECT_PORT) {
    const creds = this.loadCredentials();
    if (!creds) {
      throw new Error('Dropbox is not configured: create dropbox-credentials.json with your app_key');
    }

    if (this.activeLoopbackServer) {
      try { this.activeLoopbackServer.close(); } catch (_) {}
      this.activeLoopbackServer = null;
    }

    let redirectUri = `http://localhost:${port}`;
    const codeVerifier = this.base64Url(crypto.randomBytes(48));
    const codeChallenge = this.base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = this.base64Url(crypto.randomBytes(16));

    const buildAuthUrl = () =>
      `${AUTHORIZE_URL}?` + new URLSearchParams({
        client_id: creds.appKey,
        response_type: 'code',
        token_access_type: 'offline',
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
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
            reject(new Error(error));
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

            const body = {
              code,
              grant_type: 'authorization_code',
              client_id: creds.appKey,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier
            };
            if (creds.appSecret) body.client_secret = creds.appSecret;

            const tokenRes = await fetch(TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams(body).toString(),
              signal: AbortSignal.timeout(30000)
            });

            if (!tokenRes.ok) {
              const text = await tokenRes.text().catch(() => '');
              throw new Error(`Token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`);
            }

            this.saveTokens(await tokenRes.json());
            await this.fetchUserProfile();
            await this.ensureRootFolder();

            resolved = true;
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(oauthPage.successHtml({ provider: 'Dropbox', language: oauthPage.appLanguage() }));
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
          redirectUri = `http://localhost:${actualPort}`;
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
          reject(new Error('Dropbox authentication timed out. Please try again.'));
        }
      }, 180000);
    });
  }

  async logout() {
    this.tokens = null;
    this.userInfo = null;
    this.storage = null;
    this.rootFolderPath = null;
    try {
      if (fs.existsSync(this.tokenPath)) fs.unlinkSync(this.tokenPath);
    } catch (e) {
      console.error('Error removing Dropbox token:', e.message);
    }
    return { loggedOut: true };
  }

  // Format / wipe all files and folders in Dropbox AuraSync backup down to 0 GB
  async formatCloud(onProgress = null) {
    if (!this.isConnected()) throw new Error('Dropbox is not connected');

    let deletedCount = 0;
    const targets = ['/' + ROOT_FOLDER_NAME, '/' + LEGACY_ROOT_FOLDER_NAME];

    for (const targetPath of targets) {
      try {
        if (onProgress) {
          onProgress({ current: deletedCount + 1, total: deletedCount + 1, name: targetPath });
        }
        try {
          await this.rpc('/files/permanently_delete', { path: targetPath });
          deletedCount++;
        } catch (_) {
          await this.rpc('/files/delete_v2', { path: targetPath });
          deletedCount++;
        }
      } catch (err) {
        console.warn(`Could not delete Dropbox path ${targetPath}:`, err.message);
      }
    }

    this.rootFolderPath = null;

    try {
      await this.fetchUserProfile();
    } catch (_) {}

    return { success: true, deletedCount };
  }
}

module.exports = new DropboxService();
