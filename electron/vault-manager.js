const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');
const { app } = require('electron');
const db = require('./database');
const { resolveWithin } = require('./safe-path');

const MAGIC_HEADER = Buffer.from('AURAVAULT', 'utf8'); // 9 bytes — single-file container
const MAGIC_DIR = Buffer.from('AURADIR01', 'utf8'); // 9 bytes — encrypted folder container
const HEADER_VERSION = 2;
const LEGACY_KDF_ITERATIONS = 100000;
const VAULT_KDF_ITERATIONS = 600000;
const MAX_HEADER_NAME_BYTES = 1024;
const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;
const VERIFIER_CONTEXT = Buffer.from('AuraSync vault password verifier v2', 'utf8');
const KEY_WRAP_CONTEXT = Buffer.from('AuraSync vault data key v2', 'utf8');
const MIN_PASSWORD_LENGTH = 4;
// Archive record layout: [type:1][nameLen:4][size:8][name:nameLen][data:size]
const RECORD_HEADER_BYTES = 13;
const RECORD_FILE = 0x46; // 'F'
const RECORD_DIR = 0x44; // 'D'
const MAX_ARCHIVE_PATH_BYTES = 4096;

function constantTimeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateOriginalName(name) {
  if (
    typeof name !== 'string' || !name || name === '.' || name === '..' || name.length > 255 ||
    /[\\/:*?"<>|\0-\x1f]/.test(name) || /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
  ) {
    throw new Error('اسم الملف المشفر غير صالح');
  }
  if (Buffer.byteLength(name, 'utf8') > MAX_HEADER_NAME_BYTES) {
    throw new Error('اسم الملف المشفر طويل جداً');
  }
  return name;
}

function makeHeaderAad(header, nameLength) {
  return Buffer.concat([header.subarray(0, 22), header.subarray(38, 40 + nameLength)]);
}

function buildHeader(magic, iv, nameBuf) {
  const nameLenBuf = Buffer.alloc(2);
  nameLenBuf.writeUInt16BE(nameBuf.length, 0);
  return Buffer.concat([magic, Buffer.from([HEADER_VERSION]), iv, Buffer.alloc(16), nameLenBuf, nameBuf]);
}

function parseHeaderBytes(header, totalSize) {
  if (!Buffer.isBuffer(header) || header.length < 40 || totalSize < 40) {
    throw new Error('الملف ليس ملف AuraSync مشفر أو تالف');
  }
  const magic = header.subarray(0, 9);
  let entryType = 'file';
  if (magic.equals(MAGIC_DIR)) {
    entryType = 'folder';
  } else if (!magic.equals(MAGIC_HEADER)) {
    throw new Error('الملف ليس ملف AuraSync مشفر أو تالف');
  }
  const version = header[9];
  if (version !== 1 && version !== HEADER_VERSION) throw new Error('إصدار الملف المشفر غير مدعوم');
  const nameLength = header.readUInt16BE(38);
  if (nameLength < 1 || nameLength > MAX_HEADER_NAME_BYTES || header.length < 40 + nameLength || totalSize < 40 + nameLength) {
    throw new Error('رأس الملف المشفر تالف');
  }
  const nameBytes = header.subarray(40, 40 + nameLength);
  let originalName;
  try {
    originalName = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
  } catch (_) {
    throw new Error('اسم الملف داخل الرأس غير صالح');
  }
  validateOriginalName(originalName);
  return {
    version,
    entryType,
    iv: Buffer.from(header.subarray(10, 22)),
    tag: Buffer.from(header.subarray(22, 38)),
    originalName,
    nameLength,
    dataOffset: 40 + nameLength,
    aad: makeHeaderAad(header, nameLength)
  };
}

function readHeaderFromFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (stat.size < 40) throw new Error('رأس الملف المشفر تالف');
    const fixed = Buffer.alloc(40);
    const read = fs.readSync(fd, fixed, 0, fixed.length, 0);
    if (read !== fixed.length) throw new Error('رأس الملف المشفر تالف');
    const nameLength = fixed.readUInt16BE(38);
    if (nameLength < 1 || nameLength > MAX_HEADER_NAME_BYTES || stat.size < 40 + nameLength) {
      throw new Error('رأس الملف المشفر تالف');
    }
    const header = Buffer.alloc(40 + nameLength);
    fixed.copy(header, 0);
    const nameRead = fs.readSync(fd, header, 40, nameLength, 40);
    if (nameRead !== nameLength) throw new Error('رأس الملف المشفر تالف');
    return parseHeaderBytes(header, stat.size);
  } finally {
    fs.closeSync(fd);
  }
}

async function moveFile(sourcePath, destinationPath) {
  try {
    await fs.promises.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
  }

  const tempPath = `${destinationPath}.partial-${crypto.randomBytes(6).toString('hex')}`;
  let destinationCreated = false;
  try {
    const before = await fs.promises.stat(sourcePath);
    await fs.promises.copyFile(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
    const [copied, after] = await Promise.all([
      fs.promises.stat(tempPath),
      fs.promises.stat(sourcePath)
    ]);
    if (copied.size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error('الملف تغيّر أثناء نقله؛ أُوقف النقل لحماية البيانات');
    }
    await fs.promises.rename(tempPath, destinationPath);
    destinationCreated = true;
    await fs.promises.unlink(sourcePath);
  } catch (error) {
    try { await fs.promises.unlink(tempPath); } catch (_) {}
    if (destinationCreated) {
      try { await fs.promises.unlink(destinationPath); } catch (_) {}
    }
    throw error;
  }
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onDrain = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const onError = (err) => { if (settled) return; settled = true; cleanup(); reject(err); };
    const cleanup = () => {
      stream.removeListener('drain', onDrain);
      stream.removeListener('error', onError);
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
    if (stream.write(chunk)) { if (!settled) { settled = true; cleanup(); resolve(); } }
  });
}

