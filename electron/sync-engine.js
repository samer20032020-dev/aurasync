const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const db = require('./database');
const { getProvider, hasAnyConnected, getConnectedProviders } = require('./cloud-providers');
const { prepareSafeOutputPath } = require('./safe-path');

const MAX_UPLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000;

function isCloudObjectMissing(error) {
  return Boolean(
    error && (
      Number(error.status) === 404 || Number(error.code) === 404 ||
      Number(error.response && error.response.status) === 404 ||
      error.code === 'notFound' || error.code === 'fileNotFound'
    )
  );
}

const BUILTIN_IGNORED_DIRS = new Set([
  'node_modules',
  '$RECYCLE.BIN',
  'System Volume Information',
  'My Videos',
  'My Music',
  'My Pictures'
]);
const BUILTIN_IGNORED_FILES = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store']);
const BUILTIN_IGNORED_EXTS = new Set(['.tmp', '.crdownload', '.part']);

const MAIN_STRINGS = {
  ar: {
    'notify.deleteTitle': 'AuraSync — Zero-Deletion',
    'notify.deleteBody': 'تم تجاهل حذف الملف وبقي محفوظاً على Drive: {name}',
    'notify.backupTitle': 'AuraSync — اكتمل النسخ الاحتياطي',
    'notify.backupBody': 'تم رفع الملف بنجاح: {name}',
    'notify.failedTitle': 'AuraSync — فشل الرفع',
    'notify.failedBody': 'فشل رفع الملف: {name}',
    'notify.quotaTitle': 'AuraSync — المساحة ممتلئة',
    'notify.quotaBody': 'مساحة Google Drive ممتلئة، تم إيقاف الرفع مؤقتاً.',
    'notify.deleteSyncedTitle': 'AuraSync — تم عكس الحذف',
    'notify.deleteSyncedBody': 'تم نقل الملف إلى سلة مهملات Drive: {name}',
    'log.quotaFull': 'مساحة Google Drive ممتلئة. تم إيقاف الرفع حتى يتم إفراغ مساحة.',
    'log.quotaFullProvider': 'مساحة {provider} ممتلئة. تم إيقاف الرفع إليها حتى يتم إفراغ مساحة.',
    'log.providerMissing': 'الحساب السحابي المرتبط ({provider}) لم يعد موجوداً. الملفات بانتظار إعادة الربط.',
    'log.engineInit': 'تم تشغيل محرك المزامنة بنجاح.',
    'log.monitoring': 'بدأت مراقبة المجلد: {name}',
    'log.folderMissingPath': 'مسار المجلد المراقب غير موجود على القرص: {path}',
    'log.deleteIgnored': 'تم تجاهل حذف الملف وبقي محفوظاً على السحابة: {name}',
    'log.deleteIgnoredDir': 'تم تجاهل حذف المجلد محلياً وبقي محفوظاً على السحابة: {name}',
    'log.deleteIgnoredPrior': 'تم تجاهل حذف الملف قبل اكتمال رفعه وبقي محفوظاً على السحابة: {name}',
    'log.deleteSynced': 'تم عكس الحذف: نُقل الملف إلى سلة مهملات Drive: {name}',
    'log.deleteSyncedNoCopy': 'حُذف الملف محلياً (لم تكن له نسخة سحابية): {name}',
    'log.driveDeleteError': 'فشل عكس الحذف على Drive للملف {name}: {error}',
    'log.watcherError': 'خطأ في مراقبة المجلد {name}: {error}',
    'log.detectedNew': 'ملف جديد: {name}',
    'log.detectedNewFolder': 'مجلد جديد (يُرفع مع محتوياته وإن كان فارغاً): {name}',
    'log.detectedChange': 'تعديل ملف: {name}',
    'log.oversize': 'تم تخطي ملف أكبر من الحد ({mb} MB): {name}',
    'log.uploading': 'جاري رفع: {name}',
    'log.uploaded': 'تم الرفع بنجاح: {name}',
    'log.retryIn': 'فشل الرفع (محاولة {attempt}/{max}) للملف {name}: {error} — إعادة المحاولة بعد {seconds} ثانية.',
    'log.uploadFailedPermanently': 'فشل رفع {name} نهائياً: {error}',
    'log.retryQueued': 'إعادة محاولة {count} ملف فاشل.',
    'log.folderPaused': 'المجلد متوقف مؤقتاً، تم تخطي الفحص: {name}',
    'log.folderMissing': 'المجلد غير موجود على القرص: {path}',
    'log.scanning': 'جاري فحص المجلد: {name}',
    'log.scanComplete': 'اكتمل فحص {name}: {total} ملف، {queued} بانتظار الرفع.',
    'log.restored': 'تم استرجاع الملف من السحابة: {name}'
  },
  en: {
    'notify.deleteTitle': 'AuraSync — Zero-Deletion',
    'notify.deleteBody': 'Local delete ignored, file is preserved on Drive: {name}',
    'notify.backupTitle': 'AuraSync — Backup complete',
    'notify.backupBody': 'File uploaded successfully: {name}',
    'notify.failedTitle': 'AuraSync — Upload failed',
    'notify.failedBody': 'Failed to upload file: {name}',
    'notify.quotaTitle': 'AuraSync — Storage full',
    'notify.quotaBody': 'Google Drive is full, uploads have been paused.',
    'notify.deleteSyncedTitle': 'AuraSync — Delete synced',
    'notify.deleteSyncedBody': 'File moved to the Drive trash: {name}',
    'log.quotaFull': 'Google Drive storage is full. Uploads are paused until space is freed.',
    'log.quotaFullProvider': '{provider} storage is full. Uploads to it are paused until space is freed.',
    'log.providerMissing': 'The linked cloud account ({provider}) no longer exists. Files are waiting for re-linking.',
    'log.engineInit': 'Sync engine started successfully.',
    'log.monitoring': 'Now monitoring folder: {name}',
    'log.folderMissingPath': 'Watched folder path does not exist on disk: {path}',
    'log.deleteIgnored': 'Local delete ignored, file preserved in the cloud: {name}',
    'log.deleteIgnoredDir': 'Local folder delete ignored, folder preserved in the cloud: {name}',
    'log.deleteIgnoredPrior': 'Delete ignored before upload finished, file preserved in the cloud: {name}',
    'log.deleteSynced': 'Delete mirrored: file moved to the Drive trash: {name}',
    'log.deleteSyncedNoCopy': 'File deleted locally (it had no cloud copy): {name}',
    'log.driveDeleteError': 'Failed to mirror delete on Drive for {name}: {error}',
    'log.watcherError': 'Watcher error in folder {name}: {error}',
    'log.detectedNew': 'New file: {name}',
    'log.detectedNewFolder': 'New folder (uploaded with its contents even if empty): {name}',
    'log.detectedChange': 'File modified: {name}',
    'log.oversize': 'Skipped a file larger than the limit ({mb} MB): {name}',
    'log.uploading': 'Uploading: {name}',
    'log.uploaded': 'Uploaded successfully: {name}',
    'log.retryIn': 'Upload failed (attempt {attempt}/{max}) for {name}: {error} — retrying in {seconds}s.',
    'log.uploadFailedPermanently': 'Upload of {name} failed permanently: {error}',
    'log.retryQueued': 'Retrying {count} failed file(s).',
    'log.folderPaused': 'Folder is paused, scan skipped: {name}',
    'log.folderMissing': 'Folder not found on disk: {path}',
    'log.scanning': 'Scanning folder: {name}',
    'log.scanComplete': 'Scan complete for {name}: {total} files, {queued} queued for upload.',
    'log.restored': 'File restored from the cloud: {name}'
  }
};

function mainT(key, vars) {
  let lang = 'ar';
  try {
    lang = db.getSetting('language', 'ar') || 'ar';
  } catch (_) {}
  const dict = MAIN_STRINGS[lang] || MAIN_STRINGS.ar;
  let str = dict[key] || MAIN_STRINGS.ar[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

// Convert a user-supplied glob (e.g. "*.iso", "build/**", "node_modules") into a RegExp
function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\?/g, '[^/\\\\]')
    .replace(/\u0000/g, '.*');
  return new RegExp(`(^|[/\\\\])${escaped}($|[/\\\\])`, 'i');
}

// High-Performance Token Bucket Bandwidth Limiter
// Regulates aggregate upload speed across all concurrent upload workers
class BandwidthLimiter {
  constructor() {
    this.tokens = 0;
    this.lastRefill = Date.now();
  }

  getLimitMB() {
    try {
      const val = parseFloat(db.getSetting('uploadSpeedLimitMB', '0'));
      return isNaN(val) || val < 0 ? 0 : val;
    } catch (_) {
      return 0;
    }
  }

  getLimitBytesPerSec() {
    const mb = this.getLimitMB();
    return mb > 0 ? Math.round(mb * 1024 * 1024) : 0;
  }

  async throttle(bytes) {
    const limitBytesPerSec = this.getLimitBytesPerSec();
    if (limitBytesPerSec <= 0 || bytes <= 0) return; // 0 = Unlimited

    const now = Date.now();
    const elapsed = Math.max(0, (now - this.lastRefill) / 1000);
    // NOTE: do NOT update lastRefill here — only update it after any sleep.
    // This preserves elapsed time across concurrent workers.

    // Refill tokens based on elapsed time, capped at 2 seconds worth of bandwidth
    this.tokens = Math.min(this.tokens + (elapsed * limitBytesPerSec), limitBytesPerSec * 2);
    this.lastRefill = now;

    // Deduct consumed bytes
    this.tokens -= bytes;

    // If tokens are in deficit, delay to maintain the target rate.
    // Cap individual sleep to 500ms to keep concurrent workers responsive,
    // and carry any remaining debt into the next call via the negative token balance.
    if (this.tokens < 0) {
      const debt = -this.tokens;
      const fullDelayMs = Math.ceil((debt / limitBytesPerSec) * 1000);
      const delayMs = Math.min(fullDelayMs, 500); // max 500ms slice per call
      if (delayMs > 5) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // Credit back the time we actually slept so the token bucket stays accurate
        const sleptSec = delayMs / 1000;
        this.tokens += sleptSec * limitBytesPerSec;
        this.lastRefill = Date.now();
      }
    }
  }
}

class SyncEngine {
  constructor() {
    this.bandwidthLimiter = new BandwidthLimiter();
    this.watchers = new Map(); // folderId -> FSWatcher
    this.uploadQueue = [];
    this.uploadQueueKeys = new Set(); // O(1) membership index
    this.uploadQueueMap = new Map(); // pathKey -> task object
    this.pendingFolderStatUpdates = new Set();
    this.statsUpdateDebounceTimer = null;
    this.activeUploads = 0;
    this.maxConcurrentUploads = 4; // fallback; the live value comes from settings
    this.isProcessingQueue = false;
    this.eventEmitter = null;
    this.uploadAttempts = new Map(); // filePath -> failed attempts count
    this.retryTimers = new Map(); // filePath -> { timer, folderId, providerId }
    this.inFlightUploads = new Set(); // filePaths currently uploading
    this.pendingReuploads = new Set(); // filePaths that changed while uploading
    this.resolveChain = Promise.resolve(); // serializes cloud folder resolution
    this.reverseInterval = null;
    this.reverseInFlight = new Set();
    this.sizeWarned = new Set();
    this.missingProviderWarned = new Set();
    this.lastNotifyAt = 0;
    this.quotaWarnedProviders = new Set();
  }

