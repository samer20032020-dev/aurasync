const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const ROOT_BACKUP_FOLDER_NAME = 'AuraSync';
const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function awsUriEncode(input, encodeSlash = true) {
  let out = '';
  const bytes = Buffer.from(String(input), 'utf8');
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '-' || ch === '_' || ch === '.' || ch === '~'
    ) {
      out += ch;
    } else if (ch === '/' && !encodeSlash) {
      out += ch;
    } else {
      out += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function amzDateNow() {
  const d = new Date();
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ---------- SigV4 ----------

function buildCanonicalRequest({ method, canonicalUri, canonicalQuery, headers, payloadHash }) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[String(key).toLowerCase()] = String(value).trim();
  }
  const sortedHeaderNames = Object.keys(lower).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${lower[name]}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderNames.join(';');

  return [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
}

function signRequest({ method, endpoint, bucket, key, query = {}, payloadHash = EMPTY_SHA256, region, accessKeyId, secretAccessKey, service = 's3', extraHeaders = {}, dateOverride = null }) {
  const url = new URL(endpoint);
  const host = url.host;

  const encodedKey = key
    ? key.split('/').filter((s) => s.length > 0).map((s) => awsUriEncode(s)).join('/')
    : '';

  // Virtual-hosted style when the endpoint host already contains the bucket
  const hostHasBucket = host.toLowerCase().startsWith(`${bucket.toLowerCase()}.`) || host.split(':')[0].toLowerCase() === bucket.toLowerCase();
  const canonicalUri = hostHasBucket
    ? `/${encodedKey}`
    : `/${awsUriEncode(bucket)}${encodedKey ? '/' + encodedKey : ''}`;

  const queryEntries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [awsUriEncode(k), awsUriEncode(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const canonicalQuery = queryEntries.map(([k, v]) => `${k}=${v}`).join('&');

  const now = amzDateNow();
  const amzDate = dateOverride || now.amzDate;
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders
  };

  const canonicalRequest = buildCanonicalRequest({
    method,
    canonicalUri,
    canonicalQuery,
    headers,
    payloadHash
  });

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(';');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalUrl = `${endpoint.replace(/\/+$/, '')}${canonicalUri}${canonicalQuery ? '?' + canonicalQuery : ''}`;

  return {
    url: finalUrl,
    headers: {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash
    }
  };
}

// ---------- XML parsing (ListObjectsV2) ----------

function parseListObjects(xml) {
  const folders = [];
  const files = [];
  if (!xml) return { folders, files, nextToken: null };

  const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentRegex.exec(xml)) !== null) {
    const block = match[1];
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
    const sizeMatch = block.match(/<Size>([\s\S]*?)<\/Size>/);
    const modifiedMatch = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/);
    if (!keyMatch) continue;
    files.push({
      key: decodeXmlEntities(keyMatch[1]),
      size: sizeMatch ? parseInt(sizeMatch[1], 10) || 0 : 0,
      modifiedTime: modifiedMatch ? modifiedMatch[1] : null
    });
  }

  const prefixRegex = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g;
  while ((match = prefixRegex.exec(xml)) !== null) {
    const prefixMatch = match[1].match(/<Prefix>([\s\S]*?)<\/Prefix>/);
    if (prefixMatch) folders.push(decodeXmlEntities(prefixMatch[1]));
  }

  const tokenMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  return { folders, files, nextToken: tokenMatch ? decodeXmlEntities(tokenMatch[1]) : null };
}

class S3Provider {
  constructor(account, secret) {
    this.account = account;
    this.id = account.id;
    this.type = 's3';
    this.label = account.label || 'S3 Storage';
    this.config = account.config || {};
    this.secret = secret || {};
    this.endpoint = String(this.config.endpoint || '').trim().replace(/\/+$/, '');
    this.bucket = String(this.config.bucket || '').trim();
    this.region = String(this.config.region || 'us-east-1').trim();
    this.accessKeyId = String(this.config.accessKeyId || '').trim();
    this.secretAccessKey = this.secret.secretAccessKey || '';

    // AWS requires virtual-hosted-style requests for buckets created after 2020.
    // Auto-upgrade plain *.amazonaws.com endpoints (unless pathStyle is forced).
    try {
      const u = new URL(this.endpoint);
      const isAws = /(^|\.)amazonaws\.com$/i.test(u.hostname);
      const pathStyle = this.config.pathStyle === true || this.config.pathStyle === 'true';
      if (!pathStyle && this.bucket && isAws && !u.host.toLowerCase().startsWith(`${this.bucket.toLowerCase()}.`)) {
        this.endpoint = `${u.protocol}//${this.bucket}.${u.host}`;
      }
    } catch (_) {}
  }

