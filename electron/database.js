const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');

let db = null;
let dbPath = '';

// Auto-save debounce & non-blocking atomic persistence
let saveTimer = null;
let isSaving = false;
let pendingSave = false;
let SQLInstance = null;

function cleanStaleJournalFiles(targetPath) {
  if (!targetPath) return;
  const exts = ['-wal', '-shm', '-journal'];
  for (const ext of exts) {
    const f = `${targetPath}${ext}`;
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    } catch (_) {}
  }
}

function writeDbAtomically(targetPath, buffer) {
  if (!targetPath || !buffer) return;
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const bakPath = `${targetPath}.bak`;

  // 1. Write to temp file and flush physically to disk
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // 2. If healthy target exists, keep rolling backup
  if (fs.existsSync(targetPath)) {
    try {
      const currentStat = fs.statSync(targetPath);
      if (currentStat.size > 0) {
        fs.copyFileSync(targetPath, bakPath);
      }
    } catch (_) {}
  }

  // 3. Atomically replace target with Windows lock retry
  let renamed = false;
  let attempts = 0;
  while (!renamed && attempts < 5) {
    try {
      fs.renameSync(tmpPath, targetPath);
      renamed = true;
    } catch (err) {
      attempts++;
      if (attempts >= 5) {
        try {
          fs.copyFileSync(tmpPath, targetPath);
          fs.unlinkSync(tmpPath);
          renamed = true;
        } catch (copyErr) {
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          throw copyErr;
        }
      } else {
        const sleepUntil = Date.now() + 50;
        while (Date.now() < sleepUntil) {}
      }
    }
  }

  // 4. Ensure no WAL/SHM artifacts exist
  cleanStaleJournalFiles(targetPath);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (isSaving) {
      pendingSave = true;
      return;
    }
    isSaving = true;
    try {
      if (db) {
        const data = db.export();
        writeDbAtomically(dbPath, Buffer.from(data));
      }
    } catch (e) {
      console.error('DB async save error:', e);
    } finally {
      isSaving = false;
      if (pendingSave) {
        pendingSave = false;
        scheduleSave();
      }
    }
  }, 800);
}

function forceSave() {
  if (saveTimer) clearTimeout(saveTimer);
  try {
    if (db) {
      const data = db.export();
      writeDbAtomically(dbPath, Buffer.from(data));
    }
  } catch (e) {
    console.error('DB force save error:', e);
  }
}

function isCorruptionError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('malformed') || msg.includes('corrupt') || msg.includes('disk image') || msg.includes('not a database');
}

function verifyDbIntegrity(dbInstance) {
  if (!dbInstance) return false;
  try {
    const res = dbInstance.exec('PRAGMA quick_check;');
    if (!res || !res[0] || !res[0].values || !res[0].values[0]) return false;
    const val = String(res[0].values[0][0]).toLowerCase();
    if (val !== 'ok') return false;
    dbInstance.exec('SELECT count(*) FROM sqlite_master;');
    return true;
  } catch (_) {
    return false;
  }
}

function healDatabaseFromDisk(targetPath, SQL) {
  const engine = SQL || SQLInstance;
  if (!engine) return null;
  console.warn('[Database] Initiating database self-healing for:', targetPath);

  // 1. Quarantine corrupted file if exists
  if (fs.existsSync(targetPath)) {
    try {
      const corruptBackup = `${targetPath}.corrupt.${Date.now()}`;
      fs.copyFileSync(targetPath, corruptBackup);
      console.warn('[Database] Corrupted database quarantined to:', corruptBackup);
    } catch (e) {
      console.error('[Database] Failed to quarantine corrupt file:', e);
    }
  }

  // 2. Remove stale journal / WAL files if any
  cleanStaleJournalFiles(targetPath);

  // 3. Try to recover from .bak file if available and healthy
  const bakPath = `${targetPath}.bak`;
  if (fs.existsSync(bakPath)) {
    try {
      const bakBuffer = fs.readFileSync(bakPath);
      const bakCandidate = new engine.Database(bakBuffer);
      if (verifyDbIntegrity(bakCandidate)) {
        console.log('[Database] Restored successfully from valid .bak file');
        return bakCandidate;
      }
    } catch (e) {
      console.warn('[Database] .bak file could not be restored:', e.message);
    }
  }

  // 4. Create fresh clean database instance
  console.log('[Database] Creating clean fresh database instance');
  const freshDb = new engine.Database();
  return freshDb;
}

function recoverRuntimeDb() {
  if (!SQLInstance) return;
  console.warn('[Database] Performing runtime database recovery...');
  const healed = healDatabaseFromDisk(dbPath, SQLInstance);
  if (healed) {
    db = healed;
    applyDatabaseSchema(db);
    forceSave();
    console.log('[Database] Runtime database recovery complete and healthy.');
  }
}

