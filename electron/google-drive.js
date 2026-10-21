const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
let googleLib = null;
function getGoogle() {
  if (!googleLib) {
    const { google } = require('googleapis');
    googleLib = google;
  }
  return googleLib;
}
const { shell, app } = require('electron');
const oauthPage = require('./oauth-page');
const providerCredentials = require('./provider-credentials');
const { listenWithFallback } = require('./oauth-server');

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Access to files created or opened by the app
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

const ROOT_BACKUP_FOLDER_NAME = 'AuraSync';
const LEGACY_ROOT_BACKUP_FOLDER_NAME = 'My Secure Cloud Backup';
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024; // Drive simple/multipart limit
const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;

class GoogleDriveService {
  constructor() {
    this.id = 'google';
    this.label = 'Google Drive';
    this.oauth2Client = null;
    this.drive = null;
    this.userInfo = null;
    this.credentialsPath = this.resolveCredentialsPath();
    this.tokenPath = this.resolveTokenPath();
    this.rootFolderId = null;
    this._ensureRootPromise = null;
    this.activeLoopbackServer = null;
    this.storageQuota = null;
    this.uploadLocks = new Map();
    this._folderPromises = new Map();
    this.parentFolderFilesCache = new Map();
  }

  isConfigured() {
    try {
      this.loadCredentials();
      return true;
    } catch (_) {
      return false;
    }
  }

  isConnected() {
    return !!this.drive;
  }

  getStatusInfo() {
    return {
      id: this.id,
      label: this.label,
      configured: this.isConfigured(),
      connected: this.isConnected(),
      user: this.userInfo,
      storage: this.storageQuota,
      credentialsPath: this.credentialsPath
    };
  }

  resolveCredentialsPath() {
    const candidates = [
      path.join(path.dirname(process.execPath || ''), 'credentials.json'),
      path.join(process.cwd(), 'credentials.json'),
      path.join(__dirname, '..', 'credentials.json'),
      path.join((app && typeof app.getAppPath === 'function') ? app.getAppPath() : process.cwd(), 'credentials.json'),
      path.join(process.resourcesPath || '', 'app', 'credentials.json'),
      path.join(process.resourcesPath || '', 'credentials.json')
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }

    // Check for any client_secret*.json in all possible dirs
    const searchDirs = [
      path.dirname(process.execPath || ''),
      process.cwd(),
      path.join(__dirname, '..'),
      process.resourcesPath || ''
    ];
    for (const dir of searchDirs) {
      if (dir && fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          const secretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
          if (secretFile) return path.join(dir, secretFile);
        } catch (_) {}
      }
    }