  isConfigured() {
    return !!(this.endpoint && this.bucket && this.accessKeyId && this.secretAccessKey);
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
      user: { name: `${this.bucket}`, email: this.endpoint },
      storage: null
    };
  }

  async initialize() {
    return { connected: this.isConnected() };
  }

  // Unified provider interface: S3-compatible services have no standard quota API
  getStorageState() {
    return null;
  }

  isQuotaFull() {
    return false;
  }

  async signedFetch({ method, key, query, payloadHash, body, headers = {} }) {
    const signed = signRequest({
      method,
      endpoint: this.endpoint,
      bucket: this.bucket,
      key,
      query,
      payloadHash: payloadHash || EMPTY_SHA256,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      extraHeaders: headers
    });

    const options = {
      method,
      headers: {
        ...signed.headers,
        ...headers
      },
      signal: AbortSignal.timeout(600000)
    };
    if (body !== undefined) {
      options.body = body;
      if (body && typeof body.pipe === 'function') options.duplex = 'half';
    }
    return fetch(signed.url, options);
  }

  async listFolder(folderId = null) {
    const prefix = folderId || await this.ensureRootBackupFolder();
    const items = [];
    let continuationToken = null;

    do {
      const query = {
        'list-type': '2',
        delimiter: '/',
        prefix
      };
      if (continuationToken) query['continuation-token'] = continuationToken;

      const res = await this.signedFetch({ method: 'GET', key: '', query });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`S3 ListObjects ${res.status}: ${text.slice(0, 200)}`);
      }
      const xml = await res.text();
      const parsed = parseListObjects(xml);

      for (const folderPrefix of parsed.folders) {
        const name = folderPrefix.slice(prefix.length).replace(/\/+$/, '');
        if (!name) continue;
        items.push({ id: folderPrefix, name, isDir: true, size: 0, modifiedTime: null });
      }
      for (const file of parsed.files) {
        const name = file.key.slice(prefix.length);
        if (!name || name.endsWith('/')) continue;
        items.push({
          id: file.key,
          name,
          isDir: false,
          size: file.size,
          modifiedTime: file.modifiedTime ? file.modifiedTime.replace('T', ' ').slice(0, 19) : null
        });
      }
      continuationToken = parsed.nextToken;
    } while (continuationToken);

    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return items;
  }

  async ensureFolder(name, parentPrefix = null) {
    const parent = parentPrefix !== null && parentPrefix !== undefined
      ? parentPrefix
      : '';
    const prefix = `${parent}${name}/`;
    // S3 has no real folders; a prefix is enough (created implicitly on first upload)
    return prefix;
  }

  async ensureRootBackupFolder() {
    return `${ROOT_BACKUP_FOLDER_NAME}/`;
  }

  async getRootFolderId() {
    return this.ensureRootBackupFolder();
  }

  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async uploadFile({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize = null, onProgress = null, throttle = null }) {
    const size = fileSize != null ? fileSize : fs.statSync(localPath).size;
    const key = existingDriveFileId || `${parentFolderId || ''}${fileName}`;
    const payloadHash = await this.hashFile(localPath);

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

    const res = await this.signedFetch({
      method: 'PUT',
      key,
      payloadHash,
      body: stream,
      headers: {
        'Content-Length': String(size),
        'Content-Type': 'application/octet-stream'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 PutObject ${res.status}: ${text.slice(0, 200)}`);
    }

    return { driveFileId: key, md5Checksum: null, size: String(size), name: fileName };
  }

  async downloadFile({ fileId, destPath, onProgress = null }) {
    const res = await this.signedFetch({ method: 'GET', key: fileId });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 GetObject ${res.status}: ${text.slice(0, 200)}`);
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
    const destKey = `${destParentId || ''}${name}`;
    const copySource = '/' + this.bucket + '/' + String(sourceId).split('/').map((s) => awsUriEncode(s)).join('/');
    const res = await this.signedFetch({
      method: 'PUT',
      key: destKey,
      payloadHash: EMPTY_SHA256,
      headers: {
        'x-amz-copy-source': copySource,
        'Content-Length': '0'
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 CopyObject ${res.status}: ${text.slice(0, 200)}`);
    }
    return { id: destKey, name, size: 0, md5Checksum: null };
  }

  async trashFile(fileId) {
    const res = await this.signedFetch({ method: 'DELETE', key: fileId });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 DeleteObject ${res.status}: ${text.slice(0, 200)}`);
    }
    return { id: fileId, trashed: true };
  }

  async testConnection() {
    const res = await this.signedFetch({
      method: 'GET',
      key: '',
      query: { 'list-type': '2', 'max-keys': '1' }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 connection failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return true;
  }

  async wipeTraces(onProgress = null) {
    return await this.formatCloud(onProgress);
  }

  // Format / wipe S3 AuraSync backup objects down to 0 GB
  async formatCloud(onProgress = null) {
    let deletedCount = 0;
    const prefixes = [ROOT_BACKUP_FOLDER_NAME + '/', LEGACY_ROOT_BACKUP_FOLDER_NAME + '/'];

    for (const prefix of prefixes) {
      let continuationToken = null;
      do {
        const query = { 'list-type': '2', prefix, 'max-keys': '1000' };
        if (continuationToken) query['continuation-token'] = continuationToken;

        const res = await this.signedFetch({ method: 'GET', key: '', query });
        if (!res.ok) break;
        const xml = await res.text();
        const parsed = parseListObjects(xml);

        for (const file of parsed.files) {
          if (onProgress) {
            onProgress({ current: deletedCount + 1, total: deletedCount + 1, name: file.key });
          }
          try {
            const delRes = await this.signedFetch({ method: 'DELETE', key: file.key });
            if (delRes.ok) deletedCount++;
          } catch (_) {}
        }
        continuationToken = parsed.nextToken;
      } while (continuationToken);
    }

    return { success: true, deletedCount };
  }
}

module.exports = { S3Provider, signRequest, awsUriEncode, parseListObjects, hmacSha256, sha256Hex };