  throttleUpload(bytes) {
    return this.bandwidthLimiter.throttle(bytes);
  }

  getUploadSpeedLimitMB() {
    return this.bandwidthLimiter.getLimitMB();
  }

  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  emit(channel, data) {
    if (this.eventEmitter) {
      try {
        this.eventEmitter(channel, data);
      } catch (err) {
        console.error('Error emitting event:', err);
      }
    }
  }

  notifyStatsUpdated(folderId = null) {
    if (folderId) {
      if (!this.pendingFolderStatUpdates) this.pendingFolderStatUpdates = new Set();
      this.pendingFolderStatUpdates.add(folderId);
    }
    if (this.statsUpdateDebounceTimer) return;
    this.statsUpdateDebounceTimer = setTimeout(() => {
      this.statsUpdateDebounceTimer = null;
      try {
        if (this.pendingFolderStatUpdates && this.pendingFolderStatUpdates.size > 0) {
          for (const fid of this.pendingFolderStatUpdates) {
            db.updateFolderStats(fid);
          }
          this.pendingFolderStatUpdates.clear();
        }
        this.emit('stats:updated', db.getAppStats());
      } catch (err) {
        console.error('Error emitting debounced stats:', err);
      }
    }, 250);
  }

  normalizePathKey(p) {
    if (!p) return '';
    const n = path.normalize(p);
    return process.platform === 'win32' ? n.toLowerCase() : n;
  }

  log(type, message, filePath = null) {
    db.addLog(type, message, filePath);
    this.emit('activity:new-log', {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      filePath
    });
  }

  notify(title, body) {
    if (db.getSetting('notifications', 'true') !== 'true') return;
    const now = Date.now();
    if (now - this.lastNotifyAt < 3000) return;
    this.lastNotifyAt = now;
    try {
      const { Notification } = require('electron');
      if (!Notification || typeof Notification.isSupported !== 'function' || !Notification.isSupported()) return;
      new Notification({ title, body, silent: true }).show();
    } catch (_) {}
  }

  // 'safe' = Zero-Deletion policy (default) | 'mirror' = deletes propagate to Drive trash
  getSyncMode() {
    return db.getSetting('syncMode', 'safe') === 'mirror' ? 'mirror' : 'safe';
  }

  async propagateDelete(filePath, relativePath, provider = null) {
    const tracked = db.getFileByPath(filePath);
    const trackedFolder = tracked ? db.getFolderById(tracked.folder_id) : null;
    const providerId = trackedFolder ? (trackedFolder.provider || 'google') : (provider && provider.id);
    if (tracked && tracked.drive_file_id && providerId) {
      db.addPendingCloudDeletion({ localPath: filePath, provider: providerId, driveFileId: tracked.drive_file_id, isPrimary: true });
    }
    if (tracked) {
      for (const mirror of db.getFileMirrors(filePath)) {
        if (mirror.drive_file_id) {
          db.addPendingCloudDeletion({ localPath: filePath, provider: mirror.provider, driveFileId: mirror.drive_file_id });
        }
      }
    }

    if (db.getPendingCloudDeletionCount(filePath) === 0) {
      if (tracked) db.markFileDeletedOnDrive(filePath);
      this.log('delete_propagated', mainT('log.deleteSyncedNoCopy', { name: relativePath }), filePath);
    } else {
      await this.processPendingCloudDeletions(filePath);
      if (db.getPendingCloudDeletionCount(filePath) > 0) {
        db.updateFileStatus(filePath, 'delete_pending', 'Waiting for cloud connection to finish deletion');
        this.log('error', mainT('log.driveDeleteError', { name: relativePath, error: 'الحذف محفوظ لإعادة المحاولة عند اتصال الحساب السحابي' }), filePath);
      } else {
        this.log('delete_propagated', mainT('log.deleteSynced', { name: relativePath }), filePath);
        this.notify(mainT('notify.deleteSyncedTitle'), mainT('notify.deleteSyncedBody', { name: relativePath }));
      }
    }
    this.emit('stats:updated', db.getAppStats());
  }

  async processPendingCloudDeletions(localPath = null) {
    const pending = db.getPendingCloudDeletions();
    const affectedPaths = new Set();
    for (const item of pending) {
      if (localPath && item.local_path.toLowerCase() !== path.normalize(localPath).toLowerCase()) continue;
      affectedPaths.add(item.local_path);
      const provider = getProvider(item.provider);
      if (!provider || !provider.isConnected() || typeof provider.trashFile !== 'function') continue;
      try {
        await provider.trashFile(item.drive_file_id);
      } catch (error) {
        // The cloud operation may have succeeded immediately before a crash.
        // A missing object is therefore an idempotent successful deletion.
        if (!isCloudObjectMissing(error)) {
          this.log('error', mainT('log.driveDeleteError', { name: item.local_path, error: error.message }), item.local_path);
          continue;
        }
      }
      try {
        db.removePendingCloudDeletion(item.id);
        if (item.is_primary) db.markFileDeletedOnDrive(item.local_path);
        else db.removeFileMirror(item.local_path, item.provider);
      } catch (error) {
        this.log('error', mainT('log.driveDeleteError', { name: item.local_path, error: error.message }), item.local_path);
      }
    }
    if (localPath) affectedPaths.add(path.normalize(localPath));
    for (const filePath of affectedPaths) {
      if (db.getPendingCloudDeletionCount(filePath) === 0) {
        db.markFileDeletedOnDrive(filePath);
      } else {
        db.updateFileStatus(filePath, 'delete_pending', 'Waiting for cloud connection to finish deletion');
      }
    }
  }

