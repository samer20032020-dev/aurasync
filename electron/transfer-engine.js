const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');
const { getProvider } = require('./cloud-providers');
const { prepareSafeOutputPath } = require('./safe-path');

// Transfer descriptors:
//   { kind: 'device', path: 'C:\\...', label: '...' }
//   { kind: 'cloud', provider: 'google'|'onedrive', folderId: null|'...', label: '...' }

class TransferEngine {
  constructor() {
    this.transfers = new Map();
    this.eventEmitter = null;
    this.seq = 0;
  }

  setEventEmitter(fn) {
    this.eventEmitter = fn;
  }

  emit(channel, data) {
    if (this.eventEmitter) {
      try {
        this.eventEmitter(channel, data);
      } catch (_) {}
    }
  }

  list() {
    return Array.from(this.transfers.values()).map((t) => ({ ...t }));
  }

  async start({ source, destination }) {
    if (!source || !destination) throw new Error('Source and destination are required');
    if (source.kind === 'device' && !source.path) throw new Error('Choose a source folder');
    if (destination.kind === 'device' && !destination.path) throw new Error('Choose a destination folder');

    const id = `transfer-${Date.now()}-${++this.seq}`;
    const transfer = {
      id,
      source,
      destination,
      status: 'running',
      filesTotal: 0,
      filesDone: 0,
      filesFailed: 0,
      bytesTotal: 0,
      bytesDone: 0,
      currentFile: null,
      error: null,
      canceled: false,
      startedAt: Date.now(),
      finishedAt: null
    };

    this.transfers.set(id, transfer);
    this.broadcast(transfer);
    this.run(transfer)
      .then(() => this.finish(transfer, null))
      .catch((err) => this.finish(transfer, err));
    return { success: true, id };
  }

  cancel(id) {
    const transfer = this.transfers.get(id);
    if (!transfer) return { success: false };
    transfer.canceled = true;
    this.broadcast(transfer);
    return { success: true };
  }

  clearFinished() {
    for (const [id, transfer] of this.transfers) {
      if (transfer.status !== 'running') this.transfers.delete(id);
    }
    return { success: true };
  }

  broadcast(transfer) {
    transfer.lastBroadcastAt = Date.now();
    this.emit('transfer:progress', { ...transfer });
  }

  broadcastThrottled(transfer) {
    const now = Date.now();
    if (transfer.lastBroadcastAt && now - transfer.lastBroadcastAt < 300) return;
    this.broadcast(transfer);
  }

  finish(transfer, err) {
    transfer.finishedAt = Date.now();
    if (err) {
      transfer.status = 'failed';
      transfer.error = err.message;
    } else if (transfer.canceled) {
      transfer.status = 'canceled';
    } else {
      transfer.status = 'done';
    }
    this.broadcast(transfer);

    const type = transfer.status === 'failed' ? 'error' : 'success';
    db.addLog(
      type,
      `Transfer ${transfer.status}: ${transfer.filesDone}/${transfer.filesTotal} files` +
        (err ? ` — ${err.message}` : '')
    );
  }

  async resolveRoot(descriptor, provider) {
    if (descriptor.kind === 'device') return descriptor.path;
    if (descriptor.folderId) return descriptor.folderId;
    return await provider.ensureRootBackupFolder();
  }

  safeJoin(rootDir, relative) {
    return prepareSafeOutputPath(rootDir, relative);
  }

