// Central registry for all supported cloud storage providers.
//
// Built-in OAuth providers are singletons (google / onedrive / dropbox).
// Any number of "custom" accounts can be added for protocol providers
// (WebDAV, S3-compatible). Every provider implements the same interface:
//   id, type, label, isConfigured(), isConnected(), getStatusInfo(), initialize(),
//   startOAuthFlow() [oauth only], logout(), getStorageState(), isQuotaFull(),
//   ensureRootBackupFolder(), ensureFolder(name, parentId), listFolder(folderId),
//   uploadFile({...}), downloadFile({...}), trashFile(fileId), getRootFolderId()

const google = require('./google-drive');
const oneDrive = require('./onedrive');
const dropbox = require('./dropbox');
const db = require('./database');
const accountManager = require('./account-manager');
const { WebDAVProvider } = require('./protocols/webdav');
const { S3Provider } = require('./protocols/s3');

const builtIns = { google, onedrive: oneDrive, dropbox };

const PROVIDER_TYPES = [
  { type: 'google', label: 'Google Drive', auth: 'oauth' },
  { type: 'onedrive', label: 'OneDrive', auth: 'oauth' },
  { type: 'dropbox', label: 'Dropbox', auth: 'oauth' },
  { type: 'webdav', label: 'WebDAV', auth: 'config' },
  { type: 's3', label: 'S3-Compatible', auth: 'config' }
];

function initAccounts(userDataPath) {
  accountManager.init(userDataPath);
}

function getProvider(id) {
  if (!id) return null;
  if (builtIns[id]) return builtIns[id];
  return accountManager.getInstance(id);
}

function listProviderTypes() {
  return PROVIDER_TYPES.slice();
}

function getStatuses() {
  const result = [];

  for (const provider of Object.values(builtIns)) {
    try {
      result.push(provider.getStatusInfo());
    } catch (err) {
      result.push({ id: provider.id, type: provider.id, label: provider.label, configured: false, connected: false, error: err.message });
    }
  }

  for (const raw of accountManager.listRaw()) {
    const instance = accountManager.getInstance(raw.id);
    if (instance) {
      try {
        result.push(instance.getStatusInfo());
      } catch (err) {
        result.push({ id: raw.id, type: raw.type, label: raw.label, configured: false, connected: false, error: err.message });
      }
    } else {
      result.push({ id: raw.id, type: raw.type, label: raw.label, configured: false, connected: false });
    }
  }

  return result;
}

function hasAnyConnected() {
  for (const provider of Object.values(builtIns)) {
    try {
      if (provider.isConnected()) return true;
    } catch (_) {}
  }
  for (const raw of accountManager.listRaw()) {
    const instance = accountManager.getInstance(raw.id);
    if (instance && instance.isConnected()) return true;
  }
  return false;
}

function getConnectedProviders() {
  const result = [];
  for (const provider of Object.values(builtIns)) {
    try {
      if (provider.isConnected && provider.isConnected()) {
        result.push(provider);
      }
    } catch (_) {}
  }
  for (const raw of accountManager.listRaw()) {
    const instance = accountManager.getInstance(raw.id);
    if (instance && instance.isConnected && instance.isConnected()) {
      result.push(instance);
    }
  }
  return result;
}

async function createCustomAccount(type, label, config, secret) {
  let instance = null;

  if (type === 'webdav') {
    instance = new WebDAVProvider({ id: 'preview', type, label, config: config || {} }, secret || {});
  } else if (type === 's3') {
    instance = new S3Provider({ id: 'preview', type, label, config: config || {} }, secret || {});
  } else {
    throw new Error('Unknown provider type');
  }

  if (!instance.isConfigured()) {
    throw new Error('Missing required fields');
  }

  await instance.testConnection();

  const account = accountManager.create(type, label || instance.label, config, secret);
  return { id: account.id, type: account.type, label: account.label };
}

function removeCustomAccount(id) {
  if (builtIns[id]) throw new Error('Built-in accounts cannot be removed');

  const linked = db.getFolders().filter((f) => (f.provider || 'google') === id);
  if (linked.length > 0) {
    const err = new Error('This account still has watched folders linked to it');
    err.code = 'ACCOUNT_IN_USE';
    err.linkedFolders = linked.length;
    throw err;
  }

  accountManager.remove(id);
  return { success: true };
}