function applyDatabaseSchema(targetDb) {
  if (!targetDb) return;

  // Enforce memory journal mode for sql.js WASM
  try { targetDb.run('PRAGMA journal_mode = MEMORY;'); } catch (_) {}

  // Schema creation
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      drive_folder_id TEXT,
      is_paused INTEGER DEFAULT 0,
      total_files INTEGER DEFAULT 0,
      synced_files INTEGER DEFAULT 0,
      last_scanned_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  targetDb.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_path TEXT UNIQUE NOT NULL,
      relative_path TEXT NOT NULL,
      folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      drive_file_id TEXT,
      drive_folder_id TEXT,
      last_modified INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  targetDb.run(`
    CREATE TABLE IF NOT EXISTS folder_mappings (
      folder_id INTEGER NOT NULL,
      relative_dir TEXT NOT NULL,
      drive_folder_id TEXT NOT NULL,
      PRIMARY KEY (folder_id, relative_dir),
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    )
  `);

  targetDb.run(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now', 'localtime')),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      file_path TEXT
    )
  `);

  targetDb.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  targetDb.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER NOT NULL,
      folder_name TEXT,
      label TEXT,
      cloud_path TEXT,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Migrations (safe to run repeatedly)
  try { targetDb.run("ALTER TABLE folders ADD COLUMN provider TEXT DEFAULT 'google'"); } catch (_) {}
  try { targetDb.run('ALTER TABLE folders ADD COLUMN mirror_providers TEXT DEFAULT NULL'); } catch (_) {}
  try { targetDb.run('ALTER TABLE folders ADD COLUMN clean_mirror INTEGER DEFAULT 0'); } catch (_) {}
  try { targetDb.run('ALTER TABLE folders ADD COLUMN reverse_sync INTEGER DEFAULT 1'); } catch (_) {}
  try { targetDb.run('UPDATE folders SET reverse_sync = 1 WHERE reverse_sync = 0 OR reverse_sync IS NULL'); } catch (_) {}

  // Metrics (lifetime + daily counters for the statistics page)
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS metrics (
      key TEXT PRIMARY KEY,
      value INTEGER DEFAULT 0
    )
  `);

  // folder_mappings: add provider to the key (multi-cloud support)
  let mappingsHasProvider = false;
  try {
    const info = targetDb.exec('PRAGMA table_info(folder_mappings)');
    const rows = info && info[0] ? info[0].values : [];
    mappingsHasProvider = rows.some((r) => r[1] === 'provider');
  } catch (_) {}
  if (!mappingsHasProvider) {
    try {
      targetDb.run(`CREATE TABLE folder_mappings_v2 (
        folder_id INTEGER NOT NULL,
        relative_dir TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT '',
        drive_folder_id TEXT NOT NULL,
        PRIMARY KEY (folder_id, relative_dir, provider)
      )`);
      targetDb.run(`INSERT OR IGNORE INTO folder_mappings_v2 (folder_id, relative_dir, provider, drive_folder_id)
              SELECT folder_id, relative_dir, '', drive_folder_id FROM folder_mappings`);
      targetDb.run('DROP TABLE folder_mappings');
      targetDb.run('ALTER TABLE folder_mappings_v2 RENAME TO folder_mappings');
    } catch (e) {
      console.warn('folder_mappings migration:', e.message);
    }
  }

  // Per-provider file copies (multi-cloud mirrors)
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS file_mirrors (
      local_path TEXT NOT NULL,
      provider TEXT NOT NULL,
      drive_file_id TEXT,
      drive_folder_id TEXT,
      status TEXT DEFAULT 'synced',
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (local_path, provider)
    )
  `);

  // Durable cloud-side deletion queue: offline deletes must survive restarts.
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS pending_cloud_deletions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_path TEXT NOT NULL,
      provider TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(local_path, provider, drive_file_id)
    )
  `);

  // Per-provider watched-folder roots
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS folder_mirror_roots (
      folder_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      drive_folder_id TEXT NOT NULL,
      PRIMARY KEY (folder_id, provider)
    )
  `);

  // Secure Vault items (for Lock, Hide, and Lock & Hide modes)
  targetDb.run(`
    CREATE TABLE IF NOT EXISTS vault_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT NOT NULL,
      current_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT DEFAULT 'file',
      mode TEXT NOT NULL,
      is_encrypted INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Create indexes
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_files_local_path ON files(local_path COLLATE NOCASE)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_files_folder_status ON files(folder_id, status)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_files_status ON files(status)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON activity_logs(id DESC)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_vault_items_mode ON vault_items(mode)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_vault_items_orig ON vault_items(original_path)'); } catch(_) {}
  try { targetDb.run('CREATE INDEX IF NOT EXISTS idx_pending_del_path ON pending_cloud_deletions(local_path COLLATE NOCASE)'); } catch(_) {}

  // Enable foreign keys
  targetDb.run('PRAGMA foreign_keys = ON');
}

function getDbPath() {
  try {
    // Real app: private userData folder. Plain Node (tests): temp folder —
    // never write runtime files into the project/install directory.
    const userDataPath = (app && typeof app.getPath === 'function')
      ? app.getPath('userData')
      : path.join(os.tmpdir(), 'aurasync-dev');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return path.join(userDataPath, 'cloudvault.db');
  } catch (e) {
    const fallback = path.join(os.tmpdir(), 'aurasync-dev');
    try { fs.mkdirSync(fallback, { recursive: true }); } catch (_) {}
    return path.join(fallback, 'cloudvault.db');
  }
}

async function initDatabase() {
  const initSqlJs = require('sql.js');
  
  // Locate the WASM file
  let wasmPath;
  const candidates = [
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.resourcesPath || '', 'app', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      wasmPath = candidate;
      break;
    }
  }

  const sqlConfig = {};
  if (wasmPath) {
    sqlConfig.locateFile = () => wasmPath;
  }

  SQLInstance = await initSqlJs(sqlConfig);
  dbPath = getDbPath();
  cleanStaleJournalFiles(dbPath);

  // Load existing database or create new with integrity verification
  let candidateDb = null;
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      // SQLite header check: byte 18 and 19 indicate WAL format if set to 2
      const isWalModeHeader = fileBuffer.length >= 20 && (fileBuffer[18] === 2 || fileBuffer[19] === 2);
      if (isWalModeHeader) {
        console.warn('[Database] Database file header indicates WAL mode incompatible with WASM VFS. Healing...');
        candidateDb = healDatabaseFromDisk(dbPath, SQLInstance);
      } else {
        const opened = new SQLInstance.Database(fileBuffer);
        if (verifyDbIntegrity(opened)) {
          candidateDb = opened;
        } else {
          console.warn('[Database] Existing DB file failed integrity verification. Healing...');
          candidateDb = healDatabaseFromDisk(dbPath, SQLInstance);
        }
      }
    } catch (e) {
      console.warn('Could not load existing DB, healing:', e.message);
      candidateDb = healDatabaseFromDisk(dbPath, SQLInstance);
    }
  }

  if (!candidateDb) {
    candidateDb = new SQLInstance.Database();
  }

  db = candidateDb;
  applyDatabaseSchema(db);
  forceSave();
  return db;
}

