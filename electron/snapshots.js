// Restore points (snapshots)
//
// A snapshot freezes the current cloud state of a watched folder inside
// "<folder>/_Snapshots/<label>/" using SERVER-SIDE copies (instant, no
// re-upload). Restoring brings the cloud folder back to that state, or
// downloads the snapshot to the device.
const path = require('path');
const db = require('./database');
const { getProvider } = require('./cloud-providers');
const { validateRelativePath, prepareSafeOutputPath } = require('./safe-path');

const SNAPSHOT_DIRNAME = '_Snapshots';

function makeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
}

function sanitizeLabel(label) {
  const cleaned = String(label || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return cleaned.slice(0, 60) || makeStamp();
}

async function resolveContext(folderId) {
  const folder = db.getFolderById(folderId);
  if (!folder) throw new Error('Folder not found');
  const provider = getProvider(folder.provider || 'google');
  if (!provider) throw new Error('Cloud provider not found');
  if (!provider.isConnected()) throw new Error('Cloud account is not connected');

  const rootId = await provider.ensureRootBackupFolder();
  let folderRootId = folder.drive_folder_id;
  if (!folderRootId) {
    folderRootId = await provider.ensureFolder(folder.name, rootId);
    db.updateFolderDriveId(folder.id, folderRootId);
  }
  const snapshotsRootId = await provider.ensureFolder(SNAPSHOT_DIRNAME, folderRootId);
  return { folder, provider, folderRootId, snapshotsRootId };
}

async function ensureDirPath(provider, rootId, relativeDir, cache) {
  if (!relativeDir) return rootId;
  const key = relativeDir.replace(/\\/g, '/');
  validateRelativePath(key);
  if (cache.has(key)) return cache.get(key);
  const segments = key.split('/').filter(Boolean);
  let parent = rootId;
  let accumulated = '';
  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    if (cache.has(accumulated)) {
      parent = cache.get(accumulated);
      continue;
    }
    const id = await provider.ensureFolder(segment, parent);
    cache.set(accumulated, id);
    parent = id;
  }
  return parent;
}

// ---------- Create ----------

async function createSnapshot(folderId, label, onProgress = null) {
  const { folder, provider, folderRootId, snapshotsRootId } = await resolveContext(folderId);
  const cleanLabel = sanitizeLabel(label);
  const snapFolderId = await provider.ensureFolder(cleanLabel, snapshotsRootId);

  const files = db
    .getFiles({ folderId, status: 'synced', limit: 1000000, offset: 0 })
    .filter((f) => f.drive_file_id);

  const total = files.length;
  const dirCache = new Map();
  let done = 0;

  for (const file of files) {
    const relDir = path.dirname(file.relative_path || file.local_path);
    const parentId = await ensureDirPath(provider, snapFolderId, relDir === '.' ? '' : relDir, dirCache);
    await provider.copyFile({
      sourceId: file.drive_file_id,
      destParentId: parentId,
      name: path.basename(file.relative_path || file.local_path)
    });
    done++;
    if (onProgress) {
      onProgress({
        phase: 'create',
        current: done,
        total,
        name: file.relative_path || file.local_path
      });
    }
  }

  const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);
  const snapshot = db.addSnapshot({
    folderId,
    folderName: folder.name,
    label: cleanLabel,
    cloudPath: `${SNAPSHOT_DIRNAME}/${cleanLabel}`,
    fileCount: total,
    totalSize
  });

  db.addLog('success', `Restore point created: ${folder.name} — ${cleanLabel} (${total} files)`);
  return snapshot;
}

// ---------- Delete ----------

async function deleteSnapshot(snapshotId) {
  const snap = db.getSnapshotById(snapshotId);
  if (!snap) throw new Error('Snapshot not found');
  const { provider, snapshotsRootId } = await resolveContext(snap.folder_id);

  const items = await provider.listFolder(snapshotsRootId).catch(() => []);
  const target = items.find((i) => i.isDir && i.name === snap.label);
  if (target) {
    await provider.trashFile(target.id);
  }
  db.removeSnapshot(snapshotId);
  db.addLog('info', `Restore point deleted: ${snap.folder_name} — ${snap.label}`);
  return { success: true };
}

// ---------- Restore ----------

async function collectCloudFiles(provider, folderId, relativeDir, out) {
  if (out.visited.has(folderId)) throw new Error('The cloud snapshot contains a folder cycle');
  out.visited.add(folderId);
  const items = await provider.listFolder(folderId);
  for (const item of items) {
    const name = String(item.name || '');
    const rel = relativeDir ? `${relativeDir}/${name}` : name;
    validateRelativePath(rel);
    if (item.isDir) {
      await collectCloudFiles(provider, item.id, rel, out);
    } else {
      out.push({ id: item.id, name: item.name, relativePath: rel, size: item.size || 0 });
    }
  }
  out.visited.delete(folderId);
  return out;
}

async function restoreSnapshot(snapshotId, mode = 'cloud', destDir = null, onProgress = null) {
  const snap = db.getSnapshotById(snapshotId);
  if (!snap) throw new Error('Snapshot not found');
  const { folder, provider, folderRootId, snapshotsRootId } = await resolveContext(snap.folder_id);

  const rootItems = await provider.listFolder(snapshotsRootId);
  const snapFolder = rootItems.find((i) => i.isDir && i.name === snap.label);
  if (!snapFolder) throw new Error('The snapshot folder was not found in the cloud');

  const entries = await collectCloudFiles(provider, snapFolder.id, '', Object.assign([], { visited: new Set() }));
  const total = entries.length;
  let done = 0;

  if (mode === 'device') {
    if (!destDir) throw new Error('Destination folder is required');
    const fs = require('fs');
    for (const entry of entries) {
      const destPath = prepareSafeOutputPath(destDir, entry.relativePath);
      await provider.downloadFile({ fileId: entry.id, destPath });
      done++;
      if (onProgress) onProgress({ phase: 'restore', current: done, total, name: entry.relativePath });
    }
    db.addLog('success', `Restore point downloaded: ${snap.folder_name} — ${snap.label} (${done} files)`);
    return { restored: done, destDir };
  }

  // Cloud restore: copy snapshot files back over the folder structure
  const dirCache = new Map();
  for (const entry of entries) {
    const relDir = path.dirname(entry.relativePath);
    const parentId = await ensureDirPath(provider, folderRootId, relDir === '.' ? '' : relDir, dirCache);

    const localPath = path.join(folder.path, ...entry.relativePath.split('/'));
    const existing = db.getFileByPath(localPath);

    const copied = await provider.copyFile({
      sourceId: entry.id,
      destParentId: parentId,
      name: entry.name
    });

    // Move the previous (newer) cloud copy to the trash — this is an explicit restore
    if (existing && existing.drive_file_id && existing.drive_file_id !== copied.id) {
      try {
        await provider.trashFile(existing.drive_file_id);
      } catch (_) {}
    }
    if (existing) {
      db.updateFileSynced({
        localPath,
        driveFileId: copied.id,
        driveFolderId: parentId,
        fileHash: copied.md5Checksum || null,
        fileSize: existing.file_size || null
      });
    }

    done++;
    if (onProgress) onProgress({ phase: 'restore', current: done, total, name: entry.relativePath });
  }

  db.addLog('success', `Restore point applied to cloud: ${snap.folder_name} — ${snap.label} (${done} files)`);
  return { restored: done };
}

function listSnapshots(folderId = null) {
  return db.getSnapshots(folderId || null);
}

module.exports = {
  SNAPSHOT_DIRNAME,
  createSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  listSnapshots
};
