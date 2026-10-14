'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');
const { getProvider, getConnectedProviders } = require('./cloud-providers');
const { prepareSafeOutputPath } = require('./safe-path');
const folderDecorator = require('./folder-decorator');

const MANIFEST_FILE_NAME = 'aurasync-machine-manifest.json';

class DisasterRecoveryEngine {
  constructor() {
    this.activeTask = null;
    this.isAborted = false;
    this.syncEngine = null;
  }

  setSyncEngine(engine) {
    this.syncEngine = engine;
  }

  // Determine smart suggested local path for a cloud folder name
  getSmartLocalPath(folderName, manifestPaths = {}) {
    if (!folderName) return null;
    const clean = folderName.trim();

    // 1. Check if manifest has an original path recorded
    if (manifestPaths[clean]) {
      const recorded = manifestPaths[clean];
      // If drive/path is accessible on current machine or parent directory exists, use it
      try {
        const root = path.parse(recorded).root;
        if (root && fs.existsSync(root)) {
          return recorded;
        }
      } catch (_) {}
    }

    const userProfile = process.env.USERPROFILE || process.env.HOME || path.join('C:', 'Users', os.userInfo().username);
    const oneDrive = process.env.OneDrive || process.env.ONEDRIVE;
    const lower = clean.toLowerCase();

    // Standard Windows shell folders mapping (English & Arabic)
    if (lower === 'desktop' || lower === 'سطح المكتب') {
      if (oneDrive && fs.existsSync(path.join(oneDrive, 'Desktop'))) return path.join(oneDrive, 'Desktop');
      return path.join(userProfile, 'Desktop');
    }
    if (lower === 'documents' || lower === 'المستندات' || lower === 'وثائق') {
      if (oneDrive && fs.existsSync(path.join(oneDrive, 'Documents'))) return path.join(oneDrive, 'Documents');
      return path.join(userProfile, 'Documents');
    }
    if (lower === 'pictures' || lower === 'photos' || lower === 'الصور') {
      if (oneDrive && fs.existsSync(path.join(oneDrive, 'Pictures'))) return path.join(oneDrive, 'Pictures');
      return path.join(userProfile, 'Pictures');
    }
    if (lower === 'videos' || lower === 'فيديو' || lower === 'الفيديوهات') {
      return path.join(userProfile, 'Videos');
    }
    if (lower === 'music' || lower === 'موسيقى' || lower === 'صوتيات') {
      return path.join(userProfile, 'Music');
    }
    if (lower === 'downloads' || lower === 'تنزيلات' || lower === 'التنزيلات') {
      return path.join(userProfile, 'Downloads');
    }

    // Default to User Profile / AuraSync / [FolderName]
    return path.join(userProfile, 'AuraSync', clean);
  }