  async collectSource(descriptor, provider, root, transfer = null) {
    const files = [];
    // Every directory (including empty ones) so the destination mirrors the tree.
    const dirs = [];

    if (descriptor.kind === 'device') {
      const walk = (dir, relativeDir) => {
        if (transfer && transfer.canceled) return;
        let list = [];
        try {
          list = fs.readdirSync(dir);
        } catch (_) {
          return;
        }
        for (const name of list) {
          if (transfer && transfer.canceled) return;
          const fullPath = path.join(dir, name);
          const rel = relativeDir ? `${relativeDir}/${name}` : name;
          let lstat;
          try {
            lstat = fs.lstatSync(fullPath);
          } catch (_) {
            continue;
          }
          if (lstat.isSymbolicLink()) continue;
          if (lstat.isDirectory()) {
            dirs.push(rel);
            walk(fullPath, rel);
          } else if (lstat.isFile()) {
            files.push({ relativePath: rel, size: lstat.size, sourcePath: fullPath });
          }
        }
      };
      walk(root, '');
      return { files, dirs };
    }

    const walkCloud = async (folderId, relativeDir) => {
      if (transfer && transfer.canceled) return;
      const items = await provider.listFolder(folderId);
      for (const item of items) {
        if (transfer && transfer.canceled) return;
        // Cloud names may contain characters that are illegal on Windows
        const safeName = String(item.name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_');
        if (!safeName) continue;
        const rel = relativeDir ? `${relativeDir}/${safeName}` : safeName;
        if (item.isDir) {
          dirs.push(rel);
          await walkCloud(item.id, rel);
        } else {
          files.push({ relativePath: rel, size: item.size || 0, sourceId: item.id });
        }
      }
    };
    await walkCloud(root, '');
    return { files, dirs };
  }

  // Create every collected directory at the destination (so empty folders exist too).
  async ensureDestinationDirs(dirs, dstProvider, dstRoot, dirCache) {
    if (!dirs.length) return;
    if (dstProvider) {
      // Shallow-first so parents exist before children.
      const sorted = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length);
      for (const dir of sorted) {
        await this.ensureCloudDir(dstProvider, dstRoot, dir, dirCache);
      }
    } else {
      for (const dir of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)) {
        const destDir = this.safeJoin(dstRoot, dir);
        await fs.promises.mkdir(destDir, { recursive: true });
      }
    }
  }

  async ensureCloudDir(provider, rootId, relativeDir, dirCache) {
    if (!relativeDir) return rootId;
    if (dirCache.has(relativeDir)) return dirCache.get(relativeDir);

    const segments = relativeDir.split('/').filter(Boolean);
    let parent = rootId;
    let accumulated = '';

    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      if (dirCache.has(accumulated)) {
        parent = dirCache.get(accumulated);
        continue;
      }
      const id = await provider.ensureFolder(segment, parent);
      dirCache.set(accumulated, id);
      parent = id;
    }
    return parent;
  }

  async transferOne(transfer, entry, srcProvider, dstProvider, dstRoot, dirCache, tempDir, onProgress) {
    const relativeDir = path.dirname(entry.relativePath).split(/[\\/]/).filter((p) => p && p !== '.').join('/');
    const fileName = path.basename(entry.relativePath);

    let localSource = null;
    let temporary = false;

    if (srcProvider) {
      if (!dstProvider) {
        // Cloud -> device
        const destPath = this.safeJoin(dstRoot, entry.relativePath);
        await srcProvider.downloadFile({ fileId: entry.sourceId, destPath, onProgress });
        return;
      }
      // Cloud -> cloud: download to a temp file first
      localSource = path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`);
      await srcProvider.downloadFile({ fileId: entry.sourceId, destPath: localSource, onProgress: null });
      temporary = true;
    } else {
      localSource = entry.sourcePath;
    }

    if (dstProvider) {
      const parentId = await this.ensureCloudDir(dstProvider, dstRoot, relativeDir, dirCache);
      let uploadSize = entry.size;
      try {
        uploadSize = fs.statSync(localSource).size;
      } catch (_) {}
      await dstProvider.uploadFile({
        localPath: localSource,
        fileName,
        parentFolderId: parentId,
        existingDriveFileId: null,
        fileSize: uploadSize,
        onProgress
      });
    } else {
      const destPath = this.safeJoin(dstRoot, entry.relativePath);
      await fs.promises.copyFile(localSource, destPath);
      if (onProgress) onProgress(entry.size || 0);
    }

    if (temporary && localSource) {
      try { fs.unlinkSync(localSource); } catch (_) {}
    }
  }

  async run(transfer) {
    const srcDescriptor = transfer.source || {};
    const dstDescriptor = transfer.destination || {};
    const srcProvider = srcDescriptor.kind === 'cloud'
      ? getProvider(srcDescriptor.accountId || srcDescriptor.provider)
      : null;
    const dstProvider = dstDescriptor.kind === 'cloud'
      ? getProvider(dstDescriptor.accountId || dstDescriptor.provider)
      : null;

    if (!srcProvider && srcDescriptor.kind === 'cloud') throw new Error('Source cloud account no longer exists');
    if (!dstProvider && dstDescriptor.kind === 'cloud') throw new Error('Destination cloud account no longer exists');
    if (srcProvider && !srcProvider.isConnected()) throw new Error('Source cloud account is not connected');
    if (dstProvider && !dstProvider.isConnected()) throw new Error('Destination cloud account is not connected');
    if (srcProvider && !srcProvider.isConfigured()) throw new Error('Source cloud is not configured');
    if (dstProvider && !dstProvider.isConfigured()) throw new Error('Destination cloud is not configured');

    const srcRoot = await this.resolveRoot(transfer.source, srcProvider);
    const dstRoot = await this.resolveRoot(transfer.destination, dstProvider);

    const { files: entries, dirs } = await this.collectSource(transfer.source, srcProvider, srcRoot, transfer);
    transfer.filesTotal = entries.length;
    transfer.bytesTotal = entries.reduce((sum, e) => sum + (e.size || 0), 0);
    this.broadcast(transfer);

    const dirCache = new Map();
    const tempDir = path.join(os.tmpdir(), `cloudvault-transfer-${transfer.id}`);
    if (srcProvider && dstProvider) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Mirror the full folder tree first (so empty folders are created too).
      await this.ensureDestinationDirs(dirs, dstProvider, dstRoot, dirCache);

      if (entries.length === 0) return;

      for (const entry of entries) {
        if (transfer.canceled) break;

        transfer.currentFile = entry.relativePath;
        this.broadcast(transfer);

        const baseBytes = transfer.bytesDone;
        const onProgress = (sent) => {
          transfer.bytesDone = baseBytes + (sent || 0);
          this.broadcastThrottled(transfer);
        };

        try {
          await this.transferOne(
            transfer,
            entry,
            srcProvider,
            dstProvider,
            dstRoot,
            dirCache,
            tempDir,
            onProgress
          );
        } catch (err) {
          transfer.filesFailed = (transfer.filesFailed || 0) + 1;
          transfer.error = `Last failure (${entry.relativePath}): ${err.message}`;
          db.addLog('error', `Transfer failed for ${entry.relativePath}: ${err.message}`);
        }

        transfer.filesDone++;
        transfer.bytesDone = baseBytes + (entry.size || 0);
        this.broadcast(transfer);
      }

      if (transfer.filesFailed >= transfer.filesTotal && transfer.filesTotal > 0) {
        throw new Error(`All ${transfer.filesTotal} file(s) failed. ${transfer.error || ''}`.trim());
      }
    } finally {
      if (srcProvider && dstProvider) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
}

module.exports = new TransferEngine();
