const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebDAVProvider } = require('./protocols/webdav');
const { S3Provider } = require('./protocols/s3');

// Electron's safeStorage is only available in the main process; guarded for tests
let safeStorage = null;
try {
  const electron = require('electron');
  if (electron && electron.safeStorage) safeStorage = electron.safeStorage;
} catch (_) {}

class AccountManager {
  constructor() {
    this.filePath = null;
    this.accounts = [];
    this.instances = new Map();
    this.encryptionProvider = safeStorage;
  }

  init(userDataPath) {
    try {
      this.filePath = path.join(userDataPath, 'accounts.json');
    } catch (_) {
      this.filePath = path.join(process.cwd(), 'accounts.json');
    }
    this.load();
  }

  load() {
    try {
      if (this.filePath && fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
      } else {
        this.accounts = [];
      }
      this.instances.clear();
      this.migrateLegacySecrets();
    } catch (e) {
      console.error('Accounts load error:', e.message);
      this.accounts = [];
    }
  }

  save() {
    if (!this.filePath) throw new Error('Account storage is not initialized');
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ accounts: this.accounts }, null, 2), 'utf8');
  }

  hasSecureStorage() {
    const provider = this.encryptionProvider;
    try {
      return Boolean(
        provider && typeof provider.isEncryptionAvailable === 'function' &&
        provider.isEncryptionAvailable() && typeof provider.encryptString === 'function' &&
        typeof provider.decryptString === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  migrateLegacySecrets() {
    if (!this.hasSecureStorage()) return;
    let changed = false;
    for (const account of this.accounts) {
      if (!account || typeof account.secret !== 'string' || !account.secret.startsWith('b64:')) continue;
      try {
        const legacy = JSON.parse(Buffer.from(account.secret.slice(4), 'base64').toString('utf8'));
        account.secret = this.encryptSecret(legacy);
        changed = true;
      } catch (error) {
        console.error('Legacy account secret migration failed:', error.message);
      }
    }
    if (changed) {
      try { this.save(); } catch (error) { console.error('Migrated account secrets could not be saved:', error.message); }
    }
  }

  encryptSecret(secret) {
    const json = JSON.stringify(secret || {});
    if (!this.hasSecureStorage()) {
      throw new Error('لا يتوفر تخزين آمن على هذا الجهاز؛ لم يتم حفظ بيانات الحساب.');
    }
    try {
      return 'enc:' + this.encryptionProvider.encryptString(json).toString('base64');
    } catch (error) {
      throw new Error(`فشل تشفير بيانات الحساب بأمان: ${error.message}`);
    }
  }

  decryptSecret(blob) {
    if (!blob) return {};
    try {
      if (blob.startsWith('enc:') && !this.hasSecureStorage()) {
        console.warn('Encrypted secret found but safeStorage is unavailable; the account may need to be re-added.');
        return {};
      }
      if (blob.startsWith('enc:') && this.hasSecureStorage()) {
        const buffer = Buffer.from(blob.slice(4), 'base64');
        return JSON.parse(this.encryptionProvider.decryptString(buffer));
      }
      if (blob.startsWith('b64:')) {
        console.warn('Legacy base64 account secrets are disabled until secure storage is available.');
        return {};
      }
    } catch (e) {
      console.error(
        'Secret decrypt error (the stored account may need to be re-added):',
        e.message
      );
    }
    return {};
  }

  create(type, label, config, secret) {
    const encryptedSecret = this.encryptSecret(secret);
    const id = `${type}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const account = {
      id,
      type,
      label: label || (type === 'webdav' ? 'WebDAV' : 'S3 Storage'),
      config: config || {},
      secret: encryptedSecret,
      createdAt: new Date().toISOString()
    };
    this.accounts.push(account);
    try {
      this.save();
    } catch (error) {
      this.accounts = this.accounts.filter((entry) => entry.id !== id);
      throw error;
    }
    return account;
  }

  remove(id) {
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this.instances.delete(id);
    this.save();
  }

  clearAll() {
    this.accounts = [];
    this.instances.clear();
    this.save();
  }

  getRaw(id) {
    return this.accounts.find((a) => a.id === id) || null;
  }

  listRaw() {
    return this.accounts.slice();
  }

  getInstance(id) {
    if (this.instances.has(id)) return this.instances.get(id);
    const account = this.getRaw(id);
    if (!account) return null;

    let instance = null;
    if (account.type === 'webdav') {
      instance = new WebDAVProvider(account, this.decryptSecret(account.secret));
    } else if (account.type === 's3') {
      instance = new S3Provider(account, this.decryptSecret(account.secret));
    }

    if (instance) this.instances.set(id, instance);
    return instance;
  }
}

module.exports = new AccountManager();