async function initializeAll() {
  const results = [];
  for (const provider of Object.values(builtIns)) {
    try {
      const res = await provider.initialize();
      results.push({
        id: provider.id,
        ...res,
        connected: res && res.connected != null ? res.connected : !!(res && res.authenticated)
      });
    } catch (err) {
      results.push({ id: provider.id, connected: false, error: err.message });
    }
  }
  return results;
}

async function logoutAll() {
  for (const provider of Object.values(builtIns)) {
    try { await provider.logout(); } catch (_) {}
  }
  accountManager.clearAll();
}

// Remove every trace of AuraSync from the cloud: trash/delete all AuraSync
// files and folders across all connected cloud accounts so it is as if the app never existed.
async function wipeAllTraces(onProgress = null) {
  let wipedProviders = 0;
  const results = {};

  const wipeOne = async (provider) => {
    if (!provider || !provider.isConnected || !provider.isConnected()) return;
    try {
      if (onProgress) {
        try { onProgress({ name: provider.label || provider.id, current: wipedProviders, total: 0 }); } catch (_) {}
      }

      if (typeof provider.wipeTraces === 'function') {
        const res = await provider.wipeTraces(onProgress);
        wipedProviders++;
        results[provider.id] = res;
        return;
      }

      if (typeof provider.ensureRootBackupFolder === 'function' && typeof provider.trashFile === 'function') {
        const rootId = await provider.ensureRootBackupFolder();
        if (rootId) {
          await provider.trashFile(rootId);
          if (provider.rootFolderId !== undefined) provider.rootFolderId = null;
          if (provider.rootFolderPath !== undefined) provider.rootFolderPath = null;
          if (provider.rootFolderUrl !== undefined) provider.rootFolderUrl = null;
          wipedProviders++;
          results[provider.id] = { success: true };
          return;
        }
      }

      results[provider.id] = { error: 'Provider does not support root wipe' };
    } catch (err) {
      console.warn(`Wipe error for ${provider.id}:`, err.message);
      results[provider.id] = { error: err.message };
    }
  };

  for (const provider of Object.values(builtIns)) {
    await wipeOne(provider);
  }
  for (const raw of accountManager.listRaw()) {
    const instance = accountManager.getInstance(raw.id);
    await wipeOne(instance);
  }
  return { success: true, wipedProviders, results };
}

async function formatProvider(providerId, onProgress = null) {
  if (providerId === 'all') {
    let totalDeleted = 0;
    const results = {};
    for (const provider of Object.values(builtIns)) {
      if (provider.isConnected && provider.isConnected()) {
        try {
          const res = await provider.formatCloud(onProgress);
          totalDeleted += (res.deletedCount || 0);
          results[provider.id] = res;
        } catch (err) {
          console.warn(`Format error for ${provider.id}:`, err.message);
          results[provider.id] = { error: err.message };
        }
      }
    }
    for (const raw of accountManager.listRaw()) {
      const instance = accountManager.getInstance(raw.id);
      if (instance && instance.isConnected && instance.isConnected()) {
        try {
          const res = await instance.formatCloud(onProgress);
          totalDeleted += (res.deletedCount || 0);
          results[raw.id] = res;
        } catch (err) {
          console.warn(`Format error for ${raw.id}:`, err.message);
          results[raw.id] = { error: err.message };
        }
      }
    }
    return { success: true, deletedCount: totalDeleted, results };
  }

  const provider = getProvider(providerId);
  if (!provider) throw new Error('Provider not found: ' + providerId);
  if (!provider.isConnected || !provider.isConnected()) {
    throw new Error('Provider is not connected: ' + (provider.label || providerId));
  }
  if (typeof provider.formatCloud !== 'function') {
    throw new Error('Provider does not support formatting: ' + providerId);
  }
  return await provider.formatCloud(onProgress);
}

module.exports = {
  builtIns,
  providers: builtIns,
  getProvider,
  getStatuses,
  hasAnyConnected,
  getConnectedProviders,
  initAccounts,
  listProviderTypes,
  createCustomAccount,
  removeCustomAccount,
  initializeAll,
  logoutAll,
  formatProvider,
  wipeAllTraces,
  accountManager
};