// Helper: run a query and return all rows as array of objects
function allRows(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  } catch (err) {
    if (isCorruptionError(err)) {
      console.warn('[Database] Corruption detected in allRows. Self-healing database...', err.message);
      recoverRuntimeDb();
      return allRows(sql, params);
    }
    throw err;
  }
}

// Helper: run a query and return first row as object or undefined
function getRow(sql, params = []) {
  if (!db) return undefined;
  try {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      let row = undefined;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      return row;
    } finally {
      stmt.free();
    }
  } catch (err) {
    if (isCorruptionError(err)) {
      console.warn('[Database] Corruption detected in getRow. Self-healing database...', err.message);
      recoverRuntimeDb();
      return getRow(sql, params);
    }
    throw err;
  }
}

// Escape SQLite LIKE wildcards (%, _) and the escape char itself
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => '\\' + c);
}

// Helper: run insert/update/delete
function runSql(sql, params = []) {
  if (!db) return { lastInsertRowid: 0, changes: 0 };
  try {
    db.run(sql, params);
    scheduleSave();
    const rows = allRows('SELECT last_insert_rowid() as id');
    return {
      lastInsertRowid: rows.length > 0 ? rows[0].id : 0,
      changes: db.getRowsModified()
    };
  } catch (err) {
    if (isCorruptionError(err)) {
      console.warn('[Database] Corruption detected in runSql. Self-healing database...', err.message);
      recoverRuntimeDb();
      db.run(sql, params);
      scheduleSave();
      const rows = allRows('SELECT last_insert_rowid() as id');
      return {
        lastInsertRowid: rows.length > 0 ? rows[0].id : 0,
        changes: db.getRowsModified()
      };
    }
    throw err;
  }
}

// Folders Management
function getFolders() {
  return allRows(`
    SELECT f.*, 
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id) as total_files,
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND status = 'synced') as synced_files,
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND status IN ('pending', 'syncing')) as pending_files,
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND status = 'preserved_on_drive') as preserved_files,
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND status = 'deleted_on_drive') as deleted_files,
      (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND status = 'failed') as failed_files
    FROM folders f 
    ORDER BY f.id DESC
  `);
}

function getFolderById(id) {
  return getRow('SELECT * FROM folders WHERE id = ?', [id]);
}

function getFolderByPath(folderPath) {
  return getRow('SELECT * FROM folders WHERE path = ?', [folderPath]);
}

function addFolder(folderPath, name, provider = 'google') {
  const existing = getFolderByPath(folderPath);
  if (existing) return existing;

  const result = runSql(
    `INSERT INTO folders (path, name, provider, reverse_sync, created_at) VALUES (?, ?, ?, 1, datetime('now', 'localtime'))`,
    [folderPath, name || path.basename(folderPath), provider]
  );
  return getFolderById(result.lastInsertRowid);
}

function updateFolderDriveId(id, driveFolderId) {
  runSql('UPDATE folders SET drive_folder_id = ? WHERE id = ?', [driveFolderId, id]);
}

function toggleFolderPause(id, isPaused) {
  runSql('UPDATE folders SET is_paused = ? WHERE id = ?', [isPaused ? 1 : 0, id]);
  return getFolderById(id);
}

function removeFolder(id) {
  // Manually delete related records (sql.js foreign key cascade may not work reliably)
  runSql('DELETE FROM file_mirrors WHERE local_path IN (SELECT local_path FROM files WHERE folder_id = ?)', [id]);
  runSql('DELETE FROM folder_mirror_roots WHERE folder_id = ?', [id]);
  runSql('DELETE FROM files WHERE folder_id = ?', [id]);
  runSql('DELETE FROM folder_mappings WHERE folder_id = ?', [id]);
  runSql('DELETE FROM folders WHERE id = ?', [id]);
}

function updateFolderStats(id) {
  runSql(`
    UPDATE folders
    SET 
      total_files = (SELECT COUNT(*) FROM files WHERE folder_id = ?),
      synced_files = (SELECT COUNT(*) FROM files WHERE folder_id = ? AND status = 'synced'),
      last_scanned_at = datetime('now', 'localtime')
    WHERE id = ?
  `, [id, id, id]);
}

// Files Management
function getFileByPath(localPath) {
  if (!localPath) return null;
  const norm = path.normalize(localPath);
  return getRow('SELECT * FROM files WHERE local_path = ? COLLATE NOCASE', [norm]);
}

function getFilesMapByFolder(folderId) {
  if (!db || !folderId) return new Map();
  const rows = allRows('SELECT id, local_path, relative_path, folder_id, drive_file_id, drive_folder_id, last_modified, file_size, file_hash, status FROM files WHERE folder_id = ?', [folderId]);
  const map = new Map();
  for (const r of rows) {
    if (r.local_path) {
      map.set(path.normalize(r.local_path).toLowerCase(), r);
    }
  }
  return map;
}