async function moveDirectory(sourcePath, destinationPath) {
  try {
    await fs.promises.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
  }
  const tempPath = `${destinationPath}.partial-${crypto.randomBytes(6).toString('hex')}`;
  let created = false;
  try {
    await fs.promises.cp(sourcePath, tempPath, { recursive: true, errorOnExist: true, force: false });
    created = true;
    await fs.promises.rename(tempPath, destinationPath);
    await fs.promises.rm(sourcePath, { recursive: true, force: true });
  } catch (error) {
    try { await fs.promises.rm(tempPath, { recursive: true, force: true }); } catch (_) {}
    if (created) { try { await fs.promises.rm(destinationPath, { recursive: true, force: true }); } catch (_) {} }
    throw error;
  }
}

// Lazily walks a directory tree yielding dir records before their children.
async function* walkDirectory(root) {
  const stack = [{ dir: root, rel: '' }];
  while (stack.length) {
    const { dir, rel } = stack.pop();
    let entries;
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      let isLink = false;
      try { isLink = (await fs.promises.lstat(abs)).isSymbolicLink(); } catch (_) { isLink = true; }
      if (isLink) continue; // never follow or archive symlinks (escape safety)
      if (entry.isDirectory()) {
        yield { relPath: childRel, type: 'dir', absPath: abs };
        stack.push({ dir: abs, rel: childRel });
      } else if (entry.isFile()) {
        yield { relPath: childRel, type: 'file', absPath: abs };
      }
    }
  }
}

async function writeArchiveRecord(sink, relPath, type, absPath) {
  const nameBuf = Buffer.from(relPath, 'utf8');
  if (!nameBuf.length || nameBuf.length > MAX_ARCHIVE_PATH_BYTES) {
    throw new Error('اسم مسار داخل المجلد غير صالح أو طويل جداً');
  }
  let size = 0n;
  if (type === 'file') {
    const stat = await fs.promises.stat(absPath);
    size = BigInt(stat.size);
  }
  const head = Buffer.alloc(RECORD_HEADER_BYTES);
  head[0] = type === 'dir' ? RECORD_DIR : RECORD_FILE;
  head.writeUInt32BE(nameBuf.length, 1);
  head.writeBigUInt64BE(size, 5);
  await writeChunk(sink, head);
  await writeChunk(sink, nameBuf);
  if (type === 'file') {
    const input = fs.createReadStream(absPath);
    try {
      for await (const chunk of input) {
        await writeChunk(sink, chunk);
      }
    } catch (error) {
      input.destroy();
      throw error;
    }
  }
}

function createDecryptedReader(inputPath, key) {
  const parsed = readHeaderFromFile(inputPath);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.iv);
  decipher.setAuthTag(parsed.tag);
  if (parsed.version >= 2) decipher.setAAD(parsed.aad);
  const input = fs.createReadStream(inputPath, { start: parsed.dataOffset });
  input.on('error', (error) => decipher.destroy(error));
  input.pipe(decipher);
  return { parsed, stream: decipher };
}

// Pull-based reader that never buffers more than the current archive chunk.
class ChunkReader {
  constructor(stream) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
    this.done = false;
  }

  async pull() {
    if (this.done) return;
    const next = await this.iterator.next();
    if (next.done) {
      this.done = true;
      return;
    }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, next.value]) : next.value;
  }

  async read(bytes) {
    while (this.buffer.length < bytes) {
      if (this.done) throw new Error('أرشيف الخزنة تالف أو مبتور');
      await this.pull();
    }
    const out = this.buffer.subarray(0, bytes);
    this.buffer = this.buffer.subarray(bytes);
    return out;
  }

  async pipeTo(bytes, writable) {
    let remaining = bytes;
    while (remaining > 0) {
      if (this.buffer.length === 0) {
        if (this.done) throw new Error('أرشيف الخزنة تالف أو مبتور');
        await this.pull();
        continue;
      }
      const take = Math.min(remaining, this.buffer.length);
      const chunk = this.buffer.subarray(0, take);
      this.buffer = this.buffer.subarray(take);
      remaining -= take;
      if (!writable.write(chunk)) {
        await new Promise((resolve, reject) => {
          const onDrain = () => { cleanup(); resolve(); };
          const onError = (err) => { cleanup(); reject(err); };
          const cleanup = () => { writable.removeListener('drain', onDrain); writable.removeListener('error', onError); };
          writable.once('drain', onDrain);
          writable.once('error', onError);
        });
      }
    }
  }
}

class VaultManager {
  constructor() {
    this.sessionKey = null;
    this.storageDir = null;
    this.tempKeys = new Map();
  }

