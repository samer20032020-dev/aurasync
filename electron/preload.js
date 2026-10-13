const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Hard lock zoom level to 100% (disable Ctrl + / - / wheel zoom)
try {
  webFrame.setZoomLevel(0);
  webFrame.setZoomFactor(1.0);
  webFrame.setVisualZoomLevelLimits(1, 1);
} catch (_) {}

contextBridge.exposeInMainWorld('electronAPI', {
  // OAuth
  getAuthStatus: () => ipcRenderer.invoke('oauth:get-status'),
  startGoogleLogin: () => ipcRenderer.invoke('oauth:start-login'),
  logout: () => ipcRenderer.invoke('oauth:logout'),

  // Cloud providers (Google Drive / OneDrive / Dropbox / WebDAV / S3 ...)
  getProviders: () => ipcRenderer.invoke('providers:get-status'),
  getProviderTypes: () => ipcRenderer.invoke('providers:get-types'),
  setProviderCredentials: (providerId, creds) => ipcRenderer.invoke('providers:set-credentials', providerId, creds),
  addCustomProvider: (payload) => ipcRenderer.invoke('providers:add-custom', payload),
  removeCustomProvider: (accountId) => ipcRenderer.invoke('providers:remove-custom', accountId),
  connectProvider: (providerId) => ipcRenderer.invoke('providers:connect', providerId),
  disconnectProvider: (providerId) => ipcRenderer.invoke('providers:disconnect', providerId),
  listProviderFolder: (providerId, folderId) => ipcRenderer.invoke('providers:list-folder', providerId, folderId),
  getProviderRoot: (providerId) => ipcRenderer.invoke('providers:get-root', providerId),

  // Transfers
  startTransfer: (payload) => ipcRenderer.invoke('transfers:start', payload),
  getTransfers: () => ipcRenderer.invoke('transfers:list'),
  cancelTransfer: (id) => ipcRenderer.invoke('transfers:cancel', id),
  clearTransfers: () => ipcRenderer.invoke('transfers:clear'),

  // Watched Folders
  selectFolderDialog: () => ipcRenderer.invoke('folders:select-dialog'),
  getFolders: () => ipcRenderer.invoke('folders:get-all'),
  addFolder: (folderPath, name, provider, options) => ipcRenderer.invoke('folders:add', folderPath, name, provider, options),
  checkCloudFolderName: (name, provider) => ipcRenderer.invoke('folders:check-cloud-name', name, provider),
  getRemoteCloudFolders: (provider) => ipcRenderer.invoke('cloud:get-remote-folders', provider),
  listRemoteFolderFiles: (providerId, folderId) => ipcRenderer.invoke('cloud:list-remote-folder-files', providerId, folderId),
  downloadRemoteFile: (providerId, fileId, defaultName) => ipcRenderer.invoke('cloud:download-remote-file', providerId, fileId, defaultName),
  selectDownloadDir: (defaultName) => ipcRenderer.invoke('cloud:select-download-dir', defaultName),
  linkRemoteFolder: (providerId, cloudFolderId, folderName, localPath) => ipcRenderer.invoke('cloud:link-remote-folder', providerId, cloudFolderId, folderName, localPath),
  linkAllRemoteFolders: (providerId, baseDir) => ipcRenderer.invoke('cloud:link-all-remote-folders', providerId, baseDir),
  trashRemoteFolder: (providerId, cloudFolderId) => ipcRenderer.invoke('cloud:trash-remote-folder', providerId, cloudFolderId),
  removeFolder: (id) => ipcRenderer.invoke('folders:remove', id),
  togglePauseFolder: (id, isPaused) => ipcRenderer.invoke('folders:toggle-pause', id, isPaused),
  syncFolderNow: (folderId) => ipcRenderer.invoke('folders:sync-now', folderId),
  syncAllNow: () => ipcRenderer.invoke('folders:sync-all-now'),
  reapplyFolderBadge: (folderId) => ipcRenderer.invoke('folders:reapply-badge', folderId),
  setFolderMirrors: (folderId, providers) => ipcRenderer.invoke('folders:set-mirrors', folderId, providers),
  setFolderCleanMode: (folderId, enabled) => ipcRenderer.invoke('folders:set-clean-mode', folderId, enabled),
  setFolderReverse: (folderId, enabled) => ipcRenderer.invoke('folders:set-reverse', folderId, enabled),

  // Tracked Files
  getFiles: (params) => ipcRenderer.invoke('files:get', params),
  getFileTree: (folderId) => ipcRenderer.invoke('files:tree', folderId),
  getFileChildren: (folderId, relativePrefix) => ipcRenderer.invoke('files:children', folderId, relativePrefix),
  retryFile: (filePath) => ipcRenderer.invoke('files:retry', filePath),
  retryAllFailed: (folderId) => ipcRenderer.invoke('files:retry-all', folderId),
  restoreFile: (filePath) => ipcRenderer.invoke('files:restore', filePath),
  restoreFileTo: (filePath) => ipcRenderer.invoke('files:restore-as', filePath),
  deleteFileBoth: (filePath) => ipcRenderer.invoke('files:delete-both', filePath),
  purgeFile: (filePath) => ipcRenderer.invoke('files:purge', filePath),
  purgeAllPreserved: () => ipcRenderer.invoke('files:purge-all'),
  onPurgeProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('files:purge-progress', subscription);
    return () => ipcRenderer.removeListener('files:purge-progress', subscription);
  },

  // Storage
  getStorage: () => ipcRenderer.invoke('storage:get'),

  // Restore points (snapshots)
  listSnapshots: (folderId) => ipcRenderer.invoke('snapshots:list', folderId),
  createSnapshot: (folderId, label) => ipcRenderer.invoke('snapshots:create', folderId, label),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshots:delete', id),
  restoreSnapshot: (id, mode) => ipcRenderer.invoke('snapshots:restore', id, mode),
  onSnapshotProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('snapshot:progress', subscription);
    return () => ipcRenderer.removeListener('snapshot:progress', subscription);
  },

  // Activity Logs
  getLogs: (limit, type) => ipcRenderer.invoke('logs:get', limit, type),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),

  // Stats
  getAppStats: () => ipcRenderer.invoke('app:get-stats'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),

  // System & Settings
  openPath: (fullPath) => ipcRenderer.invoke('system:open-path', fullPath),
  openExternal: (url) => ipcRenderer.invoke('system:open-url', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    const subscription = (event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximized-change', subscription);
    return () => ipcRenderer.removeListener('window:maximized-change', subscription);
  },
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  saveSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  resetApp: () => ipcRenderer.invoke('app:reset'),
  uninstallApp: () => ipcRenderer.invoke('app:uninstall'),
  formatCloud: (providerId = 'all') => ipcRenderer.invoke('cloud:format', { providerId }),
  wipeCloudAll: () => ipcRenderer.invoke('cloud:wipe-all'),
  openExternalUrl: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Vault APIs
  getVaultStatus: () => ipcRenderer.invoke('vault:get-status'),
  setVaultPassword: (password, hint) => ipcRenderer.invoke('vault:set-password', { password, hint }),
  verifyVaultPassword: (password) => ipcRenderer.invoke('vault:verify-password', password),
  unlockVault: (password) => ipcRenderer.invoke('vault:unlock', password),
  lockVault: () => ipcRenderer.invoke('vault:lock'),
  relockVaultTemp: (id) => ipcRenderer.invoke('vault:relock-temp', { id }),
  getVaultTempList: () => ipcRenderer.invoke('vault:get-temp-list'),
  getVaultItems: () => ipcRenderer.invoke('vault:get-items'),
  runVaultAction: (payload) => ipcRenderer.invoke('vault:action', payload),
  restoreVaultItem: (id, password) => ipcRenderer.invoke('vault:restore', { id, password }),
  launchVaultItem: (id, password) => ipcRenderer.invoke('vault:launch-item', { id, password }),
  deleteVaultItem: (id) => ipcRenderer.invoke('vault:delete', { id }),
  getVaultPreview: (id, password) => ipcRenderer.invoke('vault:preview', { id, password }),
  selectVaultFilesDialog: (options) => ipcRenderer.invoke('vault:select-files-dialog', options),
  vaultGetUnlockFileInfo: (filePath) => ipcRenderer.invoke('vault:get-unlock-file-info', filePath),
  vaultUnlockAndLaunch: (filePath, password, launch) => ipcRenderer.invoke('vault:unlock-and-launch', { filePath, password, launch }),
  vaultCloseUnlockDialog: () => ipcRenderer.invoke('vault:close-unlock-dialog'),
  onVaultUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('vault:updated', subscription);
    return () => ipcRenderer.removeListener('vault:updated', subscription);
  },
  onVaultNavigate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('vault:navigate', subscription);
    return () => ipcRenderer.removeListener('vault:navigate', subscription);
  },

  // Browser Vault Guard APIs
  browserGuardGetStatus: () => ipcRenderer.invoke('browser-guard:get-status'),
  browserGuardSetEnabled: (enabled) => ipcRenderer.invoke('browser-guard:set-enabled', enabled),
  browserGuardSetPin: (pin) => ipcRenderer.invoke('browser-guard:set-pin', pin),
  browserGuardSetBrowsers: (browsers) => ipcRenderer.invoke('browser-guard:set-browsers', browsers),
  browserGuardVerifyPin: (pin) => ipcRenderer.invoke('browser-guard:verify-pin', pin),
   browserGuardUnlock: () => ipcRenderer.invoke('browser-guard:unlock'),
  browserGuardMinimize: () => ipcRenderer.invoke('browser-guard:minimize'),
  browserGuardCloseTab: () => ipcRenderer.invoke('browser-guard:close-tab'),
  browserGuardSetGracePeriod: (minutes) => ipcRenderer.invoke('browser-guard:set-grace-period', minutes),
  browserGuardGetLiveTabs: () => ipcRenderer.invoke('browser-guard:get-live-tabs'),
  browserGuardGetLockedTabs: () => ipcRenderer.invoke('browser-guard:get-locked-tabs'),
  browserGuardToggleLockTab: (domain) => ipcRenderer.invoke('browser-guard:toggle-lock-tab', domain),
  browserGuardOpenExtensionFolder: () => ipcRenderer.invoke('browser-guard:open-extension-folder'),
  browserGuardSetGuardMode: (mode) => ipcRenderer.invoke('browser-guard:set-guard-mode', mode),
  browserGuardToggleLockPage: (pageId) => ipcRenderer.invoke('browser-guard:toggle-lock-page', pageId),
  browserGuardGetDetectedPages: () => ipcRenderer.invoke('browser-guard:get-detected-pages'),
  browserGuardClearDetectedPages: () => ipcRenderer.invoke('browser-guard:clear-detected-pages'),
  browserGuardTriggerScan: () => ipcRenderer.invoke('browser-guard:trigger-scan'),
  browserGuardAddCustomLockedPage: (keyword) => ipcRenderer.invoke('browser-guard:add-custom-locked-page', keyword),
  browserGuardGetInstalledBrowsers: () => ipcRenderer.invoke('browser-guard:get-installed-browsers'),
  browserGuardLaunchBrowserExtension: (browserId) => ipcRenderer.invoke('browser-guard:launch-browser-extension', browserId),
  onBrowserGuardPagesUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browser-guard:pages-updated', subscription);
    return () => ipcRenderer.removeListener('browser-guard:pages-updated', subscription);
  },
  onBrowserGuardTabsUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('browser-guard:tabs-updated', subscription);
    return () => ipcRenderer.removeListener('browser-guard:tabs-updated', subscription);
  },
  onBrowserGuardPrepare: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('guard:prepare', subscription);
    return () => ipcRenderer.removeListener('guard:prepare', subscription);
  },

  // Windows Explorer Context Menu APIs
  getContextMenuStatus: () => ipcRenderer.invoke('context-menu:get-status'),
  toggleContextMenu: (enabled) => ipcRenderer.invoke('context-menu:toggle', enabled),

  // Installer
  getInstallerInfo: () => ipcRenderer.invoke('installer:get-info'),
  runInstall: (options) => ipcRenderer.invoke('installer:run', options),
  launchInstalledApp: (installDir) => ipcRenderer.invoke('installer:launch-app', installDir),
  onInstallProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('installer:progress', subscription);
    return () => ipcRenderer.removeListener('installer:progress', subscription);
  },

  // Event Listeners
  onCloudFormatProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('cloud:format-progress', subscription);
    return () => ipcRenderer.removeListener('cloud:format-progress', subscription);
  },
  onCloudWipeProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('cloud:wipe-progress', subscription);
    return () => ipcRenderer.removeListener('cloud:wipe-progress', subscription);
  },
  onNewLog: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('activity:new-log', subscription);
    return () => ipcRenderer.removeListener('activity:new-log', subscription);
  },
  onStatsUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('stats:updated', subscription);
    return () => ipcRenderer.removeListener('stats:updated', subscription);
  },
  onFileSyncing: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('file:syncing', subscription);
    return () => ipcRenderer.removeListener('file:syncing', subscription);
  },
  onFileSynced: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('file:synced', subscription);
    return () => ipcRenderer.removeListener('file:synced', subscription);
  },
  onFileFailed: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('file:failed', subscription);
    return () => ipcRenderer.removeListener('file:failed', subscription);
  },
  onFileProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('file:progress', subscription);
    return () => ipcRenderer.removeListener('file:progress', subscription);
  },
  onQuotaWarning: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('quota:warning', subscription);
    return () => ipcRenderer.removeListener('quota:warning', subscription);
  },
  onFoldersUpdated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('folders:updated', subscription);
    return () => ipcRenderer.removeListener('folders:updated', subscription);
  },
  onTransferProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('transfer:progress', subscription);
    return () => ipcRenderer.removeListener('transfer:progress', subscription);
  },

  // 1-Click GitHub Auto-Updater APIs
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  startUpdateDownload: (downloadUrl) => ipcRenderer.invoke('updater:start-download', downloadUrl),
  onUpdateProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater:progress', subscription);
    return () => ipcRenderer.removeListener('updater:progress', subscription);
  },
  onUpdateAvailable: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('updater:update-available', subscription);
    return () => ipcRenderer.removeListener('updater:update-available', subscription);
  }
});