  // Scan all connected clouds to discover recoverable backups
  async scanBackups(targetProviderId = null) {
    try {
      let providersToScan = [];
      if (targetProviderId) {
        const p = getProvider(targetProviderId);
        if (p && p.isConnected()) providersToScan.push(p);
      } else if (typeof getConnectedProviders === 'function') {
        providersToScan = getConnectedProviders();
      } else {
        const p = getProvider('google');
        if (p && p.isConnected()) providersToScan.push(p);
      }

      if (providersToScan.length === 0) {
        return { success: false, error: 'No connected cloud accounts found', backups: [] };
      }

      const localFolders = db.getFolders();
      const discoveredBackups = [];

      for (const provider of providersToScan) {
        if (!provider || !provider.isConnected()) continue;

        try {
          const rootId = await provider.ensureRootBackupFolder();
          const items = await provider.listFolder(rootId);

          let manifest = null;
          const manifestItem = (items || []).find((it) => !it.isDir && it.name === MANIFEST_FILE_NAME);
          if (manifestItem) {
            try {
              const tmpManifestPath = path.join(os.tmpdir(), `aurasync_manifest_${Date.now()}.json`);
              await provider.downloadFile({ fileId: manifestItem.id, destPath: tmpManifestPath });
              if (fs.existsSync(tmpManifestPath)) {
                manifest = JSON.parse(fs.readFileSync(tmpManifestPath, 'utf8'));
                try { fs.unlinkSync(tmpManifestPath); } catch (_) {}
              }
            } catch (mErr) {
              console.warn('Could not read cloud manifest:', mErr.message);
            }
          }

          const manifestPaths = {};
          if (manifest && Array.isArray(manifest.folders)) {
            for (const mf of manifest.folders) {
              if (mf && mf.name && mf.path) {
                manifestPaths[mf.name] = mf.path;
              }
            }
          }

          for (const item of items || []) {
            if (!item.isDir) continue;
            if (item.name === '_Snapshots' || item.name.startsWith('.')) continue;

            const isAlreadyLocal = localFolders.some((lf) => {
              const nameMatch = lf.name && lf.name.trim().toLowerCase() === item.name.trim().toLowerCase();
              const idMatch = lf.drive_folder_id && lf.drive_folder_id === item.id;
              return nameMatch || idMatch;
            });

            // Fast recursive file scan with cycle guard
            let fileCount = 0;
            let folderCount = 0;
            let totalBytes = 0;
            const visited = new Set();

            const walk = async (folderId) => {
              if (visited.has(folderId) || visited.size > 200) return;
              visited.add(folderId);
              try {
                const children = await provider.listFolder(folderId);
                for (const child of children || []) {
                  if (child.isDir) {
                    if (child.name !== '_Snapshots') {
                      folderCount++;
                      await walk(child.id);
                    }
                  } else {
                    fileCount++;
                    totalBytes += (child.size || 0);
                  }
                }
              } catch (_) {}
            };

            await walk(item.id);

            const suggestedPath = this.getSmartLocalPath(item.name, manifestPaths);
            const isSystemFolder = [
              'desktop', 'documents', 'pictures', 'photos', 'videos', 'music', 'downloads',
              'سطح المكتب', 'المستندات', 'الصور', 'الفيديوهات', 'الموسيقى', 'التنزيلات'
            ].includes(item.name.trim().toLowerCase());

            discoveredBackups.push({
              cloudFolderId: item.id,
              folderName: item.name,
              providerId: provider.id,
              providerLabel: provider.label || provider.id,
              fileCount,
              folderCount,
              totalBytes,
              suggestedPath,
              isSystemFolder,
              alreadyWatched: isAlreadyLocal,
              originalMachine: manifest?.machine || null,
              originalPath: manifestPaths[item.name] || null
            });
          }
        } catch (provErr) {
          console.warn(`Error scanning backups for provider ${provider.id}:`, provErr.message);
        }
      }

      return {
        success: true,
        backups: discoveredBackups,
        manifestFound: discoveredBackups.some((b) => !!b.originalMachine)
      };
    } catch (err) {
      return { success: false, error: err.message, backups: [] };
    }
  }

