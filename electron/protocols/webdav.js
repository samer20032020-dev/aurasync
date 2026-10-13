const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const ROOT_BACKUP_FOLDER_NAME = 'AuraSync';
const LEGACY_ROOT_BACKUP_FOLDER_NAME = 'My Secure Cloud Backup';

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Minimal namespace-agnostic WebDAV multistatus parser (no external deps)
function parseMultistatus(xml) {
  const items = [];
  if (!xml) return items;

  const responseRegex = /<(?:[\w-]+:)?response[\s>][\s\S]*?<\/(?:[\w-]+:)?response>/gi;
  const blocks = String(xml).match(responseRegex) || [];

  for (const block of blocks) {
    const hrefMatch = block.match(/<(?:[\w-]+:)?href[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?href>/i);
    if (!hrefMatch) continue;
    const href = decodeXmlEntities(hrefMatch[1].trim());
    const isDir = /<(?:[\w-]+:)?collection\s*\/?>/i.test(block);
    const sizeMatch = block.match(/<(?:[\w-]+:)?getcontentlength[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?getcontentlength>/i);
    const modifiedMatch = block.match(/<(?:[\w-]+:)?getlastmodified[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?getlastmodified>/i);

    let cleanHref = href;
    try {
      cleanHref = decodeURIComponent(href);
    } catch (_) {}

    const segments = cleanHref.split('/').filter(Boolean);
    const name = segments.length > 0 ? segments[segments.length - 1] : '';

    items.push({
      href,
      name,
      isDir,
      size: sizeMatch ? parseInt(sizeMatch[1], 10) || 0 : 0,
      modifiedTime: modifiedMatch ? modifiedMatch[1].trim() : null
    });
  }
  return items;
}

class WebDAVProvider {
  constructor(account, secret) {
    this.account = account;
    this.id = account.id;
    this.type = 'webdav';
    this.label = account.label || 'WebDAV';
    this.config = account.config || {};
    this.secret = secret || {};
    this.rootFolderUrl = null;
    this.baseUrl = String(this.config.url || '').trim().replace(/\s+/g, '');
    if (this.baseUrl && !this.baseUrl.endsWith('/')) this.baseUrl += '/';
  }

  isConfigured() {
    return !!(this.baseUrl && this.config.username);
  }

  isConnected() {
    return this.isConfigured();
  }

  getStatusInfo() {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      configured: this.isConfigured(),
      connected: this.isConnected(),
      user: { name: this.config.username || '', email: '' },
      storage: null
    };
  }

  async initialize() {
    return { connected: this.isConnected() };
  }

  // Unified provider interface: WebDAV servers rarely expose a usable quota API
  getStorageState() {
    return null;
  }

  isQuotaFull() {
    return false;
  }

  authHeader() {
    const user = this.config.username || '';
    const pass = this.secret.password || '';
    return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
  }

  requestOptions(extraHeaders = {}) {
    return {
      headers: {
        Authorization: this.authHeader(),
        ...extraHeaders
      }
    };
  }

  async propfind(targetUrl, depth = '1') {
    const res = await fetch(targetUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: this.authHeader(),
        Depth: depth,
        'Content-Type': 'application/xml; charset=utf-8'
      },
      body:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<d:propfind xmlns:d="DAV:"><d:prop>' +
        '<d:resourcetype/><d:getcontentlength/><d:getlastmodified/>' +
        '</d:prop></d:propfind>',
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 404) return { exists: false, items: [] };
    if (res.status !== 207 && !res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV PROPFIND ${res.status}: ${text.slice(0, 200)}`);
    }
    const xml = await res.text();
    return { exists: true, items: parseMultistatus(xml) };
  }

  normalizeUrl(targetUrl) {
    try {
      return new URL(targetUrl, this.baseUrl).href;
    } catch (_) {
      return targetUrl;
    }
  }

  sameUrl(a, b) {
    const norm = (u) => {
      try {
        return decodeURIComponent(new URL(u, this.baseUrl).pathname).replace(/\/+$/, '');
      } catch (_) {
        return String(u).replace(/\/+$/, '');
      }
    };
    return norm(a) === norm(b);
  }

  async listFolder(folderId = null) {
    const target = folderId ? this.normalizeUrl(folderId) : await this.ensureRootBackupFolder();
    const { items } = await this.propfind(target, '1');
    const result = [];
    for (const item of items) {
      if (this.sameUrl(item.href, target)) continue;
      result.push({
        id: this.normalizeUrl(item.href),
        name: item.name,
        isDir: item.isDir,
        size: item.size,
        modifiedTime: item.modifiedTime
      });
    }
    result.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return result;
  }

  childUrl(parentUrl, name) {
    const parent = parentUrl.endsWith('/') ? parentUrl : parentUrl + '/';
    return parent + encodeURIComponent(name);
  }

  async ensureFolder(name, parentId = null) {
    const parent = parentId ? this.normalizeUrl(parentId) : this.baseUrl;
    const target = this.childUrl(parent, name) + '/';

    const check = await this.propfind(target, '0').catch(() => ({ exists: false }));
    if (check.exists) return target;

    const res = await fetch(target, {
      method: 'MKCOL',
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(60000)
    });

    if (res.status === 201 || res.status === 405) return target;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV MKCOL ${res.status}: ${text.slice(0, 200)}`);
    }
    return target;
  }

  async ensureRootBackupFolder() {
    if (this.rootFolderUrl) return this.rootFolderUrl;

    const targetUrl = this.childUrl(this.baseUrl, ROOT_BACKUP_FOLDER_NAME) + '/';
    const check = await this.propfind(targetUrl, '0').catch(() => ({ exists: false }));
    if (check.exists) {
      this.rootFolderUrl = targetUrl;
      return targetUrl;
    }

    // Upgrade path: rename the legacy root folder so previous backups stay in place
    try {
      const legacyUrl = this.childUrl(this.baseUrl, LEGACY_ROOT_BACKUP_FOLDER_NAME) + '/';
      const legacyCheck = await this.propfind(legacyUrl, '0').catch(() => ({ exists: false }));
      if (legacyCheck.exists) {
        const res = await fetch(legacyUrl, {
          method: 'MOVE',
          headers: {
            Authorization: this.authHeader(),
            Destination: targetUrl,
            Overwrite: 'F'
          },
          signal: AbortSignal.timeout(60000)
        });
        if (res.ok || res.status === 201 || res.status === 204) {
          this.rootFolderUrl = targetUrl;
          return targetUrl;
        }
      }
    } catch (_) {}

    this.rootFolderUrl = await this.ensureFolder(ROOT_BACKUP_FOLDER_NAME, this.baseUrl);
    return this.rootFolderUrl;
  }

  async getRootFolderId() {
    return this.ensureRootBackupFolder();
  }

  async uploadFile({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize = null, onProgress = null, throttle = null }) {
    const size = fileSize != null ? fileSize : fs.statSync(localPath).size;
    const target = existingDriveFileId
      ? this.normalizeUrl(existingDriveFileId)
      : this.childUrl(this.normalizeUrl(parentFolderId), fileName);

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

    const res = await fetch(target, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader(),
        'Content-Length': String(size),
        'Content-Type': 'application/octet-stream'
      },
      body: stream,
      duplex: 'half',
      signal: AbortSignal.timeout(600000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV PUT ${res.status}: ${text.slice(0, 200)}`);
    }

    return { driveFileId: target, md5Checksum: null, size: String(size), name: fileName };
  }

  async downloadFile({ fileId, destPath, onProgress = null }) {
    const target = this.normalizeUrl(fileId);
    const res = await fetch(target, {
      ...this.requestOptions(),
      signal: AbortSignal.timeout(600000)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV GET ${res.status}: ${text.slice(0, 200)}`);
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
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
    const source = this.normalizeUrl(sourceId);
    const parent = destParentId ? this.normalizeUrl(destParentId) : this.baseUrl;
    const target = this.childUrl(parent, name);
    const res = await fetch(source, {
      method: 'COPY',
      headers: {
        Authorization: this.authHeader(),
        Destination: target,
        Overwrite: 'T'
      },
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok && res.status !== 201 && res.status !== 204) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV COPY ${res.status}: ${text.slice(0, 200)}`);
    }
    return { id: target, name, size: 0, md5Checksum: null };
  }

  async trashFile(fileId) {
    const target = this.normalizeUrl(fileId);
    const res = await fetch(target, {
      method: 'DELETE',
      headers: { Authorization: this.authHeader() },
      signal: AbortSignal.timeout(60000)
    });
    // 404 means it is already gone
    if (res.status === 404) {
      return { id: fileId, trashed: false, missing: true };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WebDAV DELETE ${res.status}: ${text.slice(0, 200)}`);
    }
    return { id: fileId, trashed: true };
  }

  async testConnection() {
    const { exists } = await this.propfind(this.baseUrl, '0');
    if (!exists) {
      // Some servers reject depth-0 on the base; try listing depth 1
      const res = await this.propfind(this.baseUrl, '1');
      if (!res.exists) throw new Error('WebDAV server did not respond');
    }
    return true;
  }

  async wipeTraces(onProgress = null) {
    return await this.formatCloud(onProgress);
  }

  // Format / wipe WebDAV AuraSync backup down to 0 GB
  async formatCloud(onProgress = null) {
    let deletedCount = 0;
    const folders = [ROOT_BACKUP_FOLDER_NAME, LEGACY_ROOT_BACKUP_FOLDER_NAME];
    for (const f of folders) {
      try {
        const target = `${this.baseUrl}${f}/`;
        if (onProgress) onProgress({ current: deletedCount + 1, total: deletedCount + 1, name: f });
        const result = await this.trashFile(target);
        if (result.trashed) deletedCount++;
      } catch (_) {}
    }
    this.rootFolderUrl = null;
    return { success: true, deletedCount };
  }
}

module.exports = { WebDAVProvider, parseMultistatus };