  calculateMD5(filePath) {
    return new Promise((resolve) => {
      try {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', () => resolve(null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ---------- Exclusion rules ----------

  getExcludePatterns() {
    const raw = db.getSetting('excludePatterns', '') || '';
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  getMaxFileSizeBytes() {
    const mb = parseFloat(db.getSetting('maxFileSizeMB', '0'));
    if (!mb || isNaN(mb) || mb <= 0) return 0;
    return Math.floor(mb * 1024 * 1024);
  }

  isExcluded(relativePath) {
    const patterns = this.getExcludePatterns();
    if (patterns.length === 0) return false;
    const normalized = relativePath.split(path.sep).join('/');
    for (const pattern of patterns) {
      try {
        if (globToRegExp(pattern).test(normalized)) return true;
      } catch (_) {}
    }
    return false;
  }

  shouldIgnorePath(folderPath, fullPath) {
    const base = path.basename(fullPath);
    if (!base) return false;

    // Critical low-level OS structures are always ignored for stability
    if (base === '$RECYCLE.BIN' || base === 'System Volume Information') return true;

    // 100% Exact Copy Mode (Copy & Paste without skipping any user or build folders)
    let isExact = false;
    try {
      isExact = db.getSetting('exactCopyMode', 'false') === 'true';
    } catch (_) {}

    if (isExact) {
      if (BUILTIN_IGNORED_EXTS.has(path.extname(fullPath).toLowerCase())) return true;
      return false;
    }

    const baseLower = base.toLowerCase();
    if (baseLower === 'desktop.ini' || baseLower === 'thumbs.db' || baseLower === '.ds_store') return true;
    if (base.startsWith('.')) return true;
    if (BUILTIN_IGNORED_DIRS.has(base)) return true;
    if (BUILTIN_IGNORED_FILES.has(base) || BUILTIN_IGNORED_FILES.has(baseLower)) return true;
    if (BUILTIN_IGNORED_EXTS.has(path.extname(fullPath).toLowerCase())) return true;
    const relativePath = path.relative(folderPath, fullPath);
    if (relativePath && this.isExcluded(relativePath)) return true;
    return false;
  }

  async rescanAllFolders() {
    this.log('info', 'إعادة فحص ومزامنة المجلدات وفق الإعدادات المحدثة...');
    const folders = db.getFolders();
    for (const folder of folders) {
      if (!folder.is_paused) {
        this.watchFolder(folder);
        this.scanAndSyncFolder(folder.id).catch((err) => {
          console.warn(`Rescan error for ${folder.name}:`, err.message);
        });
      }
    }
  }

  // Extract file version from executable PE header, filename, or project metadata
  extractFileVersion(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;

    // 1. Direct fast PE resource buffer search (ProductVersion / FileVersion in utf16le)
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.exe' || ext === '.dll') {
        const fd = fs.openSync(filePath, 'r');
        try {
          const stat = fs.fstatSync(fd);
          const readLen = Math.min(stat.size, 16 * 1024 * 1024);
          const buf = Buffer.alloc(readLen);
          fs.readSync(fd, buf, 0, readLen, 0);
          const str = buf.toString('utf16le');
          const m = str.match(/ProductVersion\x00+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/) ||
                    str.match(/FileVersion\x00+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
          if (m && m[1]) return m[1].trim();
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch (_) {}

    // 2. Check filename for version pattern (e.g. AuraSync Setup 1.7.65.exe or app-v2.0.exe)
    try {
      const base = path.basename(filePath);
      const matchName = base.match(/\bv?(\d+\.\d+(?:\.\d+)?)\b/);
      if (matchName && matchName[1]) return matchName[1];
    } catch (_) {}

    // 3. Fallback: Check nearest package.json in parent directories
    try {
      let cur = path.dirname(filePath);
      for (let i = 0; i < 4; i++) {
        const pkgPath = path.join(cur, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg && pkg.version) return String(pkg.version).trim();
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    } catch (_) {}

    return null;
  }

  // Check if a file qualifies as an installer / release executable
  isInstallerOrRelease(filePath, relativePath) {
    const ext = path.extname(filePath).toLowerCase();
    const isBinaryInstaller = ['.exe', '.msi', '.zip', '.dmg', '.appimage'].includes(ext);
    if (!isBinaryInstaller) return false;

    const normRel = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();

    // Inside release or dist directory
    if (normRel.startsWith('release/') || normRel.includes('/release/') ||
        normRel.startsWith('dist/') || normRel.includes('/dist/')) {
      return true;
    }

    // Filename indicates installer, setup, or portable
    if (baseName.includes('setup') || baseName.includes('portable') ||
        baseName.includes('installer') || baseName.includes('aurasync')) {
      return true;
    }

    return false;
  }

  // Smart Installer Version Archiving:
  // Automatically uploads a dedicated standalone versioned copy (e.g. AuraSync-Setup-v1.7.65.exe)
  // to the cloud folder, preserving every historic build as an independent copy.
  async archiveInstallerVersionIfNeeded(task, provider, targetDriveFolderId, fileSize) {
    try {
      const { filePath, relativePath, folder } = task;
      if (!this.isInstallerOrRelease(filePath, relativePath)) return;

      const version = this.extractFileVersion(filePath);
      if (!version) return;

      const fileName = path.basename(filePath);
      // If the filename already explicitly has the version in its name, it's already an independent release
      if (fileName.includes(version)) return;

      const ext = path.extname(fileName);
      const baseWithoutExt = path.basename(fileName, ext);
      const archivedFileName = `${baseWithoutExt}-v${version}${ext}`;

      // Check if this version was already archived in SQLite DB
      const archiveLocalKey = `${filePath}::__archived_v${version}`;
      const existingArchive = db.getFileByPath(archiveLocalKey);
      if (existingArchive && existingArchive.status === 'synced' && existingArchive.drive_file_id) {
        return; // Already safely archived!
      }

      this.log('info', `أرشفة إصدار التثبيت السحابي المستقل: ${archivedFileName}`, filePath);
      const archiveResult = await provider.uploadFile({
        localPath: filePath,
        fileName: archivedFileName,
        parentFolderId: targetDriveFolderId,
        existingDriveFileId: null, // Always create a new independent file in Drive!
        fileSize,
        onProgress: null,
        throttle: (bytes) => this.throttleUpload(bytes)
      });

      if (archiveResult && archiveResult.driveFileId) {
        db.upsertFile({
          folderId: folder.id,
          localPath: archiveLocalKey,
          relativePath: path.join(path.dirname(relativePath), archivedFileName),
          fileName: archivedFileName,
          fileSize: archiveResult.size || fileSize,
          status: 'synced',
          driveFileId: archiveResult.driveFileId,
          driveFolderId: targetDriveFolderId,
          fileHash: archiveResult.md5Checksum || ''
        });
        this.log('success', `تم حفظ نسخة مستقلة للإصدار في السحابة: ${archivedFileName}`, filePath);
      }
    } catch (err) {
      console.warn('archiveInstallerVersion error:', err.message);
    }
  }

  isOverSizeLimit(filePath, size) {
    const maxBytes = this.getMaxFileSizeBytes();
    if (maxBytes > 0 && size > maxBytes) {
      if (!this.sizeWarned.has(filePath)) {
        this.sizeWarned.add(filePath);
        this.log(
          'warning',
          mainT('log.oversize', {
            mb: Math.round(maxBytes / (1024 * 1024)),
            name: path.basename(filePath)
          }),
          filePath
        );
      }
      return true;
    }
    return false;
  }

  // ---------- Lifecycle ----------

  async start() {
    this.log('info', mainT('log.engineInit'));
    db.resetStuckSyncing();
    await this.processPendingCloudDeletions();
    const folders = db.getFolders();
    for (const folder of folders) {
      if (!folder.is_paused) {
        this.watchFolder(folder);
      }
    }
    // Resume any files left over as failed/pending from a previous session
    if (hasAnyConnected()) {
      this.processQueue();
    }
    this.scheduleReverseSync();
  }

  // ---------- Reverse sync (cloud ➜ device) ----------

  scheduleReverseSync() {
    if (this.reverseInterval) {
      clearInterval(this.reverseInterval);
      this.reverseInterval = null;
    }
    let minutes = 2;
    try {
      const raw = parseInt(db.getSetting('reverseSyncIntervalMin', '2'), 10);
      if (!isNaN(raw) && raw >= 1 && raw <= 60) minutes = raw;
    } catch (_) {}
    // First pass quickly after startup, then periodically
    setTimeout(() => {
      this.reverseSyncAll().catch(() => {});
    }, 3000);
    this.reverseInterval = setInterval(() => {
      this.reverseSyncAll().catch(() => {});
    }, minutes * 60 * 1000);
  }

  async reverseSyncAll() {
    let folders = [];
    try { folders = db.getFolders(); } catch (_) { return; }
    for (const folder of folders) {
      if (folder.is_paused || folder.reverse_sync !== 1) continue;
      await this.reverseSyncFolder(folder.id).catch(() => {});
    }
  }

  // Mark locally-tracked files whose cloud copy disappeared (deleted from the
  // cloud website/app) and automatically recover files that are restored in the cloud.
  _markMissingCloudFiles(folder, cloudPaths) {
    let files = [];
    try {
      files = db.getFiles({ folderId: folder.id, limit: 1000000, offset: 0 });
    } catch (_) {
      return 0;
    }
    let missing = 0;
    let recovered = 0;
    for (const f of files) {
      const rel = String(f.relative_path || '').split(path.sep).join('/');
      if (!rel) continue;
      if (f.status === 'synced' && !cloudPaths.has(rel)) {
        db.updateFileStatus(f.local_path, 'cloud_missing');
        missing++;
        this.log('warning', `Cloud copy missing: ${rel}`, f.local_path);
      } else if (f.status === 'cloud_missing' && cloudPaths.has(rel)) {
        db.updateFileStatus(f.local_path, 'synced');
        recovered++;
        this.log('success', `Cloud copy restored: ${rel}`, f.local_path);
      }
    }
    if (missing > 0 || recovered > 0) {
      this.emit('stats:updated', db.getAppStats());
      this.emit('folders:updated');
    }
    return missing;
  }

  // Walk a folder's cloud tree and mark local files whose cloud copy is gone
  async verifyFolderCloud(folderId) {
    const folder = db.getFolderById(folderId);
    if (!folder || folder.is_paused) return { missing: 0 };
    if (!fs.existsSync(folder.path)) return { missing: 0 };

    const provider = getProvider(folder.provider || 'google');
    if (!provider || !provider.isConnected()) return { missing: 0 };

    const rootId = await provider.ensureRootBackupFolder();
    let folderRootId = folder.drive_folder_id;
    if (!folderRootId) {
      folderRootId = await provider.ensureFolder(folder.name, rootId);
      db.updateFolderDriveId(folder.id, folderRootId);
    }

    const cloudPaths = new Set();
    const walk = async (id, relativeDir) => {
      const items = await provider.listFolder(id);
      for (const item of items) {
        if (item.isDir) {
          if (!relativeDir && item.name === '_Snapshots') continue;
          await walk(item.id, relativeDir ? `${relativeDir}/${item.name}` : item.name);
        } else if (item.name) {
          cloudPaths.add(relativeDir ? `${relativeDir}/${item.name}` : item.name);
        }
      }
    };
    await walk(folderRootId, '');

    return { missing: this._markMissingCloudFiles(folder, cloudPaths) };
  }

  async reverseSyncFolder(folderId) {
    if (this.reverseInFlight.has(folderId)) return { downloaded: 0, skipped: 0 };
    this.reverseInFlight.add(folderId);
    try {
      return await this._reverseSyncFolder(folderId);
    } finally {
      this.reverseInFlight.delete(folderId);
    }
  }

  // Check whether a cloud folder with this name already exists under AuraSync/
  // (used when adding a watched folder: offer "merge into it" or "new name")
  async checkCloudFolderName(folderName, providerId) {
    try {
      const provider = getProvider(providerId || 'google');
      if (!provider || !provider.isConnected()) {
        return { success: true, exists: false, unreachable: true };
      }
      const rootId = await provider.ensureRootBackupFolder();
      const items = await provider.listFolder(rootId);
      const existing = (items || []).find((it) => it.isDir && it.name === folderName);
      if (!existing) return { success: true, exists: false };

      let itemCount = 0;
      try {
        const children = await provider.listFolder(existing.id);
        itemCount = (children || []).length;
      } catch (_) {}

      return { success: true, exists: true, folderId: existing.id, itemCount };
    } catch (err) {
      return { success: false, exists: false, error: err.message };
    }
  }

  // Multi-Device Cloud Catalog: discover folders sitting in the cloud that are NOT watched locally
  // (allows up to 6+ devices to see all folders with 0 disk usage until user chooses to link/sync)
  async getRemoteCloudFolders(targetProviderId = null) {
    try {
      let providersToScan = [];
      if (targetProviderId) {
        const p = getProvider(targetProviderId);
        if (p) providersToScan.push(p);
      } else if (typeof getConnectedProviders === 'function') {
        providersToScan = getConnectedProviders();
      } else {
        const p = getProvider('google');
        if (p && p.isConnected()) providersToScan.push(p);
      }

      const localFolders = db.getFolders();
      const remoteFolders = [];

      for (const provider of providersToScan) {
        if (!provider || !provider.isConnected()) continue;
        try {
          const rootId = await provider.ensureRootBackupFolder();
          const items = await provider.listFolder(rootId);
          for (const item of items || []) {
            if (!item.isDir) continue;
            if (item.name === '_Snapshots' || item.name.startsWith('.')) continue;

            // Check if this cloud folder is already tracked on this device
            const isLocal = localFolders.some((lf) => {
              const nameMatch = lf.name && lf.name.trim().toLowerCase() === item.name.trim().toLowerCase();
              const idMatch = lf.drive_folder_id && lf.drive_folder_id === item.id;
              return nameMatch || idMatch;
            });

            if (isLocal) continue;

            let fileCount = 0;
            let folderCount = 0;
            let totalBytes = 0;
            try {
              const children = await provider.listFolder(item.id);
              for (const child of children || []) {
                if (child.isDir) {
                  folderCount++;
                } else {
                  fileCount++;
                  totalBytes += (child.size || 0);
                }
              }
            } catch (_) {}

            remoteFolders.push({
              id: item.id,
              name: item.name,
              provider: provider.id,
              providerLabel: provider.label || provider.id,
              fileCount,
              folderCount,
              totalBytes,
              modifiedTime: item.modifiedTime || null,
              isRemote: true,
              isVirtual: true // 0 disk footprint locally!
            });
          }
        } catch (provErr) {
          console.warn(`Error scanning remote folders for provider ${provider.id}:`, provErr.message);
        }
      }

      return { success: true, remoteFolders };
    } catch (err) {
      return { success: false, error: err.message, remoteFolders: [] };
    }
  }

  // List all files inside a remote cloud folder without downloading anything to disk
  async listRemoteFolderFiles(providerId, folderId) {
    try {
      const provider = getProvider(providerId || 'google');
      if (!provider || !provider.isConnected()) {
        return { success: false, error: 'Provider not connected', files: [] };
      }
      const raw = await provider.listFolder(folderId);
      const files = (raw || []).map((it) => ({
        id: it.id,
        name: it.name,
        size: it.size || 0,
        isDir: !!it.isDir,
        modifiedTime: it.modifiedTime || null
      }));
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  }

  // Download a single remote file on-demand to user-specified local destination
  async downloadRemoteFile(providerId, fileId, destPath) {
    try {
      const provider = getProvider(providerId || 'google');
      if (!provider || !provider.isConnected()) {
        return { success: false, error: 'Provider not connected' };
      }
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await provider.downloadFile({ fileId, destPath });
      const stat = fs.statSync(destPath);
      return { success: true, destPath, size: stat.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Link a remote cloud folder to a local directory on this device with two-way sync
  async linkRemoteFolder(providerId, cloudFolderId, folderName, localPath) {
    try {
      const provider = getProvider(providerId || 'google');
      if (!provider || !provider.isConnected()) {
        return { success: false, error: 'Provider not connected' };
      }
      if (!fs.existsSync(localPath)) {
        await fs.promises.mkdir(localPath, { recursive: true });
      }

      let folder = db.addFolder(localPath, folderName, providerId);
      db.updateFolderDriveId(folder.id, cloudFolderId);
      db.setFolderReverseSync(folder.id, 1);
      folder = db.getFolderById(folder.id);

      this.watchFolder(folder);
      this.reverseSyncFolder(folder.id).catch(() => {});

      return { success: true, folder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Link all unlinked remote cloud folders to a base directory on this device
  async linkAllRemoteFolders(targetProviderId = null, baseDirectory = null) {
    try {
      const res = await this.getRemoteCloudFolders(targetProviderId);
      if (!res.success || !res.remoteFolders || res.remoteFolders.length === 0) {
        return { success: true, count: 0, folders: [] };
      }

      const defaultBase = baseDirectory || path.join(
        process.env.USERPROFILE || process.env.HOME || '.',
        'AuraSync'
      );
      if (!fs.existsSync(defaultBase)) {
        await fs.promises.mkdir(defaultBase, { recursive: true });
      }

      const linked = [];
      for (const rf of res.remoteFolders) {
        try {
          const cleanName = (rf.name || 'Folder').replace(/[<>:"/\\|?*]/g, '_').trim();
          const folderLocalPath = path.join(defaultBase, cleanName);
          const linkRes = await this.linkRemoteFolder(rf.provider, rf.id, rf.name, folderLocalPath);
          if (linkRes.success && linkRes.folder) {
            linked.push(linkRes.folder);
          }
        } catch (itemErr) {
          console.warn(`Failed linking remote folder ${rf.name}:`, itemErr.message);
        }
      }

      return { success: true, count: linked.length, folders: linked, basePath: defaultBase };
    } catch (err) {
      return { success: false, error: err.message, count: 0, folders: [] };
    }
  }

  // Trash a remote cloud folder
  async trashRemoteFolder(providerId, cloudFolderId) {
    try {
      const provider = getProvider(providerId || 'google');
      if (!provider || !provider.isConnected()) {
        return { success: false, error: 'Provider not connected' };
      }
      if (typeof provider.trashFile === 'function') {
        await provider.trashFile(cloudFolderId);
        return { success: true };
      }
      return { success: false, error: 'Trash operation not supported by provider' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Delete a specific file or folder from both local disk and cloud simultaneously
  // (allows explicit intentional permanent deletion without altering zero-deletion mode for other files)
  async deleteFileBoth(targetPath) {
    try {
      const norm = path.normalize(targetPath);
      const exists = fs.existsSync(norm);
      let isDir = false;
      try {
        if (exists) {
          isDir = fs.statSync(norm).isDirectory();
        } else {
          // If not on disk, check if it's a watched folder in DB
          isDir = Boolean(db.getFolders().some(f => path.normalize(f.path).toLowerCase() === norm.toLowerCase()));
        }
      } catch (_) {}

      if (isDir) {
        // --- Folder / Directory Simultaneous Deletion ---
        const allFolders = db.getFolders();
        const watchedFolder = allFolders.find(
          f => path.normalize(f.path).toLowerCase() === norm.toLowerCase()
        );

        if (watchedFolder) {
          // A watched root folder: trash cloud folder
          if (watchedFolder.drive_folder_id) {
            db.addPendingCloudDeletion({
              localPath: watchedFolder.path,
              provider: watchedFolder.provider || 'google',
              driveFileId: watchedFolder.drive_folder_id,
              isPrimary: true
            });
          }
          // Trash multi-cloud mirrors if any
          const mirrors = db.getFolderMirrors ? db.getFolderMirrors(watchedFolder.id) : [];
          for (const m of mirrors || []) {
            if (m.drive_folder_id) db.addPendingCloudDeletion({
              localPath: watchedFolder.path,
              provider: m.provider,
              driveFileId: m.drive_folder_id
            });
          }
          await this.processPendingCloudDeletions(watchedFolder.path);
          // Unwatch and delete folder record + its file records from DB
          this.unwatchFolder(watchedFolder.id);
          db.removeFolder(watchedFolder.id);
        } else {
          // A subfolder: find and trash any tracked files within it
          const normPrefix = norm.toLowerCase().replace(/[\\/]+$/, '') + path.sep;
          for (const f of allFolders) {
            const files = db.getFilesUnderPath(f.id, norm);
            for (const file of files) {
              if (file.local_path && file.local_path.toLowerCase().startsWith(normPrefix)) {
                if (file.drive_file_id) {
                  db.addPendingCloudDeletion({
                    localPath: file.local_path,
                    provider: f.provider || 'google',
                    driveFileId: file.drive_file_id,
                    isPrimary: true
                  });
                }
                for (const mirror of db.getFileMirrors(file.local_path)) {
                  if (mirror.drive_file_id) db.addPendingCloudDeletion({
                    localPath: file.local_path,
                    provider: mirror.provider,
                    driveFileId: mirror.drive_file_id
                  });
                }
                await this.processPendingCloudDeletions(file.local_path);
                db.deleteFileRecord(file.local_path);
              }
            }
          }
        }

        // Delete directory from local disk
        if (fs.existsSync(norm)) {
          try {
            fs.rmSync(norm, { recursive: true, force: true });
          } catch (e) {
            console.warn('Failed to delete local directory:', e.message);
          }
        }

        this.emit('folders:updated');
        this.emit('stats:updated', db.getAppStats());
        return { success: true };
      }

      // --- Single File Simultaneous Deletion ---
      const file = db.getFileByPath(norm);

      if (file && file.drive_file_id) {
        const folder = db.getFolderById(file.folder_id);
        db.addPendingCloudDeletion({
          localPath: norm,
          provider: folder ? (folder.provider || 'google') : 'google',
          driveFileId: file.drive_file_id,
          isPrimary: true
        });
      }

      // Check multi-cloud mirrors as well
      const mirrors = db.getFileMirrors(norm);
      for (const m of mirrors || []) {
        if (m.drive_file_id) db.addPendingCloudDeletion({
          localPath: norm,
          provider: m.provider,
          driveFileId: m.drive_file_id
        });
      }
      await this.processPendingCloudDeletions(norm);

      // 2. Delete from Local disk (if present)
      if (fs.existsSync(norm)) {
        try {
          fs.unlinkSync(norm);
        } catch (e) {
          console.warn('Failed to delete local file:', e.message);
        }
      }

      // 3. Remove database records
      if (file) {
        db.deleteFileRecord(norm);
      }

      this.emit('stats:updated', db.getAppStats());
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async _reverseSyncFolder(folderId) {
    const folder = db.getFolderById(folderId);
    if (!folder || folder.is_paused || folder.reverse_sync !== 1) return { downloaded: 0, skipped: 0 };
    if (!fs.existsSync(folder.path)) return { downloaded: 0, skipped: 0 };

    const provider = getProvider(folder.provider || 'google');
    if (!provider || !provider.isConnected()) return { downloaded: 0, skipped: 0 };

    const rootId = await provider.ensureRootBackupFolder();
    let folderRootId = folder.drive_folder_id;
    if (!folderRootId) {
      folderRootId = await provider.ensureFolder(folder.name, rootId);
      db.updateFolderDriveId(folder.id, folderRootId);
    }

    // Collect the current cloud tree (ignoring restore-point folders)
    const cloudFiles = [];
    const activeFolderIds = new Set();
    const walk = async (id, relativeDir) => {
      if (activeFolderIds.has(id)) throw new Error('The cloud tree contains a folder cycle');
      activeFolderIds.add(id);
      try {
        const items = await provider.listFolder(id);
        for (const item of items) {
          if (item.isDir) {
            if (!relativeDir && item.name === '_Snapshots') continue;
            await walk(item.id, relativeDir ? `${relativeDir}/${item.name}` : item.name);
          } else if (item.name) {
            cloudFiles.push({
              id: item.id,
              name: item.name,
              relativePath: relativeDir ? `${relativeDir}/${item.name}` : item.name,
              size: item.size || 0
            });
          }
        }
      } finally {
        activeFolderIds.delete(id);
      }
    };
    await walk(folderRootId, '');

    // Detect files that were deleted from the cloud side
    this._markMissingCloudFiles(folder, new Set(cloudFiles.map((cf) => cf.relativePath)));

    let downloaded = 0;
    let skipped = 0;

    for (const cf of cloudFiles) {
      let rel;
      let localPath;
      try {
        localPath = prepareSafeOutputPath(folder.path, cf.relativePath);
        rel = cf.relativePath.split('/').join(path.sep);
      } catch (error) {
        skipped++;
        this.log('error', `تم تجاهل مسار سحابي غير آمن: ${cf.relativePath} (${error.message})`);
        continue;
      }
      const tracked = db.getFileByPath(localPath);
      const localExists = fs.existsSync(localPath);

      try {
        if (!tracked && !localExists) {
          // Brand-new file created from another device/web → download it
          await provider.downloadFile({ fileId: cf.id, destPath: localPath });
          const stat = fs.statSync(localPath);
          db.upsertFile({
            localPath,
            relativePath: rel,
            folderId: folder.id,
            lastModified: Math.floor(stat.mtimeMs),
            fileSize: stat.size,
            fileHash: null,
            status: 'synced'
          });
          db.updateFileSynced({
            localPath,
            driveFileId: cf.id,
            driveFolderId: null,
            fileHash: null,
            fileSize: stat.size
          });
          downloaded++;
          this.log('success', `Cloud change downloaded: ${rel}`, localPath);
        } else if (tracked && tracked.drive_file_id === cf.id && localExists) {
          // Same cloud file: only overwrite when the local copy is untouched
          const localStat = fs.statSync(localPath);
          const localUntouched = Math.floor(localStat.mtimeMs) === tracked.last_modified;
          const cloudChanged = String(cf.size) !== String(tracked.file_size);
          if (localUntouched && cloudChanged) {
            await provider.downloadFile({ fileId: cf.id, destPath: localPath });
            const stat = fs.statSync(localPath);
            db.upsertFile({
              localPath,
              relativePath: rel,
              folderId: folder.id,
              lastModified: Math.floor(stat.mtimeMs),
              fileSize: stat.size,
              fileHash: null,
              status: 'synced'
            });
            db.updateFileSynced({
              localPath,
              driveFileId: cf.id,
              driveFolderId: null,
              fileHash: null,
              fileSize: stat.size
            });
            downloaded++;
            this.log('success', `Cloud update downloaded: ${rel}`, localPath);
          } else if (!localUntouched) {
            skipped++; // local edits win — they will be uploaded normally
          }
        } else {
          // Deleted locally, untracked locally, or conflicting id — never touch it
          skipped++;
        }
      } catch (err) {
        this.log('warning', `Reverse sync failed for ${rel}: ${err.message}`, localPath);
        skipped++;
      }
    }

    if (downloaded > 0) {
      db.updateFolderStats(folder.id);
      this.emit('stats:updated', db.getAppStats());
      this.emit('folders:updated');
    }
    return { downloaded, skipped };
  }

  watchFolder(folder) {
    if (this.watchers.has(folder.id)) {
      this.unwatchFolder(folder.id);
    }

    if (!fs.existsSync(folder.path)) {
      this.log('warning', mainT('log.folderMissingPath', { path: folder.path }));
      return;
    }

    this.log('info', mainT('log.monitoring', { name: folder.name }));

    const watcher = chokidar.watch(folder.path, {
      persistent: true,
      ignoreInitial: true, // Initial scan is handled comprehensively by scanAndSyncFolder
      awaitWriteFinish: {
        stabilityThreshold: 2500, // Debounce 2.5s after write ends
        pollInterval: 150
      },
      ignored: (targetPath) => this.shouldIgnorePath(folder.path, targetPath)
    });

    watcher.on('add', (filePath) => this.handleFileAddOrChange(folder, filePath, 'add'));
    watcher.on('change', (filePath) => this.handleFileAddOrChange(folder, filePath, 'change'));

    // New folders (even completely empty ones) are created in the cloud too.
    watcher.on('addDir', (dirPath) => this.handleDirectoryAdd(folder, dirPath));

    // ==========================================
    // DELETION HANDLING (depends on the sync mode)
    //  - 'safe'   : Zero-Deletion, local deletes NEVER touch Google Drive
    //  - 'mirror' : full sync like OneDrive/Drive, local deletes move the
    //               Drive copy to trash (recoverable for 30 days)
    // ==========================================
    watcher.on('unlink', async (filePath) => {
      const relativePath = path.relative(folder.path, filePath);

      // Latest-only projects mode: deletions propagate for this folder too
      let cleanMode = false;
      try {
        const fresh = db.getFolderById(folder.id);
        cleanMode = !!(fresh && fresh.clean_mirror === 1);
      } catch (_) {}

      if (this.getSyncMode() === 'mirror' || cleanMode) {
        await this.propagateDelete(filePath, relativePath);
        return;
      }

      // NEVER DELETE OR TRASH ON GOOGLE DRIVE IN SAFE MODE!
      this.log(
        'delete_ignored',
        mainT('log.deleteIgnored', { name: relativePath }),
        filePath
      );
      db.markFileLocalDeleted(filePath);
      this.notify(mainT('notify.deleteTitle'), mainT('notify.deleteBody', { name: relativePath }));
      this.emit('stats:updated', db.getAppStats());
    });

    watcher.on('unlinkDir', async (dirPath) => {
      const relativePath = path.relative(folder.path, dirPath);

      let cleanDirMode = false;
      try {
        const fresh = db.getFolderById(folder.id);
        cleanDirMode = !!(fresh && fresh.clean_mirror === 1);
      } catch (_) {}

      if (this.getSyncMode() === 'mirror' || cleanDirMode) {
        const tracked = db.getFilesUnderPath(folder.id, dirPath);
        for (const file of tracked) {
          await this.propagateDelete(file.local_path, file.relative_path);
        }
        this.log(
          'delete_propagated',
          mainT('log.deleteSynced', { name: relativePath }),
          dirPath
        );
        return;
      }

      // NEVER DELETE DIRECTORIES ON GOOGLE DRIVE IN SAFE MODE!
      const trackedFiles = db.getFilesUnderPath(folder.id, dirPath);
      for (const file of trackedFiles) {
        db.markFileLocalDeleted(file.local_path);
      }
      this.log(
        'delete_ignored',
        mainT('log.deleteIgnoredDir', { name: relativePath }),
        dirPath
      );
      this.emit('stats:updated', db.getAppStats());
    });

    watcher.on('error', (error) => {
      // Suppress Windows EPERM / permission denied on legacy virtual junction points (e.g. Documents\My Videos, My Music, My Pictures)
      if (error && (error.code === 'EPERM' || String(error.message).includes('EPERM') || error.code === 'EACCES')) {
        return;
      }
      this.log('error', mainT('log.watcherError', { name: folder.name, error: error.message }));
    });

    this.watchers.set(folder.id, watcher);
  }

  unwatchFolder(folderId) {
    const watcher = this.watchers.get(folderId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderId);
    }

    // Drop anything the removed/paused folder still had pending
    this.uploadQueue = this.uploadQueue.filter((task) => task.folder && task.folder.id !== folderId);
    if (this.uploadQueueKeys && this.uploadQueueMap) {
      this.uploadQueueKeys.clear();
      this.uploadQueueMap.clear();
      for (const task of this.uploadQueue) {
        const pk = this.normalizePathKey(task.filePath);
        this.uploadQueueKeys.add(pk);
        this.uploadQueueMap.set(pk, task);
      }
    }
    for (const [filePath, entry] of Array.from(this.retryTimers.entries())) {
      if (entry.folderId === folderId) {
        clearTimeout(entry.timer);
        this.retryTimers.delete(filePath);
      }
    }
  }

  // Stop everything: used by the full application reset
  stopAll() {
    if (this.reverseInterval) {
      clearInterval(this.reverseInterval);
      this.reverseInterval = null;
    }
    this.reverseInFlight.clear();
    for (const watcher of this.watchers.values()) {
      try { watcher.close(); } catch (_) {}
    }
    this.watchers.clear();
    for (const entry of this.retryTimers.values()) {
      clearTimeout(entry.timer);
    }
    this.retryTimers.clear();
    this.uploadQueue = [];
    if (this.uploadQueueKeys) this.uploadQueueKeys.clear();
    if (this.uploadQueueMap) this.uploadQueueMap.clear();
    if (this.statsUpdateDebounceTimer) {
      clearTimeout(this.statsUpdateDebounceTimer);
      this.statsUpdateDebounceTimer = null;
    }
    if (this.pendingFolderStatUpdates) this.pendingFolderStatUpdates.clear();
    this.inFlightUploads.clear();
    this.pendingReuploads.clear();
    this.uploadAttempts.clear();
    this.sizeWarned.clear();
    this.missingProviderWarned.clear();
    this.quotaWarnedProviders.clear();
  }

  async handleFileAddOrChange(folder, rawFilePath, eventType) {
    try {
      const filePath = path.normalize(rawFilePath);

      // Re-read the folder: it may have been paused (e.g. cloud formatted) since the watcher was created
      const freshFolder = db.getFolderById(folder.id);
      if (!freshFolder || freshFolder.is_paused) return;
      folder = freshFolder;

      if (this.shouldIgnorePath(folder.path, filePath)) return;
      if (!fs.existsSync(filePath)) return;
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) return;
      if (this.isOverSizeLimit(filePath, stats.size)) return;

      const relativePath = path.relative(folder.path, filePath);
      const existingFile = db.getFileByPath(filePath);
      db.clearPendingCloudDeletions(filePath);

      // Check if unchanged and already synced OR currently in-flight with identical stats
      const pathKey = this.normalizePathKey(filePath);
      const isPathInFlight = this.inFlightUploads.has(pathKey);
      if (
        existingFile &&
        (existingFile.status === 'synced' || (isPathInFlight && existingFile.status === 'syncing')) &&
        existingFile.last_modified === Math.floor(stats.mtimeMs) &&
        existingFile.file_size === stats.size
      ) {
        return; // File is identical, no upload required
      }

      // Record or update in SQLite database
      const trackedFile = db.upsertFile({
        localPath: filePath,
        relativePath,
        folderId: folder.id,
        lastModified: Math.floor(stats.mtimeMs),
        fileSize: stats.size,
        fileHash: existingFile ? existingFile.file_hash : null,
        status: 'pending'
      });

      this.log(
        'info',
        eventType === 'add'
          ? mainT('log.detectedNew', { name: relativePath })
          : mainT('log.detectedChange', { name: relativePath }),
        filePath
      );

      this.enqueueUpload({
        folder,
        trackedFile,
        filePath,
        relativePath,
        stats
      });

      this.notifyStatsUpdated(folder.id);
    } catch (err) {
      console.error('Error handling file add/change:', err);
    }
  }

  // Create a newly added directory (including an empty one) in the cloud
  async handleDirectoryAdd(folder, rawDirPath) {
    try {
      const dirPath = path.normalize(rawDirPath);
      const freshFolder = db.getFolderById(folder.id);
      if (!freshFolder || freshFolder.is_paused) return;
      if (!fs.existsSync(dirPath)) return;
      let stat;
      try { stat = fs.statSync(dirPath); } catch (_) { return; }
      if (!stat.isDirectory()) return;
      if (this.shouldIgnorePath(freshFolder.path, dirPath)) return;
      const relativeDir = path.relative(freshFolder.path, dirPath);
      if (!relativeDir || relativeDir.startsWith('..')) return;

      this.log('info', mainT('log.detectedNewFolder', { name: relativeDir }) || `Detected new folder: ${relativeDir}`, dirPath);
      await this.ensureFolderPathInCloud(freshFolder, relativeDir);
      this.notifyStatsUpdated(freshFolder.id);
    } catch (err) {
      console.error('Error handling directory add:', err);
    }
  }

  enqueueUpload(task, options = {}) {
    const normPath = path.normalize(task.filePath);
    task.filePath = normPath;
    const pathKey = this.normalizePathKey(normPath);

    // The file is already uploading: remember the latest change and re-run once it finishes
    if (this.inFlightUploads.has(pathKey)) {
      this.pendingReuploads.add(pathKey);
      return;
    }

    if (!this.uploadQueueKeys) this.uploadQueueKeys = new Set();
    if (!this.uploadQueueMap) this.uploadQueueMap = new Map();

    if (this.uploadQueueKeys.has(pathKey)) {
      const existing = this.uploadQueueMap.get(pathKey);
      if (existing) {
        Object.assign(existing, task);
      }
    } else {
      this.uploadQueueKeys.add(pathKey);
      this.uploadQueueMap.set(pathKey, task);
      this.uploadQueue.push(task);
    }

    if (!options || !options.deferProcess) {
      this.processQueue();
    }
  }

  scheduleRetry(task, delayMs) {
    const pathKey = this.normalizePathKey(task.filePath);
    const existing = this.retryTimers.get(pathKey);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.retryTimers.delete(pathKey);
      if (fs.existsSync(task.filePath)) {
        this.enqueueUpload(task);
      } else {
        db.markFileLocalDeleted(task.filePath);
        this.notifyStatsUpdated();
      }
    }, delayMs);
    this.retryTimers.set(pathKey, {
      timer,
      folderId: task.folder ? task.folder.id : null,
      providerId: task.folder ? (task.folder.provider || 'google') : null
    });
  }

  // Live concurrency limit from settings (1-24, default 4). More parallel
  // uploads = higher total throughput, bounded by the provider's API limits.
  getMaxConcurrentUploads() {
    let n = 8;
    try {
      const raw = parseInt(db.getSetting('maxConcurrentUploads', '8'), 10);
      if (!isNaN(raw)) n = raw;
    } catch (_) {}
    if (n < 1) n = 1;
    if (n > 32) n = 32;
    return n;
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const deferred = [];

    while (this.uploadQueue.length > 0 && this.activeUploads < this.getMaxConcurrentUploads()) {
      const task = this.uploadQueue.shift();
      if (!task) break;

      const pathKey = this.normalizePathKey(task.filePath);
      if (this.uploadQueueKeys) this.uploadQueueKeys.delete(pathKey);
      if (this.uploadQueueMap) this.uploadQueueMap.delete(pathKey);

      // Skip tasks whose folder was removed or paused after being queued
      const freshFolder = db.getFolderById(task.folder.id);
      if (!freshFolder || freshFolder.is_paused) continue;
      task.folder = freshFolder;

      const providerId = task.folder.provider || 'google';
      const provider = getProvider(providerId);

      if (!provider) {
        // The linked account was removed: keep the files pending and warn once
        if (!this.missingProviderWarned.has(providerId)) {
          this.missingProviderWarned.add(providerId);
          this.log('error', mainT('log.providerMissing', { provider: providerId }), task.filePath);
        }
        deferred.push(task);
        continue;
      }

      if (!provider.isConnected()) {
        // Not authenticated yet, keep files pending in queue
        deferred.push(task);
        continue;
      }

      // Check storage quota before consuming the queue
      if (provider.isQuotaFull && provider.isQuotaFull()) {
        this.warnQuotaFull(provider);
        deferred.push(task);
        continue;
      }
      if (this.quotaWarnedProviders) this.quotaWarnedProviders.delete(provider.id);

      this.activeUploads++;
      this.inFlightUploads.add(pathKey);
      this.performUpload(task, provider).finally(() => {
        this.activeUploads--;
        this.inFlightUploads.delete(pathKey);
        if (this.pendingReuploads.has(pathKey)) {
          this.pendingReuploads.delete(pathKey);
          try {
            if (fs.existsSync(task.filePath)) {
              const stats = fs.statSync(task.filePath);
              const syncedFile = db.getFileByPath(task.filePath);
              // Only re-queue if the file on disk actually changed since it synced!
              if (
                !syncedFile ||
                syncedFile.status !== 'synced' ||
                syncedFile.last_modified !== Math.floor(stats.mtimeMs) ||
                syncedFile.file_size !== stats.size
              ) {
                this.enqueueUpload({ ...task, stats }, { deferProcess: true });
              }
            }
          } catch (_) {}
        }
        this.processQueue();
      });
    }

    if (deferred.length > 0) {
      this.uploadQueue.unshift(...deferred);
      if (!this.uploadQueueKeys) this.uploadQueueKeys = new Set();
      if (!this.uploadQueueMap) this.uploadQueueMap = new Map();
      for (const d of deferred) {
        const pk = this.normalizePathKey(d.filePath);
        this.uploadQueueKeys.add(pk);
        this.uploadQueueMap.set(pk, d);
      }
    }

    this.isProcessingQueue = false;
  }

  warnQuotaFull(provider) {
    if (!this.quotaWarnedProviders) this.quotaWarnedProviders = new Set();
    if (this.quotaWarnedProviders.has(provider.id)) return;
    this.quotaWarnedProviders.add(provider.id);
    this.log('error', mainT('log.quotaFullProvider', { provider: provider.label }));
    this.emit('quota:warning', { reason: 'full', provider: provider.id });
    this.notify(mainT('notify.quotaTitle'), mainT('notify.quotaBody'));
  }

  // Resolving/creating cloud folders is serialized: parallel uploads used to
  // race here and create DUPLICATE folders in the cloud (Drive/OneDrive/Dropbox
  // do not enforce unique folder names).
  resolveDriveDestinationFolder(folder, relativeFilePath, provider) {
    const run = () => this._resolveDestination(folder, relativeFilePath, provider, false);
    const result = this.resolveChain.then(run, run);
    this.resolveChain = result.then(() => {}, () => {});
    return result;
  }

  // Mirror (3-2-1) folder resolution — also serialized through the same chain
  resolveMirrorDestination(folder, relativeFilePath, provider) {
    const run = () => this._resolveDestination(folder, relativeFilePath, provider, true);
    const result = this.resolveChain.then(run, run);
    this.resolveChain = result.then(() => {}, () => {});
    return result;
  }

  // Ensure a directory path (relative to the watched folder) exists in the
  // cloud, creating every missing segment. Empty folders are supported because
  // this works from a plain relative path and needs no file inside.
  async _ensureCloudDirSegments(folder, folderRootDriveId, relativeDir, providerKey) {
    const segments = String(relativeDir || '').split(/[\\/]+/).filter((p) => p && p !== '.');
    let currentParentDriveId = folderRootDriveId;
    let accumulatedPath = '';

    for (const segment of segments) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;

      // Check SQLite cache for mapped cloud Folder ID (per provider)
      let cachedId = db.getDriveFolderMapping(folder.id, accumulatedPath, providerKey);
      if (!cachedId) {
        const provider = getProvider(providerKey);
        if (!provider) throw new Error(`Cloud provider unavailable: ${providerKey}`);
        cachedId = await provider.ensureFolder(segment, currentParentDriveId);
        db.setDriveFolderMapping(folder.id, accumulatedPath, cachedId, providerKey);
      }
      currentParentDriveId = cachedId;
    }

    return currentParentDriveId;
  }

  async _resolveDestination(folder, relativeFilePath, provider, mirror) {
    const providerKey = provider.id || folder.provider || 'google';

    // 1. Ensure the root backup folder
    const rootDriveId = await provider.ensureRootBackupFolder();

    // 2. Ensure the watched-folder root in the cloud (e.g. folder.name)
    let folderRootDriveId = null;
    if (mirror) {
      folderRootDriveId = db.getFolderMirrorRoot(folder.id, providerKey);
    } else {
      folderRootDriveId = folder.drive_folder_id;
      if (!folderRootDriveId) {
        // Re-check the DB: another queued file may have created it already
        const fresh = db.getFolderById(folder.id);
        folderRootDriveId = fresh ? fresh.drive_folder_id : null;
      }
    }
    if (!folderRootDriveId) {
      folderRootDriveId = await provider.ensureFolder(folder.name, rootDriveId);
      if (mirror) {
        db.setFolderMirrorRoot(folder.id, providerKey, folderRootDriveId);
      } else {
        db.updateFolderDriveId(folder.id, folderRootDriveId);
      }
    }

    // 3. Resolve subdirectories (if any) and return the leaf folder id
    const relativeDir = path.dirname(relativeFilePath);
    if (!relativeDir || relativeDir === '.' || relativeDir === '') {
      return folderRootDriveId;
    }
    return this._ensureCloudDirSegments(folder, folderRootDriveId, relativeDir, providerKey);
  }

  // Ensure a single relative directory path exists on the primary cloud and on
  // every configured mirror cloud (used for empty folders and newly added dirs).
  async ensureFolderPathInCloud(folder, relativeDir) {
    const primaryKey = folder.provider || 'google';
    const primary = getProvider(primaryKey);
    if (primary && primary.isConnected()) {
      try {
        const rootId = await primary.ensureRootBackupFolder();
        let folderRootId = folder.drive_folder_id;
        if (!folderRootId) {
          const fresh = db.getFolderById(folder.id);
          folderRootId = fresh ? fresh.drive_folder_id : null;
          if (fresh) folder = fresh;
        }
        if (!folderRootId) {
          folderRootId = await primary.ensureFolder(folder.name, rootId);
          db.updateFolderDriveId(folder.id, folderRootId);
        }
        await this._ensureCloudDirSegments(folder, folderRootId, relativeDir, primaryKey);
      } catch (err) {
        console.warn('ensureFolderPathInCloud (primary):', err.message);
      }
    }

    for (const mirrorId of this.getMirrorProviderIds(folder.id)) {
      const prov = getProvider(mirrorId);
      if (!prov || !prov.isConnected()) continue;
      try {
        const rootId = await prov.ensureRootBackupFolder();
        let mirrorRoot = db.getFolderMirrorRoot(folder.id, mirrorId);
        if (!mirrorRoot) {
          mirrorRoot = await prov.ensureFolder(folder.name, rootId);
          db.setFolderMirrorRoot(folder.id, mirrorId, mirrorRoot);
        }
        await this._ensureCloudDirSegments(folder, mirrorRoot, relativeDir, mirrorId);
      } catch (err) {
        console.warn('ensureFolderPathInCloud (mirror):', err.message);
      }
    }
  }

  // Collect every subdirectory (relative path) under a watched folder, including
  // completely empty ones, skipping ignored paths and symbolic links.
  collectRelativeDirs(rootPath) {
    const dirs = [];
    const stack = [''];
    while (stack.length) {
      const rel = stack.pop();
      const abs = rel ? path.join(rootPath, rel) : rootPath;
      let list;
      try { list = fs.readdirSync(abs); } catch (_) { continue; }
      for (const name of list) {
        const full = path.join(abs, name);
        if (this.shouldIgnorePath(rootPath, full)) continue;
        let lstat;
        try { lstat = fs.lstatSync(full); } catch (_) { continue; }
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          const childRel = rel ? path.join(rel, name) : name;
          dirs.push(childRel);
          stack.push(childRel);
        }
      }
    }
    return dirs;
  }

  // Mirror provider ids configured for a folder (excluding its primary)
  getMirrorProviderIds(folderId) {
    let folder = null;
    try { folder = db.getFolderById(folderId); } catch (_) {}
    if (!folder || !folder.mirror_providers) return [];
    let list = [];
    try { list = JSON.parse(folder.mirror_providers) || []; } catch (_) { list = []; }
    const primary = folder.provider || 'google';
    return list.filter((id) => id && id !== primary);
  }

  // Upload one file to every additional cloud (3-2-1 backups)
  async _uploadMirrors(folderId, filePath, relativePath) {
    const ids = this.getMirrorProviderIds(folderId);
    if (ids.length === 0) return;

    const folder = db.getFolderById(folderId);
    if (!folder || folder.is_paused) return;

    for (const mirrorId of ids) {
      const prov = getProvider(mirrorId);
      if (!prov) continue;
      if (!prov.isConnected()) {
        if (!this.missingProviderWarned.has(mirrorId)) {
          this.missingProviderWarned.add(mirrorId);
          this.log('warning', mainT('log.providerMissing', { provider: mirrorId }), filePath);
        }
        continue;
      }

      const existing = db.getFileMirror(filePath, mirrorId);
      try {
        const targetFolderId = await this.resolveMirrorDestination(folder, relativePath, prov);
        let size = null;
        try { size = fs.statSync(filePath).size; } catch (_) {}
        const res = await prov.uploadFile({
          localPath: filePath,
          fileName: path.basename(filePath),
          parentFolderId: targetFolderId,
          existingDriveFileId: existing ? existing.drive_file_id : null,
          fileSize: size,
          onProgress: null,
          throttle: (bytes) => this.throttleUpload(bytes)
        });
        db.setFileMirror({
          localPath: filePath,
          provider: mirrorId,
          driveFileId: res.driveFileId,
          driveFolderId: targetFolderId,
          status: 'synced'
        });
      } catch (err) {
        db.setFileMirror({
          localPath: filePath,
          provider: mirrorId,
          driveFileId: existing ? existing.drive_file_id : null,
          driveFolderId: existing ? existing.drive_folder_id : null,
          status: 'failed'
        });
        this.log('warning', `Mirror upload failed (${mirrorId}) for ${relativePath}: ${err.message}`, filePath);
      }
    }
  }

  // Send every already-synced file of a folder to the newly added mirror clouds
  async backfillMirrors(folderId) {
    const ids = this.getMirrorProviderIds(folderId);
    if (ids.length === 0) return { queued: 0 };
    const folder = db.getFolderById(folderId);
    if (!folder) return { queued: 0 };

    let files = [];
    try { files = db.getFiles({ folderId, status: 'synced', limit: 1000000, offset: 0 }); } catch (_) {}

    let queued = 0;
    for (const file of files) {
      if (!file.drive_file_id) continue;
      const needsMirror = ids.some((id) => {
        const m = db.getFileMirror(file.local_path, id);
        return !m || m.status !== 'synced';
      });
      if (!needsMirror) continue;
      let stats = null;
      try { stats = fs.statSync(file.local_path); } catch (_) { continue; }
      this.enqueueUpload({
        folder,
        trackedFile: file,
        filePath: file.local_path,
        relativePath: file.relative_path,
        stats,
        mirrorOnly: true
      });
      queued++;
    }

    if (queued > 0) {
      this.log('info', `Mirroring ${queued} existing file(s) to additional cloud account(s)...`);
    }
    return { queued };
  }

  async performUpload(task, provider) {
    const { folder, filePath, relativePath } = task;

    try {
      // Mirror-only tasks just push the file to the additional clouds
      if (task.mirrorOnly) {
        const liveFolder = db.getFolderById(folder.id);
        if (!liveFolder || liveFolder.is_paused || !fs.existsSync(filePath)) return;
        await this._uploadMirrors(liveFolder.id, filePath, relativePath);
        return;
      }

      if (!fs.existsSync(filePath)) {
        // Deleted locally before upload started
        if (this.getSyncMode() === 'mirror') {
          await this.propagateDelete(filePath, relativePath, provider);
        } else {
          // Respect Zero Deletion
          this.log('delete_ignored', mainT('log.deleteIgnoredPrior', { name: relativePath }));
          db.markFileLocalDeleted(filePath);
        }
        return;
      }

      db.updateFileStatus(filePath, 'syncing');
      this.emit('file:syncing', { filePath, relativePath });

      // Calculate MD5 hash
      const md5 = await this.calculateMD5(filePath);

      // Check if the exact same content is already on Drive (avoids redundant re-uploads)
      const existingFile = db.getFileByPath(filePath);
      const fileMtime = task.stats ? Math.floor(task.stats.mtimeMs) : null;
      if (existingFile && existingFile.drive_file_id && existingFile.status === 'synced') {
        if (md5 && existingFile.file_hash === md5) {
          this.uploadAttempts.delete(this.normalizePathKey(filePath));
          this.emit('file:synced', { filePath, relativePath, driveFileId: existingFile.drive_file_id });
          this.notifyStatsUpdated();
          return;
        }
        if (fileSize != null && existingFile.file_size === fileSize && fileMtime && existingFile.last_modified === fileMtime) {
          this.uploadAttempts.delete(this.normalizePathKey(filePath));
          this.emit('file:synced', { filePath, relativePath, driveFileId: existingFile.drive_file_id });
          this.notifyStatsUpdated();
          return;
        }
      }

      // Recreate or resolve folder hierarchy in the cloud
      const targetDriveFolderId = await this.resolveDriveDestinationFolder(folder, relativePath, provider);

      // Upload or update file
      this.log('info', mainT('log.uploading', { name: relativePath }), filePath);
      const fileName = path.basename(filePath);

      // Take the size at upload time: the queued stats snapshot may be stale
      let fileSize = null;
      try {
        fileSize = fs.statSync(filePath).size;
      } catch (_) {
        fileSize = task.stats && task.stats.size != null ? task.stats.size : null;
      }

      let lastProgressEmit = 0;
      const onProgress = (sent, total) => {
        const now = Date.now();
        if (sent < total && now - lastProgressEmit < 250) return;
        lastProgressEmit = now;
        this.emit('file:progress', {
          filePath,
          relativePath,
          sent,
          total,
          percent: total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0
        });
      };

      const uploadResult = await provider.uploadFile({
        localPath: filePath,
        fileName,
        parentFolderId: targetDriveFolderId,
        existingDriveFileId: existingFile ? existingFile.drive_file_id : null,
        fileSize,
        onProgress,
        throttle: (bytes) => this.throttleUpload(bytes)
      });

      // Update SQLite as successfully synced
      db.updateFileSynced({
        localPath: filePath,
        driveFileId: uploadResult.driveFileId,
        driveFolderId: targetDriveFolderId,
        fileHash: uploadResult.md5Checksum || md5,
        fileSize: uploadResult.size
      });

      // Statistics counters
      try {
        const uploadedBytes = parseInt(uploadResult.size, 10) || (fileSize || 0);
        db.recordUpload(uploadedBytes);
      } catch (_) {}

      this.uploadAttempts.delete(this.normalizePathKey(filePath));

      // Keep the local quota estimate fresh (protocol providers may not report quota)
      if (typeof provider.getStorageState === 'function') {
        const quota = provider.getStorageState();
        if (quota && typeof quota.usage === 'number' && uploadResult.size) {
          quota.usage += parseInt(uploadResult.size, 10) || 0;
        }
      }

      this.log('success', mainT('log.uploaded', { name: relativePath }), filePath);
      this.emit('file:synced', {
        filePath,
        relativePath,
        driveFileId: uploadResult.driveFileId
      });
      this.notifyStatsUpdated(folder.id);

      // Smart Installer Version Archiving:
      // If enabled, archive installer executables under their version tag (e.g. AuraSync-Setup-v1.7.65.exe)
      // as an independent standalone cloud copy so historic releases are never overwritten or lost!
      let shouldArchiveVersions = true;
      try {
        shouldArchiveVersions = db.getSetting('archiveInstallerVersions', 'true') === 'true';
      } catch (_) {}
      if (shouldArchiveVersions) {
        await this.archiveInstallerVersionIfNeeded(task, provider, targetDriveFolderId, fileSize);
      }

      // 3-2-1: replicate to the additional clouds configured for this folder
      await this._uploadMirrors(folder.id, filePath, relativePath);

      if (this.uploadQueue.length === 0 && this.activeUploads <= 1) {
        this.notify(mainT('notify.backupTitle'), mainT('notify.backupBody', { name: relativePath }));
      }
    } catch (err) {
      console.error(`Upload error for ${filePath}:`, err);
      const message = err && err.message ? err.message : String(err);
      const pathKey = this.normalizePathKey(filePath);
      const attempts = (this.uploadAttempts.get(pathKey) || 0) + 1;
      this.uploadAttempts.set(pathKey, attempts);

      const isAuthError = /invalid_grant|invalid_request|unauthorized|\b401\b|No access token|could not obtain/i.test(message);

      if (!isAuthError && attempts <= MAX_UPLOAD_RETRIES) {
        db.updateFileStatus(filePath, 'pending', message);
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempts - 1);
        this.log(
          'warning',
          mainT('log.retryIn', {
            attempt: attempts,
            max: MAX_UPLOAD_RETRIES,
            name: relativePath,
            error: message,
            seconds: Math.round(delay / 1000)
          }),
          filePath
        );
        this.scheduleRetry(task, delay);
      } else {
        db.updateFileStatus(filePath, 'failed', isAuthError ? `Re-authorization required: ${message}` : message);
        this.log('error', mainT('log.uploadFailedPermanently', { name: relativePath, error: message }), filePath);
        this.emit('file:failed', { filePath, relativePath, error: message });
        this.notify(mainT('notify.failedTitle'), mainT('notify.failedBody', { name: relativePath }));
      }

      this.emit('stats:updated', db.getAppStats());
    }
  }

  async retryFailed(folderId = null) {
    const failed = db.getFailedFiles(folderId);
    if (!failed || failed.length === 0) {
      return { success: true, queued: 0 };
    }

    let queued = 0;

    for (const file of failed) {
      const pKey = this.normalizePathKey(file.local_path);
      this.uploadAttempts.delete(pKey);
      const entry = this.retryTimers.get(pKey);
      if (entry) {
        clearTimeout(entry.timer);
        this.retryTimers.delete(pKey);
      }

      if (!fs.existsSync(file.local_path)) {
        db.markFileLocalDeleted(file.local_path);
        continue;
      }

      const folder = db.getFolderById(file.folder_id);
      if (!folder || folder.is_paused) continue;

      let stats;
      try {
        stats = fs.statSync(file.local_path);
      } catch (_) {
        continue;
      }

      // Only flip the status for files that are actually re-queued
      db.updateFileStatus(file.local_path, 'pending');
      this.enqueueUpload({
        folder,
        trackedFile: file,
        filePath: file.local_path,
        relativePath: file.relative_path,
        stats
      });
      queued++;
    }

    this.log('info', mainT('log.retryQueued', { count: queued }));
    this.emit('stats:updated', db.getAppStats());
    return { success: true, queued };
  }

  async retryFile(filePath) {
    const file = db.getFileByPath(filePath);
    if (!file) throw new Error('File is not tracked');

    const pKey = this.normalizePathKey(filePath);
    const entry = this.retryTimers.get(pKey);
    if (entry) {
      clearTimeout(entry.timer);
      this.retryTimers.delete(pKey);
    }
    this.uploadAttempts.delete(pKey);

    if (!fs.existsSync(filePath)) {
      db.markFileLocalDeleted(filePath);
      this.emit('stats:updated', db.getAppStats());
      return { success: true, queued: 0 };
    }

    db.updateFileStatus(filePath, 'pending');

    const folder = db.getFolderById(file.folder_id);
    if (!folder || folder.is_paused) {
      this.emit('stats:updated', db.getAppStats());
      return { success: true, queued: 0 };
    }

    const stats = fs.statSync(filePath);
    this.enqueueUpload({
      folder,
      trackedFile: file,
      filePath,
      relativePath: file.relative_path,
      stats
    });

    this.emit('stats:updated', db.getAppStats());
    return { success: true, queued: 1 };
  }

  async restoreFile(filePath, destRootDir) {
    const file = db.getFileByPath(filePath);
    if (!file) throw new Error('File is not tracked');
    if (!file.drive_file_id) throw new Error('This file has no cloud copy to restore');
    if (file.status === 'cloud_missing') throw new Error('الملف مفقود من السحابة — استخدم إعادة الرفع لحفظه بالسحابة مجدداً');

    const folder = db.getFolderById(file.folder_id);
    const provider = getProvider(folder ? (folder.provider || 'google') : 'google');
    if (!provider || !provider.isConnected()) throw new Error('Cloud provider is not connected');

    let destPath;
    if (destRootDir) {
      // Legacy mode: restore into a chosen destination folder
      destPath = path.join(destRootDir, file.relative_path);
    } else {
      // Exact restore: bring the file back to its original location
      destPath = file.local_path;
      try {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
      } catch (_) {}
    }

    let backupPath = null;
    if (fs.existsSync(destPath)) {
      // Exact-place guarantee: keep whatever is already there as a clearly
      // named backup, then put the cloud version back in the original spot.
      const ext = path.extname(destPath);
      const base = destPath.slice(0, destPath.length - ext.length);
      let candidate = `${base} (نسخة محلية قبل الاسترجاع)${ext}`;
      let n = 2;
      while (fs.existsSync(candidate)) {
        candidate = `${base} (نسخة محلية قبل الاسترجاع ${n})${ext}`;
        n++;
      }
      try {
        fs.renameSync(destPath, candidate);
        backupPath = candidate;
      } catch (_) {
        backupPath = null;
      }
    }

    let lastEmit = 0;
    const onProgress = (sent, total) => {
      const now = Date.now();
      if (sent < total && now - lastEmit < 250) return;
      lastEmit = now;
      this.emit('file:progress', {
        filePath,
        relativePath: file.relative_path,
        sent,
        total,
        percent: total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0,
        restoring: true
      });
    };

    let result;
    try {
      result = await provider.downloadFile({
        fileId: file.drive_file_id,
        destPath,
        onProgress
      });
    } catch (err) {
      // Roll the local backup back into place if the download failed
      if (backupPath) {
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        } catch (_) {}
        try {
          fs.renameSync(backupPath, destPath);
        } catch (_) {}
      }
      throw err;
    }

    // restored-inside-folder tracking refresh: if the file came back into its
    // watched folder, update its row immediately so the yellow "preserved"
    // mark disappears (and re-sync/verify it in the background).
    try {
      if (folder && folder.path) {
        const folderPrefix = String(folder.path).toLowerCase().replace(/[\\/]+$/, '') + path.sep;
        if (String(destPath).toLowerCase().startsWith(folderPrefix)) {
          const stat = fs.statSync(destPath);
          const rel = path.relative(folder.path, destPath);
          const tracked = db.upsertFile({
            localPath: destPath,
            relativePath: rel,
            folderId: folder.id,
            lastModified: Math.floor(stat.mtimeMs),
            fileSize: stat.size,
            fileHash: file.file_hash || null,
            status: 'pending'
          });
          db.updateFileStatus(destPath, 'pending');
          this.enqueueUpload({
            folder,
            trackedFile: tracked,
            filePath: destPath,
            relativePath: rel,
            stats: stat
          });
        }
      }
    } catch (_) {}

    this.log('success', mainT('log.restored', { name: file.relative_path }), destPath);
    return { success: true, destPath, size: result.size };
  }

  async scanAndSyncFolder(folderId) {
    const folder = db.getFolderById(folderId);
    if (!folder) return;

    if (folder.is_paused) {
      this.log('info', mainT('log.folderPaused', { name: folder.name }));
      return;
    }

    if (!fs.existsSync(folder.path)) {
      this.log('warning', mainT('log.folderMissing', { path: folder.path }));
      return;
    }

    // Pre-resolve cloud folder ID so all uploads and verifications use the same ID without racing
    const provider = getProvider(folder.provider || 'google');
    if (provider && provider.isConnected()) {
      try {
        const rootId = await provider.ensureRootBackupFolder();
        if (provider.deduplicateChildFolders) {
          await provider.deduplicateChildFolders(rootId).catch(() => {});
        }
        if (!folder.drive_folder_id) {
          const folderRootId = await provider.ensureFolder(folder.name, rootId);
          db.updateFolderDriveId(folder.id, folderRootId);
          folder.drive_folder_id = folderRootId;
        }
      } catch (err) {
        console.warn('Pre-resolving cloud folder root:', err.message);
      }
    }

    this.log('info', mainT('log.scanning', { name: folder.name }));

    const walkDir = async (dir) => {
      const results = [];
      const stack = [dir];
      let filesSinceYield = 0;

      while (stack.length > 0) {
        const currentDir = stack.pop();
        let list = [];
        try {
          list = fs.readdirSync(currentDir);
        } catch (_) {
          continue;
        }

        for (const file of list) {
          const fullPath = path.join(currentDir, file);
          if (this.shouldIgnorePath(folder.path, fullPath)) continue;
          try {
            const lstat = fs.lstatSync(fullPath);
            if (lstat.isSymbolicLink()) continue; // avoid symlink loops / duplicates
            if (lstat.isDirectory()) {
              stack.push(fullPath);
            } else if (lstat.isFile()) {
              const stat = fs.statSync(fullPath);
              if (this.isOverSizeLimit(fullPath, stat.size)) continue;
              results.push({ fullPath, stat });
              filesSinceYield++;
              if (filesSinceYield >= 120) {
                filesSinceYield = 0;
                await new Promise((resolve) => setImmediate(resolve));
              }
            }
          } catch (_) {}
        }
      }
      return results;
    };

    const files = await walkDir(folder.path);
    let queuedCount = 0;
    const existingFilesMap = typeof db.getFilesMapByFolder === 'function' ? db.getFilesMapByFolder(folder.id) : null;
    const hasPendingDeletions = typeof db.getTotalPendingCloudDeletionsCount === 'function' ? db.getTotalPendingCloudDeletionsCount() > 0 : true;

    const BATCH_SIZE = 500;
    let pendingBatch = [];
    let pendingTasks = [];

    const flushBatch = () => {
      if (pendingBatch.length === 0) return;
      db.upsertFilesBatch(pendingBatch);
      for (const t of pendingTasks) {
        this.enqueueUpload(t, { deferProcess: true });
        queuedCount++;
      }
      pendingBatch = [];
      pendingTasks = [];
    };

    for (let i = 0; i < files.length; i++) {
      if (i > 0 && i % 250 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const item = files[i];
      const normKey = path.normalize(item.fullPath).toLowerCase();
      if (hasPendingDeletions) {
        db.clearPendingCloudDeletions(item.fullPath);
      }
      const existing = existingFilesMap ? existingFilesMap.get(normKey) : db.getFileByPath(item.fullPath);
      const mtime = Math.floor(item.stat.mtimeMs);

      // Deliberately deleted from the cloud → keep the marker until the user
      // re-uploads it (or edits the file locally, which clears it naturally).
      if (
        existing &&
        existing.status === 'cloud_missing' &&
        existing.last_modified === mtime &&
        existing.file_size === item.stat.size
      ) {
        continue;
      }

      if (!existing || existing.status !== 'synced' || existing.last_modified !== mtime) {
        const relativePath = path.relative(folder.path, item.fullPath);
        pendingBatch.push({
          localPath: item.fullPath,
          relativePath,
          folderId: folder.id,
          lastModified: mtime,
          fileSize: item.stat.size,
          fileHash: existing ? existing.file_hash : null,
          status: 'pending',
          isExisting: Boolean(existing)
        });

        pendingTasks.push({
          folder,
          filePath: item.fullPath,
          relativePath,
          stats: item.stat
        });

        if (pendingBatch.length >= BATCH_SIZE) {
          flushBatch();
          // Kick off parallel upload workers immediately while scanning continues!
          if (queuedCount > 0 && !this.isProcessingQueue) {
            this.processQueue();
          }
        }
      }
    }

    flushBatch();

    if (queuedCount > 0) {
      this.processQueue();
    }

    // Ensure all empty subdirectories exist in cloud in the background without blocking execution
    setImmediate(async () => {
      try {
        const relativeDirs = this.collectRelativeDirs(folder.path);
        for (const relDir of relativeDirs) {
          await this.ensureFolderPathInCloud(folder, relDir);
          await new Promise((r) => setImmediate(r));
        }
      } catch (dirErr) {
        console.warn('Folder hierarchy sync error:', dirErr.message);
      }
    });

    db.updateFolderStats(folder.id);
    this.log('info', mainT('log.scanComplete', { name: folder.name, total: files.length, queued: queuedCount }));
    this.emit('stats:updated', db.getAppStats());

    // Verify that cloud copies still exist (detects files deleted from the cloud side)
    this.verifyFolderCloud(folder.id).catch(() => {});

    // Manual "sync now" checks both directions for reverse-sync folders
    if (folder.reverse_sync === 1) {
      this.reverseSyncFolder(folder.id).catch(() => {});
    }
  }

  async scanAllFolders() {
    for (const pending of db.getPendingCloudDeletions()) {
      try {
        const stat = fs.lstatSync(pending.local_path);
        if (stat.isFile() && !stat.isSymbolicLink()) db.clearPendingCloudDeletions(pending.local_path);
      } catch (_) {}
    }
    await this.processPendingCloudDeletions();
    const folders = db.getFolders();
    for (const folder of folders) {
      if (!folder.is_paused) {
        await this.scanAndSyncFolder(folder.id);
      }
    }
  }

  handleCloudFormatted(providerId = null) {
    const target = providerId || 'all';

    if (target === 'all') {
      this.uploadQueue = [];
      this.inFlightUploads.clear();
      this.pendingReuploads.clear();
      for (const entry of this.retryTimers.values()) clearTimeout(entry.timer);
      this.retryTimers.clear();
      this.uploadAttempts.clear();
    } else {
      this.uploadQueue = this.uploadQueue.filter(task => (task.folder.provider || 'google') !== target);
      for (const [filePath, entry] of Array.from(this.retryTimers.entries())) {
        if (entry.providerId === target) {
          clearTimeout(entry.timer);
          this.retryTimers.delete(filePath);
        }
      }
      this.uploadAttempts.clear();
    }

    db.resetCloudSyncState(target);

    // Detach watchers for the wiped folders: resetCloudSyncState paused them,
    // and this makes sure no local change re-uploads into the emptied cloud.
    for (const folder of db.getFolders()) {
      const folderProvider = folder.provider || 'google';
      if (target === 'all' || folderProvider === target) {
        this.unwatchFolder(folder.id);
      }
    }

    this.log(
      'info',
      'تمت تهيئة وتفريغ السحابة بالكامل (0 جيجابايت). تم إيقاف المزامنة التلقائية مؤقتاً للحفاظ على تصفير السحابة.'
    );

    this.emit('folders:updated');
    this.emit('stats:updated', db.getAppStats());
  }
}

module.exports = new SyncEngine();