function upsertFile({ localPath, relativePath, folderId, lastModified, fileSize, fileHash, status = 'pending' }) {
  const norm = path.normalize(localPath);
  const existing = getFileByPath(norm);
  if (existing) {
    runSql(`
      UPDATE files 
      SET 
        relative_path = ?,
        folder_id = ?,
        last_modified = ?,
        file_size = ?,
        file_hash = COALESCE(?, file_hash),
        drive_file_id = CASE WHEN status = 'deleted_on_drive' THEN NULL ELSE drive_file_id END,
        drive_folder_id = CASE WHEN status = 'deleted_on_drive' THEN NULL ELSE drive_folder_id END,
        status = ?,
        updated_at = datetime('now', 'localtime')
      WHERE local_path = ? COLLATE NOCASE
    `, [relativePath, folderId, lastModified, fileSize, fileHash, status, norm]);
    return getFileByPath(norm);
  } else {
    runSql(`
      INSERT INTO files (local_path, relative_path, folder_id, last_modified, file_size, file_hash, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [norm, relativePath, folderId, lastModified, fileSize, fileHash, status]);
    return getFileByPath(norm);
  }
}

function upsertFilesBatch(items) {
  if (!items || items.length === 0) return;
  try {
    runSql('BEGIN TRANSACTION;');
    for (const item of items) {
      const norm = path.normalize(item.localPath);
      if (item.isExisting) {
        runSql(`
          UPDATE files 
          SET 
            relative_path = ?,
            folder_id = ?,
            last_modified = ?,
            file_size = ?,
            file_hash = COALESCE(?, file_hash),
            drive_file_id = CASE WHEN status = 'deleted_on_drive' THEN NULL ELSE drive_file_id END,
            drive_folder_id = CASE WHEN status = 'deleted_on_drive' THEN NULL ELSE drive_folder_id END,
            status = ?,
            updated_at = datetime('now', 'localtime')
          WHERE local_path = ? COLLATE NOCASE
        `, [item.relativePath, item.folderId, item.lastModified, item.fileSize, item.fileHash || null, item.status || 'pending', norm]);
      } else {
        runSql(`
          INSERT INTO files (local_path, relative_path, folder_id, last_modified, file_size, file_hash, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `, [norm, item.relativePath, item.folderId, item.lastModified, item.fileSize, item.fileHash || null, item.status || 'pending']);
      }
    }
    runSql('COMMIT;');
  } catch (err) {
    try { runSql('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

function updateFileSynced({ localPath, driveFileId, driveFolderId, fileHash, fileSize = null }) {
  const norm = path.normalize(localPath);
  runSql(`
    UPDATE files 
    SET 
      drive_file_id = ?,
      drive_folder_id = COALESCE(?, drive_folder_id),
      file_hash = COALESCE(?, file_hash),
      file_size = COALESCE(?, file_size),
      status = 'synced',
      error_message = NULL,
      updated_at = datetime('now', 'localtime')
    WHERE local_path = ? COLLATE NOCASE
  `, [driveFileId, driveFolderId, fileHash, fileSize, norm]);
}

function updateFileStatus(localPath, status, errorMessage = null) {
  const norm = path.normalize(localPath);
  runSql(`
    UPDATE files 
    SET status = ?, error_message = ?, updated_at = datetime('now', 'localtime')
    WHERE local_path = ? COLLATE NOCASE
  `, [status, errorMessage, norm]);
}

// Reset rows stuck in 'syncing' (e.g. app crashed mid-upload) back to 'pending'
function resetStuckSyncing() {
  runSql(`
    UPDATE files
    SET status = 'pending', error_message = NULL, updated_at = datetime('now', 'localtime')
    WHERE status = 'syncing'
  `);
}

function getFailedFiles(folderId = null) {
  if (folderId) {
    return allRows("SELECT * FROM files WHERE status = 'failed' AND folder_id = ?", [folderId]);
  }
  return allRows("SELECT * FROM files WHERE status = 'failed'");
}

function resetFailedFiles(folderId = null) {
  if (folderId) {
    runSql(`
      UPDATE files
      SET status = 'pending', error_message = NULL, updated_at = datetime('now', 'localtime')
      WHERE status = 'failed' AND folder_id = ?
    `, [folderId]);
  } else {
    runSql(`
      UPDATE files
      SET status = 'pending', error_message = NULL, updated_at = datetime('now', 'localtime')
      WHERE status = 'failed'
    `);
  }
}

// Strict Zero-Deletion Rule:
// Local deletion does NOT delete Drive file! We mark it in SQLite as 'preserved_on_drive'.
function markFileLocalDeleted(localPath) {
  const norm = path.normalize(localPath);
  runSql(`
    UPDATE files 
    SET status = CASE 
      WHEN drive_file_id IS NOT NULL AND drive_file_id != '' THEN 'preserved_on_drive'
      ELSE 'removed_before_upload'
    END,
    updated_at = datetime('now', 'localtime')
    WHERE local_path = ? COLLATE NOCASE
  `, [norm]);
}

// Full-mirror mode: the Drive copy was moved to trash because the local file was deleted
function markFileDeletedOnDrive(localPath) {
  const norm = path.normalize(localPath);
  runSql(`
    UPDATE files 
    SET status = 'deleted_on_drive', updated_at = datetime('now', 'localtime')
    WHERE local_path = ? COLLATE NOCASE
  `, [norm]);
}

function deleteFileRecord(localPath) {
  const norm = path.normalize(localPath);
  const file = getFileByPath(norm);
  if (file) {
    runSql('DELETE FROM file_mirrors WHERE local_path = ? COLLATE NOCASE', [norm]);
    runSql('DELETE FROM files WHERE id = ?', [file.id]);
    updateFolderStats(file.folder_id);
  }
}

// All tracked files inside a deleted directory (used by full-mirror mode)
function getFilesUnderPath(folderId, dirPath) {
  const prefix = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
  return allRows(
    "SELECT * FROM files WHERE folder_id = ? AND local_path LIKE ? ESCAPE '\\'",
    [folderId, `${escapeLike(prefix)}%`]
  );
}

// ---------- Aggregated tree view (folders shown as one row with size + file count) ----------

function aggregateEntries(rows, stripPrefix = '') {
  const map = new Map();
  const prefix = stripPrefix ? stripPrefix.replace(/\\/g, '/') : '';

  for (const r of rows) {
    const rel = (r.relative_path || '').replace(/\\/g, '/');
    if (!rel) continue;

    let rest = rel;
    if (prefix) {
      if (!rel.startsWith(prefix + '/')) continue;
      rest = rel.slice(prefix.length + 1);
    }
    if (!rest) continue;

    const idx = rest.indexOf('/');
    const segment = idx === -1 ? rest : rest.slice(0, idx);
    const isDirectFile = idx === -1;
    const key = `${r.folder_id}|${segment}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        folderId: r.folder_id,
        name: segment,
        relativePath: prefix ? `${prefix}/${segment}` : segment,
        isDir: !isDirectFile,
        fileCount: 0,
        totalSize: 0,
        syncedCount: 0,
        pendingCount: 0,
        failedCount: 0,
        preservedCount: 0,
        deletedCount: 0,
        lastUpdated: null,
        localPath: null,
        driveFileId: null,
        status: null
      };
      map.set(key, entry);
    }

    if (!isDirectFile) entry.isDir = true;
    entry.fileCount += 1;
    entry.totalSize += r.file_size || 0;

    if (r.status === 'synced') entry.syncedCount++;
    else if (r.status === 'pending' || r.status === 'syncing') entry.pendingCount++;
    else if (r.status === 'failed') entry.failedCount++;
    else if (r.status === 'preserved_on_drive') entry.preservedCount++;
    else if (r.status === 'deleted_on_drive') entry.deletedCount++;

    if (isDirectFile) {
      entry.localPath = r.local_path;
      entry.driveFileId = r.drive_file_id || null;
      entry.status = r.status;
      entry.updatedAt = r.updated_at;
    } else if (!entry.localPath && r.local_path && r.relative_path) {
      const folderRoot = r.local_path.slice(0, r.local_path.length - r.relative_path.length);
      entry.localPath = path.join(folderRoot, entry.relativePath.replace(/\//g, path.sep));
    }

    if (r.updated_at && (!entry.lastUpdated || r.updated_at > entry.lastUpdated)) {
      entry.lastUpdated = r.updated_at;
    }
  }

  for (const entry of map.values()) {
    if (entry.isDir) {
      if (entry.failedCount > 0) entry.status = 'failed';
      else if (entry.pendingCount > 0) entry.status = 'pending';
      else if (entry.deletedCount > 0) entry.status = 'deleted_on_drive';
      else if (entry.preservedCount > 0) entry.status = 'preserved_on_drive';
      else if (entry.syncedCount === entry.fileCount) entry.status = 'synced';
      else entry.status = 'pending';
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const TREE_COLUMNS = 'folder_id, relative_path, file_size, status, local_path, drive_file_id, updated_at';

const topLevelTreeCache = new Map();

function invalidateTreeCache() {
  topLevelTreeCache.clear();
}

function getTopLevelEntries(folderId = null) {
  const key = folderId || 'all';
  const cached = topLevelTreeCache.get(key);
  if (cached && (Date.now() - cached.timestamp < 2000)) {
    return cached.data;
  }
  const rows = folderId
    ? allRows(`SELECT ${TREE_COLUMNS} FROM files WHERE folder_id = ?`, [folderId])
    : allRows(`SELECT ${TREE_COLUMNS} FROM files`);
  const aggregated = aggregateEntries(rows, '');
  topLevelTreeCache.set(key, { data: aggregated, timestamp: Date.now() });
  return aggregated;
}

function getChildEntries(folderId, relativePrefix) {
  const normalized = (relativePrefix || '').replace(/\//g, path.sep);
  if (!normalized) {
    return getTopLevelEntries(folderId);
  }
  const rows = allRows(
    `SELECT ${TREE_COLUMNS} FROM files WHERE folder_id = ? AND relative_path LIKE ? ESCAPE '\\'`,
    [folderId, `${escapeLike(normalized)}${path.sep}%`]
  );
  return aggregateEntries(rows, relativePrefix || '');
}

function getFiles({ folderId = null, status = null, limit = 100, offset = 0, search = '' }) {
  let query = 'SELECT * FROM files WHERE 1=1';
  const params = [];

  if (folderId) {
    query += ' AND folder_id = ?';
    params.push(folderId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    query += " AND (local_path LIKE ? ESCAPE '\\' OR relative_path LIKE ? ESCAPE '\\')";
    const like = `%${escapeLike(search)}%`;
    params.push(like, like);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return allRows(query, params);
}

// Folder Directory Mapping Cache (avoids redundant Drive queries)
function getDriveFolderMapping(folderId, relativeDir, provider = '') {
  const res = getRow(
    'SELECT drive_folder_id FROM folder_mappings WHERE folder_id = ? AND relative_dir = ? AND provider = ?',
    [folderId, relativeDir, provider || '']
  );
  return res ? res.drive_folder_id : null;
}

function setDriveFolderMapping(folderId, relativeDir, driveFolderId, provider = '') {
  const key = provider || '';
  const existing = getRow(
    'SELECT folder_id FROM folder_mappings WHERE folder_id = ? AND relative_dir = ? AND provider = ?',
    [folderId, relativeDir, key]
  );
  if (existing) {
    runSql(
      'UPDATE folder_mappings SET drive_folder_id = ? WHERE folder_id = ? AND relative_dir = ? AND provider = ?',
      [driveFolderId, folderId, relativeDir, key]
    );
  } else {
    runSql(
      'INSERT INTO folder_mappings (folder_id, relative_dir, provider, drive_folder_id) VALUES (?, ?, ?, ?)',
      [folderId, relativeDir, key, driveFolderId]
    );
  }
}

// ---------- Multi-cloud mirrors (3-2-1) ----------

function setFolderMirrors(id, providers) {
  const clean = Array.isArray(providers)
    ? providers.filter((p) => typeof p === 'string' && p)
    : [];
  runSql('UPDATE folders SET mirror_providers = ? WHERE id = ?', [JSON.stringify(clean), id]);
  return getFolderById(id);
}

function getFolderMirrorRoot(folderId, provider) {
  const row = getRow(
    'SELECT drive_folder_id FROM folder_mirror_roots WHERE folder_id = ? AND provider = ?',
    [folderId, provider]
  );
  return row ? row.drive_folder_id : null;
}

function setFolderMirrorRoot(folderId, provider, driveFolderId) {
  runSql(
    'INSERT OR REPLACE INTO folder_mirror_roots (folder_id, provider, drive_folder_id) VALUES (?, ?, ?)',
    [folderId, provider, driveFolderId]
  );
}

function getFolderMirrors(folderId) {
  return allRows('SELECT provider, drive_folder_id FROM folder_mirror_roots WHERE folder_id = ?', [folderId]);
}

function setFileMirror({ localPath, provider, driveFileId, driveFolderId, status = 'synced' }) {
  runSql(
    `INSERT OR REPLACE INTO file_mirrors (local_path, provider, drive_file_id, drive_folder_id, status, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
    [localPath, provider, driveFileId || null, driveFolderId || null, status]
  );
}

function getFileMirror(localPath, provider) {
  return getRow('SELECT * FROM file_mirrors WHERE local_path = ? AND provider = ?', [localPath, provider]);
}

function getFileMirrors(localPath) {
  return allRows('SELECT * FROM file_mirrors WHERE local_path = ?', [localPath]);
}

function removeFileMirror(localPath, provider) {
  runSql('DELETE FROM file_mirrors WHERE local_path = ? AND provider = ?', [localPath, provider]);
}

function removeFileMirrors(localPath) {
  runSql('DELETE FROM file_mirrors WHERE local_path = ?', [localPath]);
}

function addPendingCloudDeletion({ localPath, provider, driveFileId, isPrimary = false }) {
  if (!localPath || !provider || !driveFileId) return null;
  runSql(
    `INSERT OR IGNORE INTO pending_cloud_deletions (local_path, provider, drive_file_id, is_primary)
     VALUES (?, ?, ?, ?)`,
    [path.normalize(localPath), provider, String(driveFileId), isPrimary ? 1 : 0]
  );
  const row = getRow(
    'SELECT * FROM pending_cloud_deletions WHERE local_path = ? COLLATE NOCASE AND provider = ? AND drive_file_id = ?',
    [path.normalize(localPath), provider, String(driveFileId)]
  );
  return row || null;
}

function getPendingCloudDeletions(provider = null) {
  return provider
    ? allRows('SELECT * FROM pending_cloud_deletions WHERE provider = ? ORDER BY id', [provider])
    : allRows('SELECT * FROM pending_cloud_deletions ORDER BY id');
}

function removePendingCloudDeletion(id) {
  runSql('DELETE FROM pending_cloud_deletions WHERE id = ?', [id]);
}

function getPendingCloudDeletionCount(localPath) {
  const row = getRow(
    'SELECT COUNT(*) AS total FROM pending_cloud_deletions WHERE local_path = ? COLLATE NOCASE',
    [path.normalize(localPath)]
  );
  return row ? row.total : 0;
}

function getTotalPendingCloudDeletionsCount() {
  if (!db) return 0;
  const row = getRow('SELECT COUNT(*) AS total FROM pending_cloud_deletions');
  return row ? row.total : 0;
}

function clearPendingCloudDeletions(localPath) {
  if (!localPath || !db) return;
  // Fast path: avoid disk write and table scan if pending queue is completely empty
  const total = getTotalPendingCloudDeletionsCount();
  if (total === 0) return;
  runSql('DELETE FROM pending_cloud_deletions WHERE local_path = ? COLLATE NOCASE', [path.normalize(localPath)]);
}

function clearPendingCloudDeletionsForProvider(provider = null) {
  if (!provider || provider === 'all') runSql('DELETE FROM pending_cloud_deletions');
  else runSql('DELETE FROM pending_cloud_deletions WHERE provider = ?', [provider]);
}

// ---------- Metrics (statistics) ----------

function incrementMetric(key, delta = 1) {
  const existing = getRow('SELECT value FROM metrics WHERE key = ?', [key]);
  if (existing) {
    runSql('UPDATE metrics SET value = value + ? WHERE key = ?', [delta, key]);
  } else {
    runSql('INSERT INTO metrics (key, value) VALUES (?, ?)', [key, delta]);
  }
}

function getMetric(key, defaultValue = 0) {
  const row = getRow('SELECT value FROM metrics WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function recordUpload(bytes) {
  const safeBytes = Math.max(0, parseInt(bytes, 10) || 0);
  incrementMetric('uploaded_bytes_total', safeBytes);
  incrementMetric('uploads_count', 1);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = `uploaded_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  incrementMetric(dayKey, safeBytes);
}

function getDailyUploads(days = 7) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const pad = (n) => String(n).padStart(2, '0');
    const key = `uploaded_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    result.push({
      date: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
      bytes: getMetric(key, 0)
    });
  }
  return result;
}

function getMetricsSummary() {
  return {
    uploadedBytesTotal: getMetric('uploaded_bytes_total', 0),
    uploadsCount: getMetric('uploads_count', 0),
    daily: getDailyUploads(7)
  };
}

// Latest-only (projects) mode: deleted files also leave the cloud
function setFolderCleanMode(id, enabled) {
  runSql('UPDATE folders SET clean_mirror = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  return getFolderById(id);
}

// Reverse sync: automatically download cloud changes to this folder
function setFolderReverseSync(id, enabled) {
  runSql('UPDATE folders SET reverse_sync = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  return getFolderById(id);
}

// Activity Logging
function addLog(type, message, filePath = null) {
  runSql(
    `INSERT INTO activity_logs (timestamp, type, message, file_path) VALUES (datetime('now', 'localtime'), ?, ?, ?)`,
    [type, message, filePath]
  );

  // Keep last 1,000 logs to stay lightweight
  runSql(`
    DELETE FROM activity_logs 
    WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 1000)
  `);
}

function getRecentLogs(limit = 100, typeFilter = null) {
  if (typeFilter && typeFilter !== 'all') {
    return allRows('SELECT * FROM activity_logs WHERE type = ? ORDER BY id DESC LIMIT ?', [typeFilter, limit]);
  }
  return allRows('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?', [limit]);
}

function clearLogs() {
  runSql('DELETE FROM activity_logs');
}

// Overall Stats for Dashboard (Optimized: single-pass aggregation)
function getAppStats() {
  if (!db) {
    return {
      totalFolders: 0,
      totalFiles: 0,
      syncedFiles: 0,
      pendingFiles: 0,
      preservedFiles: 0,
      cloudMissingFiles: 0,
      failedFiles: 0,
      deletedFiles: 0,
      totalBytes: 0,
      syncMode: 'safe',
      zeroDeletePolicyActive: true
    };
  }

  const fRow = getRow('SELECT COUNT(*) as count FROM folders');
  const totalFolders = fRow ? fRow.count : 0;

  const aggRow = getRow(`
    SELECT 
      COUNT(*) as totalFiles,
      COALESCE(SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END), 0) as syncedFiles,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END), 0) as pendingFiles,
      COALESCE(SUM(CASE WHEN status = 'preserved_on_drive' THEN 1 ELSE 0 END), 0) as preservedFiles,
      COALESCE(SUM(CASE WHEN status = 'cloud_missing' THEN 1 ELSE 0 END), 0) as cloudMissingFiles,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failedFiles,
      COALESCE(SUM(CASE WHEN status = 'deleted_on_drive' THEN 1 ELSE 0 END), 0) as deletedFiles,
      COALESCE(SUM(CASE WHEN status = 'synced' THEN file_size ELSE 0 END), 0) as totalBytes
    FROM files
  `);

  const totalFiles = aggRow ? (aggRow.totalFiles || 0) : 0;
  const syncedFiles = aggRow ? (aggRow.syncedFiles || 0) : 0;
  const pendingFiles = aggRow ? (aggRow.pendingFiles || 0) : 0;
  const preservedFiles = aggRow ? (aggRow.preservedFiles || 0) : 0;
  const cloudMissingFiles = aggRow ? (aggRow.cloudMissingFiles || 0) : 0;
  const failedFiles = aggRow ? (aggRow.failedFiles || 0) : 0;
  const deletedFiles = aggRow ? (aggRow.deletedFiles || 0) : 0;
  const totalBytes = aggRow ? (aggRow.totalBytes || 0) : 0;

  const syncMode = getSetting('syncMode', 'safe') || 'safe';

  return {
    totalFolders,
    totalFiles,
    syncedFiles,
    pendingFiles,
    preservedFiles,
    cloudMissingFiles,
    failedFiles,
    deletedFiles,
    totalBytes,
    syncMode,
    zeroDeletePolicyActive: syncMode !== 'mirror'
  };
}

// Settings Management
function getSetting(key, defaultValue = null) {
  if (!db) return defaultValue;
  const row = getRow('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  if (!db) return;
  const existing = getRow('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    runSql('UPDATE settings SET value = ? WHERE key = ?', [String(value), key]);
  } else {
    runSql('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  }
}

function getAllSettings() {
  const defaults = {
    theme: 'dark',
    minimizeToTray: 'true',
    startOnBoot: 'false',
    notifications: 'true',
    language: 'ar',
    excludePatterns: '',
    maxFileSizeMB: '0',
    maxConcurrentUploads: '4',
    uploadSpeedLimitMB: '0',
    reverseSyncIntervalMin: '2',
    syncMode: 'safe'
  };
  if (!db) return defaults;
  const rows = allRows('SELECT key, value FROM settings');
  const res = { ...defaults };
  for (const r of rows) {
    res[r.key] = r.value;
  }
  return res;
}

// Save on app quit
function closeDatabase() {
  forceSave();
}

// ---------- Restore points (snapshots) ----------

function addSnapshot({ folderId, folderName, label, cloudPath, fileCount, totalSize }) {
  const result = runSql(
    `INSERT INTO snapshots (folder_id, folder_name, label, cloud_path, file_count, total_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
    [folderId, folderName || null, label || null, cloudPath || null, fileCount || 0, totalSize || 0]
  );
  return getSnapshotById(result.lastInsertRowid);
}

function getSnapshotById(id) {
  return getRow('SELECT * FROM snapshots WHERE id = ?', [id]);
}

function getSnapshots(folderId = null) {
  if (folderId) {
    return allRows('SELECT * FROM snapshots WHERE folder_id = ? ORDER BY id DESC', [folderId]);
  }
  return allRows('SELECT * FROM snapshots ORDER BY id DESC');
}

function removeSnapshot(id) {
  runSql('DELETE FROM snapshots WHERE id = ?', [id]);
}

// Full local reset (fresh first-run state): removes folders, files, logs and settings
function resetAllData() {
  runSql('DELETE FROM files');
  runSql('DELETE FROM folder_mappings');
  runSql('DELETE FROM folders');
  runSql('DELETE FROM activity_logs');
  runSql('DELETE FROM settings');
  runSql('DELETE FROM snapshots');
  runSql('DELETE FROM file_mirrors');
  runSql('DELETE FROM folder_mirror_roots');
  runSql('DELETE FROM pending_cloud_deletions');
  runSql('DELETE FROM metrics');
  forceSave();
}

// Reset sync tracking for folders linked to a provider (or all) after cloud is formatted
function resetCloudSyncState(providerId = null) {
  if (!db) return;
  const folders = (providerId && providerId !== 'all')
    ? allRows("SELECT id FROM folders WHERE COALESCE(provider, 'google') = ?", [providerId])
    : allRows("SELECT id FROM folders");

  for (const f of folders) {
    runSql('DELETE FROM folder_mappings WHERE folder_id = ?', [f.id]);
    runSql('DELETE FROM folder_mirror_roots WHERE folder_id = ?', [f.id]);
    runSql('UPDATE folders SET drive_folder_id = NULL, is_paused = 1, synced_files = 0 WHERE id = ?', [f.id]);
    runSql("UPDATE files SET drive_file_id = NULL, drive_folder_id = NULL, file_hash = NULL, status = 'pending', error_message = NULL WHERE folder_id = ?", [f.id]);
  }

  if (providerId === 'all' || !providerId) {
    runSql('DELETE FROM file_mirrors');
    runSql('DELETE FROM folder_mirror_roots');
    runSql('DELETE FROM folder_mappings');
    clearPendingCloudDeletionsForProvider('all');
  } else {
    runSql('DELETE FROM file_mirrors WHERE provider = ?', [providerId]);
    runSql('DELETE FROM folder_mirror_roots WHERE provider = ?', [providerId]);
    clearPendingCloudDeletionsForProvider(providerId);
  }

  forceSave();
}

// ==========================================
// VAULT FUNCTIONS (قفل وإخفاء الملفات)
// ==========================================

function getVaultItems() {
  return allRows('SELECT * FROM vault_items ORDER BY id DESC');
}

function getVaultItemById(id) {
  return getRow('SELECT * FROM vault_items WHERE id = ?', [id]);
}

function getVaultItemByOriginalPath(originalPath) {
  return getRow('SELECT * FROM vault_items WHERE original_path = ?', [originalPath]);
}

function getVaultItemByCurrentPath(currentPath) {
  if (!currentPath) return null;
  return getRow('SELECT * FROM vault_items WHERE current_path = ?', [currentPath]);
}

function addVaultItem(item) {
  runSql(`
    INSERT INTO vault_items (original_path, current_path, file_name, file_size, file_type, mode, is_encrypted, is_hidden, is_locked, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    item.original_path,
    item.current_path,
    item.file_name,
    item.file_size || 0,
    item.file_type || 'file',
    item.mode,
    item.is_encrypted ? 1 : 0,
    item.is_hidden ? 1 : 0,
    item.is_locked !== undefined ? (item.is_locked ? 1 : 0) : 1,
    item.notes || ''
  ]);
  const row = getRow('SELECT last_insert_rowid() AS id');
  forceSave();
  return row ? getVaultItemById(row.id) : null;
}

function updateVaultItem(id, updates = {}) {
  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = ?`);
    params.push(v);
  }
  if (fields.length === 0) return getVaultItemById(id);
  fields.push("updated_at = datetime('now', 'localtime')");
  params.push(id);
  runSql(`UPDATE vault_items SET ${fields.join(', ')} WHERE id = ?`, params);
  forceSave();
  return getVaultItemById(id);
}

function deleteVaultItem(id) {
  runSql('DELETE FROM vault_items WHERE id = ?', [id]);
  forceSave();
}

function getVaultStats() {
  const total = getRow('SELECT COUNT(*) AS total_count, COALESCE(SUM(file_size), 0) AS total_size FROM vault_items') || { total_count: 0, total_size: 0 };
  const locked = getRow("SELECT COUNT(*) AS locked_count FROM vault_items WHERE mode = 'lock'") || { locked_count: 0 };
  const hidden = getRow("SELECT COUNT(*) AS hidden_count FROM vault_items WHERE mode = 'hide'") || { hidden_count: 0 };
  const lockedHidden = getRow("SELECT COUNT(*) AS locked_hidden_count FROM vault_items WHERE mode = 'lock_hide'") || { locked_hidden_count: 0 };
  return {
    totalItems: total.total_count || 0,
    totalBytes: total.total_size || 0,
    lockedCount: locked.locked_count || 0,
    hiddenCount: hidden.hidden_count || 0,
    lockedHiddenCount: lockedHidden.locked_hidden_count || 0
  };
}

module.exports = {
  initDatabase,
  getDbPath,
  getFolders,
  getFolderById,
  getFolderByPath,
  addFolder,
  updateFolderDriveId,
  toggleFolderPause,
  removeFolder,
  updateFolderStats,
  getFileByPath,
  getFilesMapByFolder,
  upsertFile,
  upsertFilesBatch,
  updateFileSynced,
  updateFileStatus,
  markFileLocalDeleted,
  markFileDeletedOnDrive,
  deleteFileRecord,
  getFilesUnderPath,
  getTopLevelEntries,
  getChildEntries,
  invalidateTreeCache,
  resetStuckSyncing,
  getFailedFiles,
  resetFailedFiles,
  getFiles,
  getDriveFolderMapping,
  setDriveFolderMapping,
  setFolderMirrors,
  getFolderMirrorRoot,
  getFolderMirrors,
  setFolderMirrorRoot,
  setFileMirror,
  getFileMirror,
  getFileMirrors,
  removeFileMirror,
  removeFileMirrors,
  addPendingCloudDeletion,
  getPendingCloudDeletions,
  removePendingCloudDeletion,
  getPendingCloudDeletionCount,
  getTotalPendingCloudDeletionsCount,
  clearPendingCloudDeletions,
  clearPendingCloudDeletionsForProvider,
  incrementMetric,
  getMetric,
  recordUpload,
  getDailyUploads,
  getMetricsSummary,
  setFolderCleanMode,
  setFolderReverseSync,
  addLog,
  getRecentLogs,
  clearLogs,
  getAppStats,
  getSetting,
  setSetting,
  getAllSettings,
  resetAllData,
  resetCloudSyncState,
  addSnapshot,
  getSnapshotById,
  getSnapshots,
  removeSnapshot,
  closeDatabase,
  // Vault exports
  getVaultItems,
  getVaultItemById,
  getVaultItemByOriginalPath,
  getVaultItemByCurrentPath,
  addVaultItem,
  updateVaultItem,
  deleteVaultItem,
  getVaultStats,
  // Database resilience exports
  verifyDbIntegrity,
  writeDbAtomically,
  healDatabaseFromDisk,
  recoverRuntimeDb
};