  getStorageDir() {
    if (this.storageDir && fs.existsSync(this.storageDir)) {
      return this.storageDir;
    }
    const userData = app ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'cloudvault-backup');
    const vaultDir = path.join(userData, 'vault_storage');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }
    this.storageDir = vaultDir;
    return this.storageDir;
  }

  hasPassword() {
    return Boolean(this.getVaultPasswordRecord());
  }

  getVaultPasswordRecord() {
    const value = db.getSetting('vault_password_hash');
    if (typeof value !== 'string' || !value.trim()) return null;
    if (value.startsWith('v2:') || value.startsWith('legacy:')) return value;

    // Older releases stored the derived encryption key itself. Convert it to a
    // one-way verifier immediately while retaining legacy file compatibility.
    if (/^[0-9a-f]{64}$/i.test(value)) {
      const legacyKey = Buffer.from(value, 'hex');
      const verifier = crypto.createHmac('sha256', legacyKey).update('AuraSync legacy verifier').digest('hex');
      db.setSetting('vault_password_hash', `legacy:${verifier}`);
      db.setSetting('vault_kdf_iterations', String(LEGACY_KDF_ITERATIONS));
      return `legacy:${verifier}`;
    }
    return null;
  }

  isUnlocked() {
    return Boolean(this.sessionKey);
  }

  lockVault() {
    if (this.sessionKey) this.sessionKey.fill(0);
    this.sessionKey = null;
    return { success: true };
  }

  persistV2Key(password, dataKey, hint = '') {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.pbkdf2Sync(password, salt, VAULT_KDF_ITERATIONS, 64, 'sha256');
    const wrapKey = derived.subarray(0, 32);
    const verifierKey = derived.subarray(32, 64);
    const verifier = crypto.createHmac('sha256', verifierKey).update(VERIFIER_CONTEXT).digest('hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
    cipher.setAAD(KEY_WRAP_CONTEXT);
    const encryptedKey = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    const envelope = Buffer.concat([iv, cipher.getAuthTag(), encryptedKey]);

    db.setSetting('vault_salt', salt);
    db.setSetting('vault_kdf_iterations', String(VAULT_KDF_ITERATIONS));
    db.setSetting('vault_key_envelope', envelope.toString('base64'));
    db.setSetting('vault_hint', hint || '');
    db.setSetting('vault_password_hash', `v2:${verifier}`);
    derived.fill(0);
  }

  readV2Key(password, record) {
    const salt = db.getSetting('vault_salt');
    const envelopeValue = db.getSetting('vault_key_envelope');
    const iterations = Number(db.getSetting('vault_kdf_iterations'));
    if (!salt || !envelopeValue || !Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) return null;
    const derived = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256');
    try {
      const verifier = crypto.createHmac('sha256', derived.subarray(32)).update(VERIFIER_CONTEXT).digest();
      const stored = Buffer.from(record.slice(3), 'hex');
      if (!constantTimeEqual(verifier, stored)) return null;
      const envelope = Buffer.from(envelopeValue, 'base64');
      if (envelope.length !== 60) return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', derived.subarray(0, 32), envelope.subarray(0, 12));
      decipher.setAAD(KEY_WRAP_CONTEXT);
      decipher.setAuthTag(envelope.subarray(12, 28));
      const key = Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]);
      return key.length === 32 ? key : null;
    } catch (_) {
      return null;
    } finally {
      derived.fill(0);
    }
  }

  getDataKey(password) {
    if (typeof password !== 'string') return null;
    const record = this.getVaultPasswordRecord();
    if (!record) return null;
    if (record.startsWith('v2:')) return this.readV2Key(password, record);

    const salt = db.getSetting('vault_salt');
    if (!salt) return null;
    const key = crypto.pbkdf2Sync(password, salt, LEGACY_KDF_ITERATIONS, 32, 'sha256');
    const verifier = crypto.createHmac('sha256', key).update('AuraSync legacy verifier').digest();
    const stored = Buffer.from(record.slice('legacy:'.length), 'hex');
    if (!constantTimeEqual(verifier, stored)) {
      key.fill(0);
      return null;
    }

    // Wrap the existing data key instead of changing it, so old .aura files
    // remain decryptable after the database migration.
    this.persistV2Key(password, key, db.getSetting('vault_hint') || '');
    return key;
  }

  setPassword(password, hint = '') {
    if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > 1024) {
      throw new Error(`كلمة المرور أو الرقم السري يجب أن يتكون من ${MIN_PASSWORD_LENGTH} خانات على الأقل`);
    }
    if (this.hasPassword()) throw new Error('تم تعيين كلمة مرور للخزنة مسبقاً');
    const key = crypto.randomBytes(32);
    this.persistV2Key(password, key, hint);
    this.sessionKey = key;
    return { success: true };
  }

  verifyPassword(password) {
    const key = this.getDataKey(password);
    if (!key) return false;
    key.fill(0);
    return true;
  }

  unlockVault(password) {
    const key = this.getDataKey(password);
    if (!key) throw new Error('كلمة المرور غير صحيحة');
    if (this.sessionKey) this.sessionKey.fill(0);
    this.sessionKey = key;
    return { success: true, stats: db.getVaultStats() };
  }

  getKey(providedPassword) {
    if (providedPassword) {
      const key = this.getDataKey(providedPassword);
      if (!key) throw new Error('كلمة المرور غير صحيحة');
      return key;
    }
    if (this.sessionKey) {
      return Buffer.from(this.sessionKey);
    }
    throw new Error('الخزنة مقفلة. يرجى إدخال كلمة المرور أولاً.');
  }

  getStatus() {
    return {
      hasPassword: this.hasPassword(),
      isUnlocked: this.isUnlocked(),
      hint: db.getSetting('vault_hint') || '',
      stats: db.getVaultStats()
    };
  }

  detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const images = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const videos = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v'];
    const audios = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'];
    const documents = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf', '.csv', '.json', '.md'];
    const archives = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];

    if (images.includes(ext)) return 'image';
    if (videos.includes(ext)) return 'video';
    if (audios.includes(ext)) return 'audio';
    if (documents.includes(ext)) return 'document';
    if (archives.includes(ext)) return 'archive';
    return 'file';
  }

  // Encrypt file using AES-256-GCM with streamed pipeline
  async encryptFile(inputPath, outputPath, key, originalName) {
    return new Promise((resolve, reject) => {
      try {
        const safeName = validateOriginalName(originalName || path.basename(inputPath));
        if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('مفتاح التشفير غير صالح');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath, { flags: 'wx' });
        const nameBuf = Buffer.from(safeName, 'utf8');
        const header = buildHeader(MAGIC_HEADER, iv, nameBuf);
        cipher.setAAD(makeHeaderAad(header, nameBuf.length));
        output.write(header);

        input.on('error', (err) => {
          output.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(err);
        });

        output.on('error', (err) => {
          input.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(err);
        });

        cipher.on('error', (err) => {
          input.destroy();
          output.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(err);
        });

        input.pipe(cipher).pipe(output);

        output.on('finish', () => {
          try {
            const authTag = cipher.getAuthTag();
            const fd = fs.openSync(outputPath, 'r+');
            try { fs.writeSync(fd, authTag, 0, 16, 22); } finally { fs.closeSync(fd); }
            resolve();
          } catch (e) {
            try { fs.unlinkSync(outputPath); } catch (_) {}
            reject(e);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Decrypt file using AES-256-GCM
  async decryptFile(inputPath, outputPath, key) {
    return new Promise((resolve, reject) => {
      try {
        if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('مفتاح فك التشفير غير صالح');
        const parsed = readHeaderFromFile(inputPath);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.iv);
        decipher.setAuthTag(parsed.tag);
        if (parsed.version >= 2) decipher.setAAD(parsed.aad);
        const input = fs.createReadStream(inputPath, { start: parsed.dataOffset });
        const output = fs.createWriteStream(outputPath, { flags: 'wx' });

        const cleanupAndReject = (err) => {
          output.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(err);
        };

        input.on('error', cleanupAndReject);

        output.on('error', (err) => {
          input.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(err);
        });

        decipher.on('error', () => {
          input.destroy();
          output.destroy();
          try { fs.unlinkSync(outputPath); } catch (_) {}
          reject(new Error('فشل فك التشفير: كلمة المرور خاطئة أو الملف تالف'));
        });

        input.pipe(decipher).pipe(output);

        output.on('finish', () => resolve({ originalName: parsed.originalName }));
      } catch (err) {
        reject(err);
      }
    });
  }

  decryptBuffer(inputPath, key) {
    const stat = fs.statSync(inputPath);
    if (stat.size > MAX_PREVIEW_BYTES + MAX_HEADER_NAME_BYTES + 40) {
      throw new Error('حجم الملف أكبر من حد المعاينة الآمنة');
    }
    const encrypted = fs.readFileSync(inputPath);
    const parsed = parseHeaderBytes(encrypted, encrypted.length);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, parsed.iv);
    decipher.setAuthTag(parsed.tag);
    if (parsed.version >= 2) decipher.setAAD(parsed.aad);
    try {
      return Buffer.concat([
        decipher.update(encrypted.subarray(parsed.dataOffset)),
        decipher.final()
      ]);
    } catch (_) {
      throw new Error('فشل فك التشفير: كلمة المرور خاطئة أو الملف تالف');
    }
  }

  // Encrypt an entire directory tree into one authenticated streaming container.
  async packDirectory(inputDir, outputPath, key, originalName) {
    const safeName = validateOriginalName(originalName || path.basename(inputDir));
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('مفتاح التشفير غير صالح');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const nameBuf = Buffer.from(safeName, 'utf8');
    const header = buildHeader(MAGIC_DIR, iv, nameBuf);
    cipher.setAAD(makeHeaderAad(header, nameBuf.length));
    const output = fs.createWriteStream(outputPath, { flags: 'wx' });

    const cleanup = () => {
      try { cipher.destroy(); } catch (_) {}
      try { output.destroy(); } catch (_) {}
      try { fs.unlinkSync(outputPath); } catch (_) {}
    };

    try {
      await writeChunk(output, header);
      cipher.pipe(output);
      const pipeDone = new Promise((resolve, reject) => {
        output.once('finish', resolve);
        output.once('error', reject);
        cipher.once('error', reject);
      });
      for await (const entry of walkDirectory(inputDir)) {
        await writeArchiveRecord(cipher, entry.relPath, entry.type, entry.absPath);
      }
      await writeChunk(cipher, Buffer.alloc(RECORD_HEADER_BYTES)); // end marker
      cipher.end();
      await pipeDone;
      const authTag = cipher.getAuthTag();
      const fd = fs.openSync(outputPath, 'r+');
      try { fs.writeSync(fd, authTag, 0, 16, 22); } finally { fs.closeSync(fd); }
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  // Decrypt and extract a folder container into destDir (created if needed).
  async unpackDirectory(inputPath, destDir, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('مفتاح فك التشفير غير صالح');
    const { parsed, stream } = createDecryptedReader(inputPath, key);
    if (parsed.entryType !== 'folder') throw new Error('هذا الملف ليس مجلد AuraSync مشفر');
    const reader = new ChunkReader(stream);
    const destRoot = path.resolve(destDir);
    let createdRoot = false;
    if (!fs.existsSync(destRoot)) {
      fs.mkdirSync(destRoot, { recursive: true });
      createdRoot = true;
    }
    const emptyHead = Buffer.alloc(RECORD_HEADER_BYTES);
    try {
      for (;;) {
        const head = await reader.read(RECORD_HEADER_BYTES);
        const type = head[0];
        if (type === 0x00 && head.equals(emptyHead)) break;
        if (type !== RECORD_FILE && type !== RECORD_DIR) throw new Error('سجل أرشيف غير صالح');
        const nameLen = head.readUInt32BE(1);
        if (nameLen < 1 || nameLen > MAX_ARCHIVE_PATH_BYTES) throw new Error('سجل أرشيف غير صالح');
        const sizeBig = head.readBigUInt64BE(5);
        const size = Number(sizeBig);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('حجم ملف غير صالح داخل الأرشيف');
        const nameBuf = await reader.read(nameLen);
        let rel = nameBuf.toString('utf8').replace(/\\/g, '/');
        const entryPath = resolveWithin(destRoot, rel);
        if (type === RECORD_DIR) {
          fs.mkdirSync(entryPath, { recursive: true });
          continue;
        }
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });
        const writable = fs.createWriteStream(entryPath, { flags: 'wx' });
        try {
          await reader.pipeTo(size, writable);
          await new Promise((resolve, reject) => {
            writable.once('finish', resolve);
            writable.once('error', reject);
            writable.end();
          });
        } catch (error) {
          try { writable.destroy(); } catch (_) {}
          try { fs.unlinkSync(entryPath); } catch (_) {}
          throw error;
        }
      }
    } catch (error) {
      if (createdRoot) {
        try { fs.rmSync(destRoot, { recursive: true, force: true }); } catch (_) {}
      }
      throw error;
    } finally {
      try { stream.destroy(); } catch (_) {}
    }
  }

  // 1. Lock: encrypts in place (filename -> filename.aura)
  async lockItem(targetPath, password) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`الملف غير موجود: ${targetPath}`);
    }
    const stat = fs.statSync(targetPath);
    if (fs.lstatSync(targetPath).isSymbolicLink()) throw new Error('لا يمكن قفل رابط رمزي مباشرة');

    const isDirectory = stat.isDirectory();
    const key = this.getKey(password);
    const fileName = path.basename(targetPath);
    const dir = path.dirname(targetPath);
    const encryptedPath = this.uniquePath(path.join(dir, `${fileName}.aura`));

    try {
      if (isDirectory) {
        await this.packDirectory(targetPath, encryptedPath, key, fileName);
      } else {
        await this.encryptFile(targetPath, encryptedPath, key, fileName);
      }
    } finally {
      key.fill(0);
    }

    const folderSize = isDirectory ? await this.getDirectorySize(targetPath) : stat.size;

    // Remove the plaintext original (file or whole folder)
    if (isDirectory) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }

    const fileType = isDirectory ? 'folder' : this.detectFileType(fileName);
    const item = db.addVaultItem({
      original_path: targetPath,
      current_path: encryptedPath,
      file_name: fileName,
      file_size: folderSize,
      file_type: fileType,
      mode: 'lock',
      is_encrypted: 1,
      is_hidden: 0,
      is_locked: 1,
      notes: isDirectory ? 'مجلد مقفل ومشفر في مكانه' : 'مقفل ومشفر في مكانه'
    });

    return item;
  }

  uniquePath(candidate) {
    if (!fs.existsSync(candidate)) return candidate;
    const dir = path.dirname(candidate);
    const ext = path.extname(candidate);
    const base = path.basename(candidate, ext);
    for (let i = 1; i < 10000; i++) {
      const next = path.join(dir, `${base} (${i})${ext}`);
      if (!fs.existsSync(next)) return next;
    }
    return path.join(dir, `${base}-${Date.now()}${ext}`);
  }

  async getDirectorySize(dir) {
    let total = 0;
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try { entries = await fs.promises.readdir(current, { withFileTypes: true }); } catch (_) { continue; }
      for (const entry of entries) {
        const abs = path.join(current, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          stack.push(abs);
        } else if (entry.isFile()) {
          try { total += (await fs.promises.stat(abs)).size; } catch (_) {}
        }
      }
    }
    return total;
  }

  // 2. Hide: moves file to vault storage without encryption
  async hideItem(targetPath) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`الملف غير موجود: ${targetPath}`);
    }
    const stat = fs.statSync(targetPath);
    if (fs.lstatSync(targetPath).isSymbolicLink()) throw new Error('لا يمكن إخفاء رابط رمزي مباشرة');
    const isDirectory = stat.isDirectory();
    const fileName = path.basename(targetPath);
    const storageDir = this.getStorageDir();
    const safeId = `vlt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storagePath = path.join(storageDir, `${safeId}.bin`);

    if (isDirectory) {
      await moveDirectory(targetPath, storagePath);
    } else {
      await moveFile(targetPath, storagePath);
    }

    const fileType = isDirectory ? 'folder' : this.detectFileType(fileName);
    const item = db.addVaultItem({
      original_path: targetPath,
      current_path: storagePath,
      file_name: fileName,
      file_size: isDirectory ? await this.getDirectorySize(storagePath) : stat.size,
      file_type: fileType,
      mode: 'hide',
      is_encrypted: 0,
      is_hidden: 1,
      is_locked: 1,
      notes: isDirectory ? 'مجلد مخفي في الخزنة' : 'مخفي في الخزنة'
    });

    return item;
  }

  // 3. Lock & Hide: encrypts AND moves to vault storage (Maximum Protection)
  async lockAndHideItem(targetPath, password) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`الملف غير موجود: ${targetPath}`);
    }
    const stat = fs.statSync(targetPath);
    const isDirectory = stat.isDirectory();
    if (fs.lstatSync(targetPath).isSymbolicLink()) throw new Error('لا يمكن قفل رابط رمزي مباشرة');

    const key = this.getKey(password);
    const fileName = path.basename(targetPath);
    const storageDir = this.getStorageDir();
    const safeId = `vlt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storagePath = path.join(storageDir, `${safeId}.aura`);

    // Encrypt directly to vault storage
    try {
      if (isDirectory) {
        await this.packDirectory(targetPath, storagePath, key, fileName);
      } else {
        await this.encryptFile(targetPath, storagePath, key, fileName);
      }
    } finally {
      key.fill(0);
    }

    const folderSize = isDirectory ? await this.getDirectorySize(targetPath) : stat.size;

    // Remove plaintext original (file or whole folder)
    if (isDirectory) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }

    const fileType = isDirectory ? 'folder' : this.detectFileType(fileName);
    const item = db.addVaultItem({
      original_path: targetPath,
      current_path: storagePath,
      file_name: fileName,
      file_size: folderSize,
      file_type: fileType,
      mode: 'lock_hide',
      is_encrypted: 1,
      is_hidden: 1,
      is_locked: 1,
      notes: isDirectory ? 'مجلد مقفل ومشفر ومخفي تماماً' : 'مقفل ومشفر ومخفي تماماً'
    });

    return item;
  }

  // Restore item back to its original location
  async restoreItem(itemId, password) {
    const item = db.getVaultItemById(itemId);
    if (!item) {
      throw new Error('العنصر غير موجود في الخزنة');
    }

    if (!fs.existsSync(item.current_path)) {
      throw new Error(`الملف المشفر/المخزن غير موجود على القرص: ${item.current_path}`);
    }

    // Ensure target folder exists
    const targetDir = path.dirname(item.original_path);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const isFolder = item.file_type === 'folder';
    let destPath = item.original_path;
    // Handle collision if something already exists at the original path
    if (fs.existsSync(destPath)) {
      if (isFolder) {
        destPath = path.join(targetDir, `${path.basename(destPath)}_restored_${Date.now()}`);
      } else {
        const ext = path.extname(destPath);
        const nameWithoutExt = path.basename(destPath, ext);
        destPath = path.join(targetDir, `${nameWithoutExt}_restored_${Date.now()}${ext}`);
      }
    }

    if (isFolder) {
      if (item.mode === 'hide') {
        await moveDirectory(item.current_path, destPath);
      } else {
        // lock / lock_hide → decrypt + extract
        const key = this.getKey(password);
        try { await this.unpackDirectory(item.current_path, destPath, key); }
        finally { key.fill(0); }
        try { fs.unlinkSync(item.current_path); }
        catch (error) { throw new Error(`تمت استعادة المجلد لكن تعذر حذف النسخة المشفرة: ${error.message}`); }
      }
    } else if (item.mode === 'lock') {
      const key = this.getKey(password);
      try { await this.decryptFile(item.current_path, destPath, key); }
      finally { key.fill(0); }
      try { fs.unlinkSync(item.current_path); }
      catch (error) { throw new Error(`تمت استعادة الملف لكن تعذر حذف النسخة المشفرة: ${error.message}`); }
    } else if (item.mode === 'hide') {
      await moveFile(item.current_path, destPath);
    } else if (item.mode === 'lock_hide') {
      const key = this.getKey(password);
      try { await this.decryptFile(item.current_path, destPath, key); }
      finally { key.fill(0); }
      try { fs.unlinkSync(item.current_path); }
      catch (error) { throw new Error(`تمت استعادة الملف لكن تعذر حذف النسخة المشفرة: ${error.message}`); }
    }

    db.deleteVaultItem(itemId);
    return { success: true, restoredPath: destPath, isFolder };
  }

  // Delete item permanently from vault
  deleteItem(itemId) {
    const item = db.getVaultItemById(itemId);
    if (!item) return { success: true };

    try {
      if (fs.existsSync(item.current_path)) {
        const stat = fs.statSync(item.current_path);
        if (stat.isDirectory()) {
          fs.rmSync(item.current_path, { recursive: true, force: true });
        } else {
          fs.unlinkSync(item.current_path);
        }
      }
    } catch (e) {
      return { success: false, error: `تعذر حذف العنصر من القرص: ${e.message}` };
    }

    this.clearTempRegistration(itemId);
    db.deleteVaultItem(itemId);
    return { success: true };
  }

  // In-memory decrypted preview for images/text
  async getPreviewData(itemId, password) {
    const item = db.getVaultItemById(itemId);
    if (!item) throw new Error('العنصر غير موجود');

    if (!fs.existsSync(item.current_path)) {
      throw new Error('الملف غير موجود على القرص');
    }

    if (item.file_type === 'folder') {
      return { supported: false, fileType: 'folder' };
    }

    const ext = path.extname(item.file_name).toLowerCase();
    const isImage = ['image'].includes(item.file_type);

    if (item.mode === 'hide') {
      // Unencrypted file in storage
      if (isImage) {
        if (ext === '.svg') return { supported: false, fileType: item.file_type };
        const stat = fs.statSync(item.current_path);
        if (stat.size > MAX_PREVIEW_BYTES) throw new Error('حجم الصورة أكبر من حد المعاينة الآمنة');
        const mime = this.imageMimeType(ext);
        const buffer = fs.readFileSync(item.current_path);
        return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, fileType: item.file_type };
      }
      return { supported: false, fileType: item.file_type };
    }

    // Encrypted file (lock or lock_hide)
    const key = this.getKey(password);
    try {
      if (!isImage || ext === '.svg') return { supported: false, fileType: item.file_type };
      const buffer = this.decryptBuffer(item.current_path, key);
      const mime = this.imageMimeType(ext);
      return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, fileType: item.file_type };
    } finally {
      key.fill(0);
    }
  }

  imageMimeType(ext) {
    const types = {
      '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
      '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
    };
    return types[ext] || 'image/jpeg';
  }

  getItems() {
    const list = this.getTempOpenList();
    return db.getVaultItems().map((item) => ({
      ...item,
      isTempOpen: list.some((entry) => String(entry.itemId) === String(item.id))
    }));
  }

  // Get info for unlocking a file from disk
  getUnlockFileInfo(targetPath) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`الملف غير موجود: ${targetPath}`);
    }

    const stat = fs.statSync(targetPath);
    const isDirectory = stat.isDirectory();
    let fileName = path.basename(targetPath);
    let originalName = fileName;
    let fileType = isDirectory ? 'folder' : 'file';
    let entryType = isDirectory ? 'folder' : 'file';

    const dbItem = db.getVaultItemByCurrentPath(targetPath) || db.getVaultItemByOriginalPath(targetPath);
    if (dbItem) {
      originalName = dbItem.file_name;
      fileType = dbItem.file_type;
      entryType = dbItem.file_type === 'folder' ? 'folder' : 'file';
    } else if (fileName.endsWith('.aura')) {
      const parsed = readHeaderFromFile(targetPath);
      originalName = parsed.originalName;
      entryType = parsed.entryType;
      fileType = parsed.entryType === 'folder' ? 'folder' : this.detectFileType(originalName);
    }
    validateOriginalName(originalName);

    return {
      targetPath,
      fileName,
      originalName,
      fileSize: stat.size,
      fileType,
      entryType,
      isDirectory,
      hasPassword: this.hasPassword(),
      hint: db.getSetting('vault_hint') || '',
      isUnlocked: this.isUnlocked()
    };
  }

  // ---- Temporary folder-open (auto re-lock) session ----
  getTempOpenList() {
    try {
      const raw = db.getSetting('vault_temp_open');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  saveTempOpenList(list) {
    try { db.setSetting('vault_temp_open', JSON.stringify(list || [])); } catch (_) {}
  }

  tempRegistrationKey(itemId, containerPath) {
    return itemId != null ? `id:${itemId}` : `path:${containerPath}`;
  }

  isTempOpen(itemId, originalPath) {
    return this.getTempOpenList().some((entry) =>
      (itemId != null && String(entry.itemId) === String(itemId)) ||
      (originalPath && entry.originalPath === originalPath)
    );
  }

  clearTempRegistration(itemId) {
    if (itemId == null) return;
    const list = this.getTempOpenList().filter((entry) => String(entry.itemId) !== String(itemId));
    this.saveTempOpenList(list);
  }

  getBaseSessionDir() {
    let baseDir;
    try {
      baseDir = app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(require('os').tmpdir(), 'aurasync-dev');
    } catch (_) {
      baseDir = path.join(require('os').tmpdir(), 'aurasync-dev');
    }
    const sessionBase = path.join(baseDir, 'vault_sessions');
    if (!fs.existsSync(sessionBase)) {
      try { fs.mkdirSync(sessionBase, { recursive: true }); } catch (_) {}
    }
    return sessionBase;
  }

  getSecureSessionPath(targetPath, originalName) {
    const hash = crypto.createHash('sha256').update(path.resolve(targetPath)).digest('hex').substring(0, 16);
    const sessionDir = path.join(this.getBaseSessionDir(), hash);
    if (!fs.existsSync(sessionDir)) {
      try { fs.mkdirSync(sessionDir, { recursive: true }); } catch (_) {}
    }
    return path.join(sessionDir, originalName);
  }

  async forceRemoveDir(dirPath) {
    if (!dirPath || !fs.existsSync(dirPath)) return;
    try {
      const walkRemoveReadonly = async (target) => {
        let entries = [];
        try { entries = await fs.promises.readdir(target, { withFileTypes: true }); } catch (_) {}
        for (const entry of entries) {
          const abs = path.join(target, entry.name);
          try { await fs.promises.chmod(abs, 0o666); } catch (_) {}
          if (entry.isDirectory()) await walkRemoveReadonly(abs);
        }
        try { await fs.promises.chmod(target, 0o777); } catch (_) {}
      };
      await walkRemoveReadonly(dirPath);
    } catch (_) {}

    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.warn('Could not immediately remove session dir:', err && err.message);
    }
  }

  // Drop registrations whose plaintext no longer exists (e.g. relocked already).
  async reconcileTempEntries() {
    const list = this.getTempOpenList();
    const kept = list.filter((entry) => {
      const livePath = entry.sessionPath || entry.originalPath;
      return fs.existsSync(livePath) && fs.existsSync(entry.containerPath);
    });
    if (kept.length !== list.length) this.saveTempOpenList(kept);

    for (const entry of kept) {
      const livePath = entry.sessionPath || entry.originalPath;
      const isOpen = await this.isFolderOpenInExplorer(livePath);
      if (!isOpen) {
        setTimeout(() => {
          this.relockTempEntry(entry).catch(() => {});
        }, 1000);
      } else {
        this.startAutoRelockWatcher(entry);
      }
    }

    return kept;
  }

  async isFolderOpenInExplorer(folderPath) {
    if (process.platform !== 'win32' || !folderPath) return false;
    return new Promise((resolve) => {
      const norm = path.resolve(folderPath).toLowerCase();
      const ps = '(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { try { $_.Document.Folder.Self.Path } catch {} }';
      const { execFile } = require('child_process');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 4000
      }, (err, stdout) => {
        if (err || !stdout) return resolve(false);
        const openPaths = stdout.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
        resolve(openPaths.some(p => p === norm || p.startsWith(norm + '\\')));
      });
    });
  }

  startAutoRelockWatcher(entry) {
    if (!entry) return;
    const watchPath = entry.sessionPath || entry.originalPath;
    if (!watchPath) return;
    if (!this.activeFolderWatchers) this.activeFolderWatchers = new Map();
    if (this.activeFolderWatchers.has(entry.key)) return;

    let openDetected = false;
    let checksWithoutWindow = 0;
    const startTime = Date.now();

    const intervalId = setInterval(async () => {
      try {
        if (!fs.existsSync(watchPath)) {
          clearInterval(intervalId);
          this.activeFolderWatchers.delete(entry.key);
          return;
        }

        const isOpen = await this.isFolderOpenInExplorer(watchPath);
        if (isOpen) {
          openDetected = true;
          checksWithoutWindow = 0;
        } else {
          if (openDetected) {
            checksWithoutWindow++;
            if (checksWithoutWindow >= 2) {
              clearInterval(intervalId);
              this.activeFolderWatchers.delete(entry.key);
              await this.relockTempEntry(entry);
              const { Notification } = require('electron');
              if (Notification && Notification.isSupported()) {
                new Notification({
                  title: 'AuraSync 🛡️ — إعادة القفل التلقائي',
                  body: `تم إغلاق «${entry.originalName}» وإعادة تشفيره وحذف النسخة المؤقتة بأمان.`
                }).show();
              }
            }
          } else if (Date.now() - startTime > 180000) {
            clearInterval(intervalId);
            this.activeFolderWatchers.delete(entry.key);
            await this.relockTempEntry(entry);
          }
        }
      } catch (_) {}
    }, 3000);

    this.activeFolderWatchers.set(entry.key, intervalId);
  }

  async tempOpenFolder(targetPath, password, dbItem, info) {
    const key = this.getKey(password); // validates the password
    const sessionPath = this.getSecureSessionPath(targetPath, info.originalName);
    const regKey = this.tempRegistrationKey(dbItem ? dbItem.id : null, targetPath);
    const list = this.getTempOpenList();

    if (list.some((entry) => entry.key === regKey) && fs.existsSync(sessionPath)) {
      key.fill(0);
      this.openPathSafe(sessionPath);
      const existingEntry = list.find((e) => e.key === regKey);
      if (existingEntry) this.startAutoRelockWatcher(existingEntry);
      return { success: true, restoredPath: sessionPath, tempOpen: true, alreadyOpen: true, isFolder: true };
    }

    if (fs.existsSync(sessionPath)) {
      await this.forceRemoveDir(sessionPath);
    }
    const parentDir = path.dirname(sessionPath);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

    try {
      await this.unpackDirectory(targetPath, sessionPath, key);
    } catch (error) {
      key.fill(0);
      throw error;
    }

    if (this.sessionKey) this.sessionKey.fill(0);
    this.sessionKey = Buffer.from(key);
    const cached = this.tempKeys.get(regKey);
    if (cached) { try { cached.fill(0); } catch (_) {} }
    this.tempKeys.set(regKey, key);

    const entry = {
      key: regKey,
      itemId: dbItem ? dbItem.id : null,
      containerPath: targetPath,
      sessionPath,
      originalPath: dbItem ? dbItem.original_path : path.resolve(path.dirname(targetPath), info.originalName),
      originalName: info.originalName,
      fileType: 'folder',
      createdAt: Date.now()
    };
    this.saveTempOpenList([...list.filter((e) => e.key !== regKey), entry]);

    this.openPathSafe(sessionPath);
    this.startAutoRelockWatcher(entry);
    return { success: true, restoredPath: sessionPath, tempOpen: true, isFolder: true };
  }

  async tempOpenFile(targetPath, password, dbItem, info) {
    const key = this.getKey(password);
    const sessionPath = this.getSecureSessionPath(targetPath, info.originalName);
    const regKey = this.tempRegistrationKey(dbItem ? dbItem.id : null, targetPath);
    const list = this.getTempOpenList();

    if (fs.existsSync(sessionPath)) {
      try { await fs.promises.unlink(sessionPath); } catch (_) {}
    }
    const parentDir = path.dirname(sessionPath);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

    try {
      await this.decryptFile(targetPath, sessionPath, key);
    } catch (error) {
      key.fill(0);
      throw error;
    }

    if (this.sessionKey) this.sessionKey.fill(0);
    this.sessionKey = Buffer.from(key);
    const cached = this.tempKeys.get(regKey);
    if (cached) { try { cached.fill(0); } catch (_) {} }
    this.tempKeys.set(regKey, key);

    const entry = {
      key: regKey,
      itemId: dbItem ? dbItem.id : null,
      containerPath: targetPath,
      sessionPath,
      originalPath: dbItem ? dbItem.original_path : path.resolve(path.dirname(targetPath), info.originalName),
      originalName: info.originalName,
      fileType: 'file',
      createdAt: Date.now()
    };
    this.saveTempOpenList([...list.filter((e) => e.key !== regKey), entry]);

    this.openPathSafe(sessionPath);
    this.startAutoRelockWatcher(entry);
    return { success: true, restoredPath: sessionPath, tempOpen: true, isFolder: false };
  }

  async relockTempEntry(entry) {
    if (this.activeFolderWatchers && this.activeFolderWatchers.has(entry.key)) {
      clearInterval(this.activeFolderWatchers.get(entry.key));
      this.activeFolderWatchers.delete(entry.key);
    }

    const list = this.getTempOpenList();
    const livePath = entry.sessionPath || entry.originalPath;
    if (!fs.existsSync(livePath)) {
      this.saveTempOpenList(list.filter((e) => e.key !== entry.key));
      const cached = this.tempKeys.get(entry.key);
      if (cached) { try { cached.fill(0); } catch (_) {} }
      this.tempKeys.delete(entry.key);
      return { success: true, skipped: true };
    }

    const key = this.tempKeys.get(entry.key) || this.sessionKey;
    if (!key) throw new Error('أدخل كلمة مرور الخزنة لإعادة القفل التلقائي');

    const tempContainer = `${entry.containerPath}.relock-${crypto.randomBytes(4).toString('hex')}`;
    try {
      if (entry.fileType === 'folder') {
        await this.packDirectory(livePath, tempContainer, key, entry.originalName);
      } else {
        await this.encryptFile(livePath, tempContainer, key, entry.originalName);
      }
      await fs.promises.rename(tempContainer, entry.containerPath);
      if (entry.sessionPath) {
        await this.forceRemoveDir(path.dirname(entry.sessionPath));
      } else if (entry.fileType === 'folder') {
        await this.forceRemoveDir(livePath);
      } else {
        try { await fs.promises.unlink(livePath); } catch (_) {}
      }
    } catch (error) {
      try { await fs.promises.unlink(tempContainer); } catch (_) {}
      throw error;
    } finally {
      const cached = this.tempKeys.get(entry.key);
      if (cached) { try { cached.fill(0); } catch (_) {} }
      this.tempKeys.delete(entry.key);
    }

    this.saveTempOpenList(this.getTempOpenList().filter((e) => e.key !== entry.key));
    return { success: true, relockedPath: entry.containerPath };
  }

  async relockTempFolderById(itemId) {
    const entry = this.getTempOpenList().find((e) => String(e.itemId) === String(itemId));
    if (!entry) return { success: true, skipped: true };
    return this.relockTempEntry(entry);
  }

  async relockAllTempEntries() {
    const results = [];
    for (const entry of this.getTempOpenList()) {
      try { results.push(await this.relockTempEntry(entry)); }
      catch (error) { results.push({ success: false, error: error.message, entry }); }
    }
    return results;
  }

  openPathSafe(target) {
    try {
      const { shell } = require('electron');
      if (shell && typeof shell.openPath === 'function') shell.openPath(target);
    } catch (err) {
      console.warn('Could not open path:', err && err.message);
    }
  }

  // Decrypt and optionally launch.
  // When launchAfter is true: opens in an isolated secure sandbox session (leaving zero exposed
  // copies in the user directory; single protected .aura copy stays intact).
  // When launchAfter is false: performs permanent restore and deletes the .aura container.
  async unlockAndLaunch(targetPath, password, launchAfter = true) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`الملف غير موجود: ${targetPath}`);
    }

    const dbItem = db.getVaultItemByCurrentPath(targetPath) || db.getVaultItemByOriginalPath(targetPath);
    const info = this.getUnlockFileInfo(targetPath);
    const isFolder = info.entryType === 'folder';

    if (launchAfter) {
      if (isFolder) {
        return this.tempOpenFolder(targetPath, password, dbItem, info);
      } else {
        return this.tempOpenFile(targetPath, password, dbItem, info);
      }
    }

    // Permanent Restore / Unprotect: Decrypts in-place and removes the .aura container
    let restoredPath = null;
    if (dbItem) {
      const res = await this.restoreItem(dbItem.id, password);
      restoredPath = res.restoredPath;
    } else {
      const dir = path.dirname(targetPath);
      if (isFolder) {
        let targetOut = resolveWithin(dir, info.originalName);
        if (fs.existsSync(targetOut)) targetOut = resolveWithin(dir, `${info.originalName}_restored_${Date.now()}`);
        const key = this.getKey(password);
        try { await this.unpackDirectory(targetPath, targetOut, key); }
        finally { key.fill(0); }
        try { fs.unlinkSync(targetPath); } catch (_) {}
        restoredPath = targetOut;
      } else {
        let targetOut = resolveWithin(dir, info.originalName);
        if (fs.existsSync(targetOut)) {
          const ext = path.extname(targetOut);
          const nameNoExt = path.basename(targetOut, ext);
          targetOut = resolveWithin(dir, `${nameNoExt}_restored_${Date.now()}${ext}`);
        }
        const key = this.getKey(password);
        try { await this.decryptFile(targetPath, targetOut, key); }
        finally { key.fill(0); }
        try { fs.unlinkSync(targetPath); } catch (_) {}
        restoredPath = targetOut;
      }
    }

    return { success: true, restoredPath, isFolder };
  }
}

module.exports = new VaultManager();