    return path.join(process.cwd(), 'credentials.json');
  }

  resolveTokenPath() {
    try {
      const userData = (app && typeof app.getPath === 'function') ? app.getPath('userData') : process.cwd();
      return path.join(userData, 'token.json');
    } catch (e) {
      return path.join(process.cwd(), 'token.json');
    }
  }

  loadCredentials() {
    let key = null;

    if (fs.existsSync(this.credentialsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
        key = parsed.installed || parsed.web || parsed;
      } catch (_) {}
    }

    if (!key) {
      const embedded = providerCredentials.get('google');
      if (embedded) key = embedded.installed || embedded.web || embedded;
    }

    if (!key || !key.client_id || !key.client_secret) {
      throw new Error(
        'Google Drive is not activated: add a "google" section to provider-credentials.json (or keep credentials.json next to the app).'
      );
    }

    return {
      clientId: key.client_id,
      clientSecret: key.client_secret,
      redirectUris: key.redirect_uris || ['http://localhost']
    };
  }

  async initialize() {
    try {
      const creds = this.loadCredentials();
      // We will set redirectUri dynamically when starting login, or default to loopback
      this.oauth2Client = new (getGoogle().auth.OAuth2)(
        creds.clientId,
        creds.clientSecret,
        'http://localhost:58291'
      );

      // Listen for token updates
      this.oauth2Client.on('tokens', (tokens) => {
        this.saveTokens(tokens);
      });

      // Try loading saved token
      if (fs.existsSync(this.tokenPath)) {
        const tokenContent = fs.readFileSync(this.tokenPath, 'utf8');
        const tokens = JSON.parse(tokenContent);
        this.oauth2Client.setCredentials(tokens);
        this.drive = getGoogle().drive({ version: 'v3', auth: this.oauth2Client });

        // Verify token validity
        try {
          await this.fetchUserProfile();
          await this.ensureRootBackupFolder();
          return { authenticated: true, user: this.userInfo };
        } catch (authErr) {
          console.warn('Saved token expired or invalid:', authErr.message);
          // Drop the stale client so the UI reports "not connected" instead of green
          this.drive = null;
          this.oauth2Client = null;
          this.userInfo = null;
          this.storageQuota = null;
          this.rootFolderId = null;
          return { authenticated: false, error: 'Token expired, re-auth required' };
        }
      }

      return { authenticated: false };
    } catch (err) {
      console.error('Initialization error:', err.message);
      return { authenticated: false, error: err.message };
    }
  }

  saveTokens(tokens) {
    try {
      let existing = {};
      if (fs.existsSync(this.tokenPath)) {
        existing = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      }
      const combined = { ...existing, ...tokens };
      // Only ever persist the token inside the app's private userData folder.
      // Never write token copies into the project/install directory (that leaks
      // long-lived refresh tokens when the app folder is shared or packaged).
      fs.writeFileSync(this.tokenPath, JSON.stringify(combined, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed saving tokens:', e);
    }
  }

  async startOAuthFlow(port = 58291) {
    if (this.activeLoopbackServer) {
      try { this.activeLoopbackServer.close(); } catch (_) {}
      this.activeLoopbackServer = null;
    }

    const creds = this.loadCredentials();
    const state = crypto.randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
      let resolved = false;

      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url, true);
          const query = parsedUrl.query || {};

          if (query.error) {
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(oauthPage.errorHtml({ message: query.error, language: oauthPage.appLanguage() }));
            }
            reject(new Error(query.error));
            try { server.close(); } catch (_) {}
            return;
          }

          if (!query.code) return;

          // CSRF protection: the state must match the one we sent
          if (query.state !== state) {
            if (!res.headersSent) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(oauthPage.errorHtml({ message: 'Invalid OAuth state. Please try again.', language: oauthPage.appLanguage() }));
            }
            reject(new Error('OAuth state mismatch (possible CSRF)'));
            try { server.close(); } catch (_) {}
            return;
          }

          const code = query.code;

          // Exchange code for tokens BEFORE showing success to the browser
          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);
          this.saveTokens(tokens);

          this.drive = getGoogle().drive({ version: 'v3', auth: this.oauth2Client });
          await this.fetchUserProfile();
          await this.ensureRootBackupFolder();

          resolved = true;
          if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(oauthPage.successHtml({ provider: 'Google Drive', language: oauthPage.appLanguage() }));
          }
          resolve({ success: true, user: this.userInfo });

          // Gracefully stop loopback server
          setTimeout(() => {
            try { server.close(); } catch (_) {}
          }, 1500);
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
          const redirectUri = `http://localhost:${actualPort}`;
          this.oauth2Client = new (getGoogle().auth.OAuth2)(
            creds.clientId,
            creds.clientSecret,
            redirectUri
          );
          this.oauth2Client.on('tokens', (tokens) => {
            this.saveTokens(tokens);
          });
          const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: SCOPES,
            state
          });
          // Runtime errors after a successful bind
          server.on('error', (err) => {
            if (!resolved) reject(err);
          });
          shell.openExternal(authUrl);
        } catch (err) {
          if (!resolved) reject(err);
        }
      };
      startServer();

      // Timeout after 3 minutes if user didn't authenticate
      setTimeout(() => {
        if (!resolved) {
          try { server.close(); } catch (_) {}
          reject(new Error('Authentication timed out. Please try again.'));
        }
      }, 180000);
    });
  }

  async logout() {
    this.oauth2Client = null;
    this.drive = null;
    this.userInfo = null;
    this.rootFolderId = null;
    this.storageQuota = null;

    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
      // Clean up legacy token copies written by older versions of the app
      const legacyRootToken = path.join(process.cwd(), 'token.json');
      if (fs.existsSync(legacyRootToken)) {
        fs.unlinkSync(legacyRootToken);
      }
    } catch (e) {
      console.error('Error removing token:', e);
    }

    return { loggedOut: true };
  }

  async fetchUserProfile() {
    if (!this.oauth2Client) throw new Error('Not authenticated');
    
    try {
      const oauth2 = getGoogle().oauth2({ version: 'v2', auth: this.oauth2Client });
      const userRes = await oauth2.userinfo.get();
      
      const drive = getGoogle().drive({ version: 'v3', auth: this.oauth2Client });
      let storageQuota = null;
      try {
        const aboutRes = await drive.about.get({ fields: 'storageQuota, user' });
        storageQuota = aboutRes.data.storageQuota;
      } catch (_) {}

      this.userInfo = {
        name: userRes.data.name || 'Google User',
        email: userRes.data.email,
        picture: userRes.data.picture,
        storageQuota: storageQuota ? {
          limit: storageQuota.limit ? parseInt(storageQuota.limit, 10) : null,
          usage: storageQuota.usage ? parseInt(storageQuota.usage, 10) : 0,
          usageInDrive: storageQuota.usageInDrive ? parseInt(storageQuota.usageInDrive, 10) : 0,
        } : null
      };
      this.storageQuota = this.userInfo.storageQuota;

      return this.userInfo;
    } catch (err) {
      console.error('Error fetching user profile:', err);
      throw err;
    }
  }

  getStorageState() {
    return this.storageQuota || null;
  }

  isQuotaFull() {
    if (!this.storageQuota || !this.storageQuota.limit) return false;
    return this.storageQuota.usage >= this.storageQuota.limit;
  }

  // Root folder used by the cloud browser / transfer tool
  async getRootFolderId() {
    return this.ensureRootBackupFolder();
  }

  // List children of a folder (null = app backup root)
  async listFolder(folderId = null) {
    if (!this.drive) throw new Error('Google Drive is not connected');
    const parent = folderId || await this.ensureRootBackupFolder();
    const items = [];
    let pageToken = null;
    do {
      const res = await this.drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        pageSize: 1000,
        pageToken: pageToken || undefined,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      for (const f of res.data.files || []) {
        const fn = (f.name || '').toLowerCase();
        if (fn === 'desktop.ini') continue;
        items.push({
          id: f.id,
          name: f.name,
          isDir: f.mimeType === 'application/vnd.google-apps.folder',
          size: f.size ? parseInt(f.size, 10) : 0,
          modifiedTime: f.modifiedTime || null
        });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return items;
  }

  async ensureRootBackupFolder() {
    if (this.rootFolderId) return this.rootFolderId;
    if (!this.drive) throw new Error('Google Drive API client not initialized');

    if (this._ensureRootPromise) return this._ensureRootPromise;

    this._ensureRootPromise = (async () => {
      try {
        const findByName = async (name) => {
          const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false and 'root' in parents`;
          const res = await this.drive.files.list({
            q,
            fields: 'files(id, name)',
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          return res.data.files && res.data.files.length > 0 ? res.data.files : [];
        };

        // Search for the current root folder
        const existing = await findByName(ROOT_BACKUP_FOLDER_NAME);
        if (existing.length > 0) {
          this.rootFolderId = existing[0].id;
          return this.rootFolderId;
        }

        // Upgrade path: rename the legacy root folder so previous backups stay in place
        try {
          const legacy = await findByName(LEGACY_ROOT_BACKUP_FOLDER_NAME);
          if (legacy.length > 0) {
            await this.drive.files.update({
              fileId: legacy[0].id,
              requestBody: { name: ROOT_BACKUP_FOLDER_NAME },
              fields: 'id, name',
              supportsAllDrives: true,
            });
            this.rootFolderId = legacy[0].id;
            return this.rootFolderId;
          }
        } catch (_) {}

        // Create root folder
        const folderMetadata = {
          name: ROOT_BACKUP_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root'],
          description: 'Automated desktop backups protected with Zero-Deletion Policy'
        };

        const createRes = await this.drive.files.create({
          requestBody: folderMetadata,
          fields: 'id, name',
          supportsAllDrives: true,
        });

        this.rootFolderId = createRes.data.id;
        return this.rootFolderId;
      } finally {
        this._ensureRootPromise = null;
      }
    })();

    return this._ensureRootPromise;
  }

  async ensureMobileFolder() {
    if (this.mobileFolderId) return this.mobileFolderId;
    if (!this.drive) throw new Error('Google Drive API client not initialized');

    try {
      const MOBILE_NAME = 'aurasync-mobile';
      const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${MOBILE_NAME}' and trashed = false and 'root' in parents`;
      const res = await this.drive.files.list({
        q,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (res.data.files && res.data.files.length > 0) {
        this.mobileFolderId = res.data.files[0].id;
        return this.mobileFolderId;
      }
      const createRes = await this.drive.files.create({
        requestBody: {
          name: MOBILE_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root'],
          description: 'AuraSync Mobile gallery & media cloud storage'
        },
        fields: 'id, name',
        supportsAllDrives: true,
      });
      this.mobileFolderId = createRes.data.id;
      return this.mobileFolderId;
    } catch (err) {
      console.warn('ensureMobileFolder warning:', err.message);
      return null;
    }
  }

  async deduplicateChildFolders(parentFolderId = null) {
    if (!this.drive) return;
    try {
      const parent = parentFolderId || await this.ensureRootBackupFolder();
      const res = await this.drive.files.list({
        q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      const files = res.data.files || [];
      const groups = new Map();
      for (const f of files) {
        const key = (f.name || '').trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
      }
      for (const [name, list] of groups.entries()) {
        if (list.length > 1) {
          let bestId = list[0].id;
          let bestCount = -1;
          for (const f of list) {
            try {
              const childRes = await this.drive.files.list({
                q: `'${f.id}' in parents and trashed = false`,
                fields: 'files(id)',
                pageSize: 10,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true
              });
              const count = (childRes.data.files || []).length;
              if (count > bestCount) {
                bestCount = count;
                bestId = f.id;
              }
            } catch (_) {}
          }
          for (const f of list) {
            if (f.id !== bestId) {
              try {
                const children = await this.drive.files.list({
                  q: `'${f.id}' in parents and trashed = false`,
                  fields: 'files(id)',
                  pageSize: 1000,
                  supportsAllDrives: true,
                  includeItemsFromAllDrives: true
                });
                for (const child of (children.data.files || [])) {
                  try {
                    await this.drive.files.update({
                      fileId: child.id,
                      addParents: bestId,
                      removeParents: f.id,
                      supportsAllDrives: true
                    });
                  } catch (_) {}
                }
                await this.drive.files.update({
                  fileId: f.id,
                  requestBody: { trashed: true },
                  supportsAllDrives: true
                });
              } catch (_) {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('deduplicateChildFolders error:', err.message);
    }
  }

  async ensureFolder(folderName, parentFolderId) {
    if (!this.drive) throw new Error('Google Drive client not initialized');

    if (!this._folderPromises) this._folderPromises = new Map();
    const lockKey = `${parentFolderId}::${folderName.toLowerCase()}`;
    if (this._folderPromises.has(lockKey)) {
      return this._folderPromises.get(lockKey);
    }

    const promise = (async () => {
      try {
        // Clean folderName to prevent query break (escape backslashes and single quotes)
        const cleanName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanName}' and trashed = false and '${parentFolderId}' in parents`;
        
        const res = await this.drive.files.list({
          q,
          fields: 'files(id, name)',
          spaces: 'drive',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        if (res.data.files && res.data.files.length > 0) {
          const files = res.data.files;
          let primaryId = files[0].id;

          // If duplicate folders with the exact same name exist, consolidate and remove duplicates:
          if (files.length > 1) {
            let bestId = primaryId;
            let bestCount = -1;
            for (const f of files) {
              try {
                const childRes = await this.drive.files.list({
                  q: `'${f.id}' in parents and trashed = false`,
                  fields: 'files(id)',
                  pageSize: 10,
                  supportsAllDrives: true,
                  includeItemsFromAllDrives: true
                });
                const count = (childRes.data.files || []).length;
                if (count > bestCount) {
                  bestCount = count;
                  bestId = f.id;
                }
              } catch (_) {}
            }
            primaryId = bestId;

            // Move any orphaned children and trash duplicate folders
            for (const f of files) {
              if (f.id !== primaryId) {
                try {
                  const children = await this.drive.files.list({
                    q: `'${f.id}' in parents and trashed = false`,
                    fields: 'files(id)',
                    pageSize: 1000,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true
                  });
                  for (const child of (children.data.files || [])) {
                    try {
                      await this.drive.files.update({
                        fileId: child.id,
                        addParents: primaryId,
                        removeParents: f.id,
                        supportsAllDrives: true
                      });
                    } catch (_) {}
                  }
                  await this.drive.files.update({
                    fileId: f.id,
                    requestBody: { trashed: true },
                    supportsAllDrives: true
                  });
                } catch (_) {}
              }
            }
          }

          return primaryId;
        }

        // Create folder
        const createRes = await this.drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId]
          },
          fields: 'id, name',
          supportsAllDrives: true,
        });

        return createRes.data.id;
      } finally {
        this._folderPromises.delete(lockKey);
      }
    })();

    this._folderPromises.set(lockKey, promise);
    return promise;
  }

  // Upload or update file (Zero-deletion policy: preserves file and creates/updates revisions)
  async uploadFile({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize = null, onProgress = null, throttle = null }) {
    if (!this.drive) throw new Error('Google Drive client not initialized');
    if (!fs.existsSync(localPath)) throw new Error(`File does not exist: ${localPath}`);

    const size = fileSize != null ? fileSize : fs.statSync(localPath).size;
    const resolvedName = fileName || path.basename(localPath);
    const resolvedNameLower = (resolvedName || '').toLowerCase();
    if (resolvedNameLower === 'desktop.ini') {
      return { driveFileId: null, skipped: true };
    }

    // Concurrency guard: serialize uploads for the exact same destination folder and file name
    // to prevent simultaneous uploads from creating duplicate files in Google Drive.
    const lockKey = `${parentFolderId || 'root'}::${resolvedName.toLowerCase()}`;
    while (this.uploadLocks && this.uploadLocks.has(lockKey)) {
      try {
        await this.uploadLocks.get(lockKey);
      } catch (_) {}
    }

    let resolveLock;
    const lockPromise = new Promise((resolve) => { resolveLock = resolve; });
    if (!this.uploadLocks) this.uploadLocks = new Map();
    this.uploadLocks.set(lockKey, lockPromise);

    try {
      // Prevent duplicate file creation on Drive:
      // Check in-memory folder cache first to avoid 1 network roundtrip per file!
      let targetDriveFileId = existingDriveFileId;
      if (!targetDriveFileId && parentFolderId) {
        if (!this.parentFolderFilesCache) this.parentFolderFilesCache = new Map();
        let folderCache = this.parentFolderFilesCache.get(parentFolderId);
        if (!folderCache) {
          folderCache = new Map();
          try {
            const q = `mimeType != 'application/vnd.google-apps.folder' and trashed = false and '${parentFolderId}' in parents`;
            const res = await this.drive.files.list({
              q,
              fields: 'files(id, name)',
              spaces: 'drive',
              pageSize: 1000,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            });
            if (res.data.files && res.data.files.length > 0) {
              for (const f of res.data.files) {
                if (f.name && f.id) folderCache.set(f.name.toLowerCase(), f.id);
              }
            }
          } catch (_) {}
          this.parentFolderFilesCache.set(parentFolderId, folderCache);
        }

        const cachedMatch = folderCache.get(resolvedName.toLowerCase());
        if (cachedMatch) {
          targetDriveFileId = cachedMatch;
        }
      }

      // Large files must use the resumable protocol (Drive limits simple/multipart uploads to 5MB)
      if (size >= RESUMABLE_THRESHOLD_BYTES) {
        return await this.resumableUpload({
          localPath,
          fileName: resolvedName,
          parentFolderId,
          existingDriveFileId: targetDriveFileId,
          fileSize: size,
          onProgress,
          throttle
        });
      }

      if (typeof throttle === 'function' && size > 0) {
        await throttle(size);
      }

      const fileStream = fs.createReadStream(localPath);
      if (onProgress) {
        let sent = 0;
        fileStream.on('data', (chunk) => {
          sent += chunk.length;
          onProgress(sent, size);
        });
      }

      if (targetDriveFileId) {
        // Update existing file content on Google Drive and ensure it is restored from trash
        try {
          const res = await this.drive.files.update({
            fileId: targetDriveFileId,
            requestBody: {
              trashed: false
            },
            media: {
              body: fileStream,
            },
            fields: 'id, name, md5Checksum, size, modifiedTime, trashed',
            supportsAllDrives: true,
          });

          if (this.parentFolderFilesCache && parentFolderId && res?.data?.id) {
            let fc = this.parentFolderFilesCache.get(parentFolderId);
            if (fc) fc.set(resolvedName.toLowerCase(), res.data.id);
          }

          return {
            driveFileId: res.data.id,
            md5Checksum: res.data.md5Checksum,
            size: res.data.size,
            name: res.data.name
          };
        } catch (updateErr) {
          // If the target file was deleted permanently or not found, fall back to creating a new file
          const isNotFound =
            updateErr?.code === 404 ||
            updateErr?.status === 404 ||
            /not found|file not found/i.test(updateErr?.message || '');
          if (!isNotFound) throw updateErr;

          const freshStream = fs.createReadStream(localPath);
          const res = await this.drive.files.create({
            requestBody: {
              name: resolvedName,
              parents: [parentFolderId]
            },
            media: {
              body: freshStream,
            },
            fields: 'id, name, md5Checksum, size, modifiedTime',
            supportsAllDrives: true,
          });

          if (this.parentFolderFilesCache && parentFolderId && res?.data?.id) {
            let fc = this.parentFolderFilesCache.get(parentFolderId);
            if (fc) fc.set(resolvedName.toLowerCase(), res.data.id);
          }

          return {
            driveFileId: res.data.id,
            md5Checksum: res.data.md5Checksum,
            size: res.data.size,
            name: res.data.name
          };
        }
      } else {
        // Create new file
        const res = await this.drive.files.create({
          requestBody: {
            name: resolvedName,
            parents: [parentFolderId]
          },
          media: {
            body: fileStream,
          },
          fields: 'id, name, md5Checksum, size, modifiedTime',
          supportsAllDrives: true,
        });

        if (this.parentFolderFilesCache && parentFolderId && res?.data?.id) {
          let fc = this.parentFolderFilesCache.get(parentFolderId);
          if (fc) fc.set(resolvedName.toLowerCase(), res.data.id);
        }

        return {
          driveFileId: res.data.id,
          md5Checksum: res.data.md5Checksum,
          size: res.data.size,
          name: res.data.name
        };
      }
    } finally {
      if (this.uploadLocks) this.uploadLocks.delete(lockKey);
      if (resolveLock) resolveLock();
    }
  }

  async getAccessToken() {
    if (!this.oauth2Client) throw new Error('Not authenticated');
    const tokenResponse = await this.oauth2Client.getAccessToken();
    const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse && tokenResponse.token;
    if (!token) throw new Error('Could not obtain a Google access token');
    return token;
  }

  async readChunk(filePath, start, end) {
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

  async initResumableSession({ fileName, parentFolderId, existingDriveFileId, fileSize }) {
    const accessToken = await this.getAccessToken();
    const base = 'https://www.googleapis.com/upload/drive/v3/files';
    const fields = 'id,name,md5Checksum,size,modifiedTime';
    const endpoint = existingDriveFileId
      ? `${base}/${existingDriveFileId}?uploadType=resumable&supportsAllDrives=true&fields=${fields}`
      : `${base}?uploadType=resumable&supportsAllDrives=true&fields=${fields}`;

    const metadata = existingDriveFileId
      ? { trashed: false }
      : { name: fileName, parents: [parentFolderId] };

    const res = await fetch(endpoint, {
      method: existingDriveFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(fileSize)
      },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      if (existingDriveFileId && (res.status === 404 || res.status === 403 || res.status === 410)) {
        return this.initResumableSession({ fileName, parentFolderId, existingDriveFileId: null, fileSize });
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Could not start resumable upload (${res.status}): ${text.slice(0, 300)}`);
    }

    const location = res.headers.get('location');
    if (!location) throw new Error('Resumable upload session URI missing in response');
    return location;
  }

  async queryResumableOffset(sessionUrl, fileSize) {
    try {
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': '0',
          'Content-Range': `bytes */${fileSize}`
        },
        signal: AbortSignal.timeout(30000)
      });
      if (res.status === 308) {
        const range = res.headers.get('range');
        if (range) {
          const match = range.match(/bytes=0-(\d+)/);
          if (match) return parseInt(match[1], 10) + 1;
        }
        return 0;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async resumableUpload({ localPath, fileName, parentFolderId, existingDriveFileId, fileSize, onProgress, throttle = null }) {
    const sessionUrl = await this.initResumableSession({
      fileName,
      parentFolderId,
      existingDriveFileId,
      fileSize
    });

    let offset = 0;
    let result = null;

    while (offset < fileSize) {
      const end = Math.min(offset + RESUMABLE_CHUNK_BYTES, fileSize) - 1;
      let attempt = 0;
      let chunkDone = false;

      while (!chunkDone) {
        try {
          const chunk = await this.readChunk(localPath, offset, end);
          if (typeof throttle === 'function') {
            await throttle(chunk.length);
          }
          const res = await fetch(sessionUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(chunk.length),
              'Content-Range': `bytes ${offset}-${end}/${fileSize}`
            },
            body: chunk,
            signal: AbortSignal.timeout(300000)
          });

          if (res.status === 308) {
            offset = end + 1;
            chunkDone = true;
            if (onProgress) onProgress(offset, fileSize);
          } else if (res.ok) {
            result = await res.json();
            offset = end + 1;
            chunkDone = true;
            if (onProgress) onProgress(fileSize, fileSize);
          } else {
            const text = await res.text().catch(() => '');
            throw new Error(`Drive resumable upload failed (${res.status}): ${text.slice(0, 300)}`);
          }
        } catch (err) {
          attempt++;
          if (attempt > 3) throw err;
          const serverOffset = await this.queryResumableOffset(sessionUrl, fileSize);
          if (serverOffset !== null && serverOffset > offset && serverOffset <= fileSize) {
            offset = serverOffset;
            if (onProgress) onProgress(offset, fileSize);
            // The whole chunk may have been received even though the response
            // was lost: leave the retry loop so `end` is recomputed.
            if (serverOffset > end) break;
          }
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // Finalize (also covers zero-byte files where the loop never ran)
    if (!result) {
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': '0',
          'Content-Range': `bytes */${fileSize}`
        },
        signal: AbortSignal.timeout(120000)
      });
      if (!res.ok && res.status !== 308) {
        const text = await res.text().catch(() => '');
        throw new Error(`Could not finalize resumable upload (${res.status}): ${text.slice(0, 300)}`);
      }
      result = await res.json();
    }

    if (!result || !result.id) {
      throw new Error('Resumable upload finished without a file id');
    }

    return {
      driveFileId: result.id,
      md5Checksum: result.md5Checksum || null,
      size: result.size || String(fileSize),
      name: result.name || fileName
    };
  }

  // Server-side copy (used by restore points — instant, no re-upload)
  async copyFile({ sourceId, destParentId, name }) {
    if (!this.drive) throw new Error('Google Drive client not initialized');
    const res = await this.drive.files.copy({
      fileId: sourceId,
      requestBody: {
        name: name || undefined,
        parents: destParentId ? [destParentId] : undefined
      },
      fields: 'id, name, size, md5Checksum',
      supportsAllDrives: true
    });
    return {
      id: res.data.id,
      name: res.data.name,
      size: res.data.size ? parseInt(res.data.size, 10) : 0,
      md5Checksum: res.data.md5Checksum || null
    };
  }

  // Move a file to the Google Drive trash (used by the optional full-mirror sync mode)
  async trashFile(fileId) {
    if (!this.drive) throw new Error('Google Drive client not initialized');
    const res = await this.drive.files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id, name, trashed',
      supportsAllDrives: true
    });
    return res.data;
  }

  // Restore a file from Google Drive back to the local disk
  async downloadFile({ fileId, destPath, onProgress = null }) {
    if (!this.drive) throw new Error('Google Drive client not initialized');

    const metaRes = await this.drive.files.get({
      fileId,
      fields: 'id,name,size',
      supportsAllDrives: true
    });
    const total = metaRes.data.size ? parseInt(metaRes.data.size, 10) : 0;

    const res = await this.drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    await new Promise((resolve, reject) => {
      let received = 0;
      const dest = fs.createWriteStream(destPath);
      res.data.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      res.data.on('error', reject);
      dest.on('error', reject);
      dest.on('finish', resolve);
      res.data.pipe(dest);
    });

    return { destPath, size: total };
  }

  // Run an async worker over items with a bounded concurrency pool.
  async _runPool(items, limit, worker) {
    const list = items || [];
    if (list.length === 0) return;
    let index = 0;
    const size = Math.max(1, Math.min(limit, list.length));
    const runners = [];
    for (let i = 0; i < size; i++) {
      runners.push((async () => {
        while (index < list.length) {
          const current = list[index++];
          try { await worker(current); } catch (_) {}
        }
      })());
    }
    await Promise.all(runners);
  }

  // Delete one Drive item permanently, retrying transient rate-limit errors and
  // falling back to trashing when a permanent delete is not permitted.
  async _deleteDriveItem(fileId) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await this.drive.files.delete({ fileId, supportsAllDrives: true });
        return true;
      } catch (err) {
        const status = err && (err.code || (err.response && err.response.status));
        const reason = (err && err.errors && err.errors[0] && err.errors[0].reason) ||
          (err && err.response && err.response.data && err.response.data.error && err.response.data.error.errors && err.response.data.error.errors[0] && err.response.data.error.errors[0].reason) || '';
        if (status === 404) return true; // already gone
        const rateLimited = status === 429 || (status === 403 && /rate.?limit|userRateLimit|quotaExceeded/i.test(String(reason)));
        if (rateLimited && attempt < 3) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1) + Math.floor(Math.random() * 200)));
          continue;
        }
        // Fall back to moving the item to the trash (recoverable, still frees quota once emptied)
        try {
          await this.drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
          return true;
        } catch (_) {
          return false;
        }
      }
    }
    return false;
  }

  // Delete a folder subtree. Discovers the whole tree first, then deletes all
  // files AND all folders in parallel batches (deepest folders first) so large
  // backups wipe in seconds instead of minutes. Falls back gracefully per item.
  async deleteFolderRecursively(folderId, onProgress = null, visited = new Set()) {
    if (!this.drive) throw new Error('Google Drive API client not initialized');
    if (!folderId || visited.has(folderId)) return 0;
    visited.add(folderId);

    // Instant fast-path: In Google Drive, trashing the root folder cascades to all children in 1 API call (~50ms)
    // Then emptyTrash asynchronously purges all contents in Google's cloud backend
    try {
      await this.drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
        supportsAllDrives: true
      });
      try {
        await this.drive.files.delete({ fileId: folderId, supportsAllDrives: true });
      } catch (_) {}
      if (onProgress) {
        try { onProgress({ current: 2, total: 3, name: 'تم حذف المجلد السحابي بنجاح' }); } catch (_) {}
      }
      return 1;
    } catch (_) {
      try {
        const directOk = await this._deleteDriveItem(folderId);
        if (directOk) {
          if (onProgress) {
            try { onProgress({ current: 2, total: 3, name: 'تم حذف المجلد السحابي بنجاح' }); } catch (_) {}
          }
          return 1;
        }
      } catch (_) {}
    }

    // Phase 1 — discover the entire subtree, remembering each folder's depth.
    const folders = [{ id: folderId, depth: 0 }];
    const files = [];
    const queue = [{ id: folderId, depth: 0 }];
    const seen = new Set([folderId]);

    while (queue.length) {
      const current = queue.shift();
      let pageToken = null;
      do {
        let res;
        try {
          res = await this.drive.files.list({
            q: `'${current.id}' in parents`,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageSize: 1000,
            pageToken: pageToken || undefined,
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
        } catch (err) {
          console.warn(`Error listing children of ${current.id}:`, err.message);
          break;
        }

        const items = res.data?.files || [];
        pageToken = res.data?.nextPageToken || null;

        for (const item of items) {
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              folders.push({ id: item.id, depth: current.depth + 1, name: item.name });
              queue.push({ id: item.id, depth: current.depth + 1 });
            }
          } else {
            files.push(item);
          }
        }
      } while (pageToken);
    }

    const total = files.length + folders.length;
    let done = 0;
    const report = (name) => {
      done++;
      if (onProgress) {
        try { onProgress({ current: done, total, name: name || '' }); } catch (_) {}
      }
    };

    // Phase 2 — delete all leaf files in high-speed parallel batches (safe bottom-up by nature).
    await this._runPool(files, 35, async (item) => {
      await this._deleteDriveItem(item.id);
      report(item.name);
    });

    // Phase 3 — delete folders deepest-first so parents are empty when removed.
    const orderedFolders = folders.slice().sort((a, b) => b.depth - a.depth);
    await this._runPool(orderedFolders, 20, async (folder) => {
      await this._deleteDriveItem(folder.id);
      report(folder.name);
    });

    return done;
  }

  // Remove every trace of AuraSync from Google Drive (permanently deletes/trashes all created files & folders)
  async wipeTraces(onProgress = null) {
    if (!this.drive) throw new Error('Google Drive client not initialized');

    let wipedCount = 0;
    if (onProgress) onProgress({ current: 1, total: 3, name: 'تحديد مجلدات AuraSync...' });

    // 1. Locate and remove ALL root backup folders (both active and trashed)
    const rootsToDelete = new Map();
    if (this.rootFolderId) {
      rootsToDelete.set(this.rootFolderId, { id: this.rootFolderId, name: ROOT_BACKUP_FOLDER_NAME });
    }

    const rootFolderNames = [ROOT_BACKUP_FOLDER_NAME, LEGACY_ROOT_BACKUP_FOLDER_NAME];
    for (const rootName of rootFolderNames) {
      try {
        const cleanRoot = rootName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const rootQ = `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanRoot}'`;
        const res = await this.drive.files.list({
          q: rootQ,
          fields: 'files(id, name)',
          pageSize: 50,
          spaces: 'drive',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });
        if (res.data?.files) {
          for (const f of res.data.files) {
            rootsToDelete.set(f.id, f);
          }
        }
      } catch (e) {
        console.warn('Error finding root backup folder:', e.message);
      }
    }

    if (onProgress) onProgress({ current: 2, total: 3, name: 'حذف البيانات السحابية بالكامل...' });

    const visited = new Set();
    for (const rf of rootsToDelete.values()) {
      try {
        let count = 0;
        const directOk = await this._deleteDriveItem(rf.id);
        if (directOk) {
          count = 1;
        } else {
          count = await this.deleteFolderRecursively(rf.id, onProgress, visited);
        }
        wipedCount += count;
      } catch (err) {
        console.warn(`Error wiping root ${rf.id}:`, err.message);
      }
    }

    if (onProgress) onProgress({ current: 3, total: 3, name: 'تفريغ سلة المهملات...' });

    // Quick trash purge
    try {
      if (typeof this.drive.files.emptyTrash === 'function') {
        await this.drive.files.emptyTrash({});
      }
    } catch (_) {}

    this.rootFolderId = null;
    this._ensureRootPromise = null;
    if (this.uploadLocks) this.uploadLocks.clear();

    try {
      await this.fetchUserProfile();
    } catch (_) {}

    return { success: true, wipedCount };
  }

  // Format / wipe all files and folders created by AuraSync in Google Drive down to 0 GB
  async formatCloud(onProgress = null) {
    if (!this.drive) throw new Error('Google Drive client not initialized');

    let deletedCount = 0;
    if (onProgress) onProgress({ current: 1, total: 3, name: 'تحديد بيانات AuraSync...' });

    const rootsToDelete = new Map();
    if (this.rootFolderId) {
      rootsToDelete.set(this.rootFolderId, { id: this.rootFolderId, name: ROOT_BACKUP_FOLDER_NAME });
    }

    const rootFolderNames = [ROOT_BACKUP_FOLDER_NAME, LEGACY_ROOT_BACKUP_FOLDER_NAME];
    for (const rootName of rootFolderNames) {
      try {
        const cleanRoot = rootName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const rootQ = `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanRoot}'`;
        const res = await this.drive.files.list({
          q: rootQ,
          fields: 'files(id, name)',
          pageSize: 50,
          spaces: 'drive',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });
        if (res.data?.files) {
          for (const f of res.data.files) {
            rootsToDelete.set(f.id, f);
          }
        }
      } catch (e) {
        console.warn('Error collecting root folders for format:', e.message);
      }
    }

    if (onProgress) onProgress({ current: 2, total: 3, name: 'حذف البيانات السحابية...' });

    const visited = new Set();
    for (const rf of rootsToDelete.values()) {
      try {
        let count = 0;
        const directOk = await this._deleteDriveItem(rf.id);
        if (directOk) {
          count = 1;
        } else {
          count = await this.deleteFolderRecursively(rf.id, onProgress, visited);
        }
        deletedCount += count;
      } catch (err) {
        console.warn(`Error formatting root ${rf.id}:`, err.message);
      }
    }

    // Empty trash so quota drops to 0 GB immediately
    try {
      if (typeof this.drive.files.emptyTrash === 'function') {
        await this.drive.files.emptyTrash({});
      }
    } catch (_) {}

    this.rootFolderId = null;
    this._ensureRootPromise = null;
    if (this.uploadLocks) this.uploadLocks.clear();

    if (onProgress) onProgress({ current: 3, total: 3, name: 'تمت تهيئة السحابة بنجاح' });

    try {
      await this.fetchUserProfile();
    } catch (_) {}

    return { success: true, deletedCount, freedBytes: 0 };
  }
}

module.exports = new GoogleDriveService();