  // Save current machine backup manifest to cloud root
  async saveMachineManifest() {
    try {
      const providers = typeof getConnectedProviders === 'function' ? getConnectedProviders() : [];
      if (providers.length === 0) return;

      const folders = db.getFolders();
      if (!folders || folders.length === 0) return;

      const manifestData = {
        machine: os.hostname(),
        platform: process.platform,
        arch: os.arch(),
        updatedAt: new Date().toISOString(),
        folders: folders.map((f) => ({
          name: f.name,
          path: f.path,
          providerId: f.provider || 'google'
        }))
      };

      const tmpPath = path.join(os.tmpdir(), `aurasync_manifest_${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(manifestData, null, 2), 'utf8');

      for (const provider of providers) {
        if (!provider || !provider.isConnected()) continue;
        try {
          const rootId = await provider.ensureRootBackupFolder();
          const items = await provider.listFolder(rootId);
          const existing = (items || []).find((it) => !it.isDir && it.name === MANIFEST_FILE_NAME);

          if (existing && typeof provider.uploadFile === 'function') {
            await provider.uploadFile({
              filePath: tmpPath,
              fileName: MANIFEST_FILE_NAME,
              parentFolderId: rootId,
              existingDriveFileId: existing.id
            });
          } else if (typeof provider.uploadFile === 'function') {
            await provider.uploadFile({
              filePath: tmpPath,
              fileName: MANIFEST_FILE_NAME,
              parentFolderId: rootId
            });
          }
        } catch (upErr) {
          console.warn(`Could not upload manifest to ${provider.id}:`, upErr.message);
        }
      }

      try { fs.unlinkSync(tmpPath); } catch (_) {}
    } catch (err) {
      console.warn('saveMachineManifest error:', err.message);
    }
  }

  // Cancel ongoing disaster recovery process
  cancelRecovery() {
    this.isAborted = true;
    if (this.activeTask) {
      this.activeTask.aborted = true;
    }
  }

  // Execute full 1-click disaster recovery plan
  async startRecovery(plan, options = {}, onProgress = null) {
    if (this.activeTask && !this.activeTask.finished) {
      throw new Error('A disaster recovery process is already running');
    }

    this.isAborted = false;
    const task = {
      aborted: false,
      finished: false,
      startTime: Date.now(),
      totalFolders: (plan || []).length,
      currentFolderIndex: 0,
      currentFolderName: '',
      totalFiles: 0,
      processedFiles: 0,
      downloadedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      currentFileName: '',
      speedBytesPerSec: 0,
      errors: []
    };
    this.activeTask = task;

    const skipExisting = options.skipExisting !== false;
    const concurrency = Math.max(2, Math.min(8, options.concurrency || 4));

    let lastBytesSample = 0;
    let lastTimeSample = Date.now();

    const emitProgress = (status = 'running', extra = {}) => {
      const now = Date.now();
      const elapsedSec = (now - lastTimeSample) / 1000;
      if (elapsedSec >= 0.5) {
        const deltaBytes = task.downloadedBytes - lastBytesSample;
        task.speedBytesPerSec = deltaBytes > 0 ? Math.round(deltaBytes / elapsedSec) : 0;
        lastBytesSample = task.downloadedBytes;
        lastTimeSample = now;
      }

      const payload = {
        status,
        aborted: this.isAborted,
        totalFolders: task.totalFolders,
        folderIndex: task.currentFolderIndex,
        currentFolder: task.currentFolderName,
        currentFile: task.currentFileName,
        processedFiles: task.processedFiles,
        totalFiles: task.totalFiles,
        downloadedFiles: task.downloadedFiles,
        skippedFiles: task.skippedFiles,
        failedFiles: task.failedFiles,
        downloadedBytes: task.downloadedBytes,
        totalBytes: task.totalBytes,
        speedBytesPerSec: task.speedBytesPerSec,
        percent: task.totalFiles > 0 ? Math.min(100, Math.round((task.processedFiles / task.totalFiles) * 100)) : 0,
        ...extra
      };

      if (typeof onProgress === 'function') {
        try { onProgress(payload); } catch (_) {}
      }
    };

    const restoredFolders = [];

    try {
      // Phase 1: Pre-scan tree to get accurate grand total of files & bytes
      emitProgress('scanning', { message: 'فحص شجرة المجلدات السحابية والملفات...' });

      const folderJobs = [];
      for (const item of plan) {
        if (this.isAborted) break;
        const provider = getProvider(item.providerId || 'google');
        if (!provider || !provider.isConnected()) {
          task.errors.push(`Cloud provider "${item.providerId}" is disconnected`);
          continue;
        }

        const cloudFiles = [];
        const activeIds = new Set();

        const walk = async (id, relDir) => {
          if (this.isAborted || activeIds.has(id)) return;
          activeIds.add(id);
          try {
            const children = await provider.listFolder(id);
            for (const child of children || []) {
              if (this.isAborted) break;
              if (child.isDir) {
                if (child.name !== '_Snapshots') {
                  await walk(child.id, relDir ? `${relDir}/${child.name}` : child.name);
                }
              } else if (child.name) {
                const relPath = relDir ? `${relDir}/${child.name}` : child.name;
                cloudFiles.push({
                  id: child.id,
                  name: child.name,
                  relativePath: relPath,
                  size: child.size || 0
                });
              }
            }
          } finally {
            activeIds.delete(id);
          }
        };

        await walk(item.cloudFolderId, '');
        task.totalFiles += cloudFiles.length;
        task.totalBytes += cloudFiles.reduce((sum, f) => sum + (f.size || 0), 0);

        folderJobs.push({
          config: item,
          provider,
          files: cloudFiles
        });
      }

      if (this.isAborted) {
        task.finished = true;
        emitProgress('aborted');
        return { success: false, aborted: true };
      }

      // Phase 2: Execute concurrent restoration folder by folder
      for (let i = 0; i < folderJobs.length; i++) {
        if (this.isAborted) break;

        const job = folderJobs[i];
        task.currentFolderIndex = i + 1;
        task.currentFolderName = job.config.folderName;

        const targetRoot = path.resolve(job.config.targetPath);
        if (!fs.existsSync(targetRoot)) {
          fs.mkdirSync(targetRoot, { recursive: true });
        }

        // Bounded worker pool for downloading files in parallel
        let fileIndex = 0;
        const totalJobFiles = job.files.length;
        const workers = [];

        const downloadWorker = async () => {
          while (fileIndex < totalJobFiles && !this.isAborted) {
            const cf = job.files[fileIndex++];
            if (!cf) break;

            task.currentFileName = cf.relativePath;
            task.processedFiles++;

            let localDest;
            try {
              localDest = prepareSafeOutputPath(targetRoot, cf.relativePath);
            } catch (pErr) {
              task.failedFiles++;
              task.errors.push(`Invalid safe path: ${cf.relativePath}`);
              emitProgress('running');
              continue;
            }

            // Check if identical file already exists locally
            if (skipExisting && fs.existsSync(localDest)) {
              try {
                const stat = fs.statSync(localDest);
                if (stat.size === (cf.size || 0)) {
                  task.skippedFiles++;
                  task.downloadedBytes += (cf.size || 0);
                  emitProgress('running');
                  continue;
                }
              } catch (_) {}
            }

            // Perform download
            try {
              await job.provider.downloadFile({
                fileId: cf.id,
                destPath: localDest
              });
              task.downloadedFiles++;
              task.downloadedBytes += (cf.size || 0);
            } catch (dlErr) {
              task.failedFiles++;
              task.errors.push(`Failed downloading ${cf.name}: ${dlErr.message}`);
            }

            emitProgress('running');
          }
        };

        const activeWorkers = Math.min(concurrency, totalJobFiles);
        for (let w = 0; w < activeWorkers; w++) {
          workers.push(downloadWorker());
        }
        await Promise.all(workers);

        if (this.isAborted) break;

        // Auto-Watch and integrate folder into AuraSync database
        if (job.config.autoWatch !== false) {
          try {
            let existingFolder = db.getFolders().find(
              (f) => path.normalize(f.path).toLowerCase() === targetRoot.toLowerCase()
            );

            if (!existingFolder) {
              existingFolder = db.addFolder(targetRoot, job.config.folderName, job.config.providerId);
            }

            if (existingFolder && existingFolder.id) {
              db.updateFolderDriveId(existingFolder.id, job.config.cloudFolderId);
              db.setFolderReverseSync(existingFolder.id, 1);

              // Index all downloaded files as synced
              for (const cf of job.files) {
                try {
                  const filePath = path.join(targetRoot, ...cf.relativePath.split('/'));
                  if (fs.existsSync(filePath)) {
                    const st = fs.statSync(filePath);
                    const rel = path.relative(targetRoot, filePath);
                    db.upsertFile({
                      localPath: filePath,
                      relativePath: rel,
                      folderId: existingFolder.id,
                      lastModified: Math.floor(st.mtimeMs),
                      fileSize: st.size,
                      fileHash: null,
                      status: 'synced'
                    });
                    db.updateFileSynced({
                      localPath: filePath,
                      driveFileId: cf.id,
                      driveFolderId: null,
                      fileHash: null,
                      fileSize: st.size
                    });
                  }
                } catch (_) {}
              }

              // Watch folder with sync engine and decorate in Windows Explorer
              if (this.syncEngine && typeof this.syncEngine.watchFolder === 'function') {
                const refreshed = db.getFolderById(existingFolder.id);
                this.syncEngine.watchFolder(refreshed);
              }
              folderDecorator.decorateFolder(targetRoot);
              restoredFolders.push(existingFolder);
            }
          } catch (watchErr) {
            console.warn(`Failed auto-watching folder ${job.config.folderName}:`, watchErr.message);
          }
        }
      }

      task.finished = true;

      if (this.isAborted) {
        emitProgress('aborted');
        return { success: false, aborted: true };
      }

      emitProgress('completed');

      // Update machine manifest after successful restoration
      this.saveMachineManifest().catch(() => {});

      return {
        success: true,
        restoredFolders,
        downloadedFiles: task.downloadedFiles,
        skippedFiles: task.skippedFiles,
        failedFiles: task.failedFiles,
        totalFiles: task.totalFiles,
        downloadedBytes: task.downloadedBytes,
        durationMs: Date.now() - task.startTime
      };
    } catch (err) {
      task.finished = true;
      emitProgress('error', { error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = new DisasterRecoveryEngine();
