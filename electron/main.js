const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Electron patches `fs` so any path containing "app.asar" is treated as a
// virtual archive path — which breaks copying the app's own app.asar while
// installing. Keep the original (unpatched) filesystem implementation.
let originalFs = null;
try { originalFs = require('original-fs'); } catch (_) { originalFs = null; }

const db = require('./database');
const googleDrive = require('./google-drive');
const cloudProviders = require('./cloud-providers');
const providerCredentials = require('./provider-credentials');
const syncEngine = require('./sync-engine');
const transferEngine = require('./transfer-engine');
const snapshots = require('./snapshots');
const folderDecorator = require('./folder-decorator');
const vaultManager = require('./vault-manager');
const contextMenu = require('./context-menu');
const browserGuard = require('./browser-guard');
const updaterEngine = require('./updater-engine');
const disasterRecovery = require('./disaster-recovery');
const { buildUninstallerScript } = require('./uninstaller-script');
const { initTray } = require('./tray');

let mainWindow = null;
let trayManager = null;
let installerBusy = false; // true while files are being copied by the setup
let firstWindowCreated = false;
app.isQuitting = false;

const logStartup = (msg) => {
  // Logs live in the app's private userData folder only — never next to the
  // installed app or inside the project folder.
  try {
    const p = path.join(app.getPath('userData'), 'app-startup.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
};

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  logStartup(`[UNCAUGHT EXCEPTION] ${err && err.stack ? err.stack : err}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  logStartup(`[UNHANDLED REJECTION] ${reason && reason.stack ? reason.stack : reason}`);
});

// Check if running in installer/setup mode.
// The cloud-shaped installer is the portable build renamed to "AuraSync-Setup.exe":
// electron-builder's portable launcher reports the original file in
// PORTABLE_EXECUTABLE_FILE, so its name decides the mode.
const portableExePath = process.env.PORTABLE_EXECUTABLE_FILE || '';
const portableExeName = portableExePath ? path.basename(portableExePath).toLowerCase() : '';
const isSetupMode = process.argv.includes('--setup') ||
                    process.argv.includes('--installer') ||
                    path.basename(process.execPath).toLowerCase().includes('setup') ||
                    path.basename(process.execPath).toLowerCase().includes('install') ||
                    portableExeName.includes('setup') ||
                    portableExeName.includes('install');

// The setup gets its own private data folder so it can run WHILE the main app
// is open (its single-instance lock no longer clashes with the app's — the
// installer closes and updates the running app automatically instead).
if (isSetupMode) {
  try {
    app.setPath('userData', path.join(app.getPath('temp'), 'aurasync-setup'));
  } catch (_) {}
}

// Ensure strict single instance for the main app (installer can run independently)
let gotSetupLock = true;
if (!isSetupMode) {
  const gotTheLock = app.requestSingleInstanceLock();
  logStartup(`[Process ${process.pid}] requestSingleInstanceLock: ${gotTheLock}`);

  if (!gotTheLock) {
    logStartup(`[Process ${process.pid}] Exiting duplicate instance.`);
    try { app.exit(0); } catch (_) {}
    process.exit(0);
  }
} else {
  // The setup itself must also be single-instance: two setups running at once
  // can interfere with each other while copying files.
  gotSetupLock = app.requestSingleInstanceLock();
  logStartup(`[Process ${process.pid}] setup requestSingleInstanceLock: ${gotSetupLock}`);
  if (!gotSetupLock) {
    logStartup(`[Process ${process.pid}] Another AuraSync instance is running — showing notice.`);
    app.whenReady().then(() => {
      try {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'AuraSync',
          message: 'المثبّت مفتوح بالفعل',
          detail: 'يوجد نافذة مثبّت أخرى قيد التشغيل. أغلقها ثم شغّل المثبّت من جديد.',
          buttons: ['حسناً'],
          noLink: true
        });
      } catch (_) {}
      try { app.exit(0); } catch (_) {}
      process.exit(0);
    });
  }
}

function showMainWindow() {
  logStartup(`[Process ${process.pid}] showMainWindow called. mainWindow exists: ${!!mainWindow}`);
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  } catch (err) {
    console.error('Error showing window, recreating:', err.message);
    try {
      createWindow();
    } catch (_) {}
  }
}

app.on('second-instance', (event, commandLine) => {
  logStartup(`[Process ${process.pid}] second-instance event received with commandLine: ${JSON.stringify(commandLine)}`);
  if (isSetupMode) {
    // A second setup instance: nothing to show — this one owns the flow.
    return;
  }
  if (Array.isArray(commandLine) && commandLine.some((arg) => typeof arg === 'string' && (arg.includes('--setup') || arg.includes('--installer')))) {
    registerInstallerIpc();
    createInstallerWindow();
    return;
  }
  // Boot-time (auto-start) launches carry --minimized: they must never pop
  // the window open, even when the app is already running. Windows' session
  // restore may also relaunch us with Chromium flags right after boot — treat
  // those as boot noise too while this process itself started minimized.
  const secondLaunchedMinimized =
    Array.isArray(commandLine) && commandLine.some((arg) => typeof arg === 'string' && arg === '--minimized');
  const startedMinimizedAtBoot = process.argv.includes('--minimized');
  const bootNoise = secondLaunchedMinimized ||
    (startedMinimizedAtBoot &&
      Array.isArray(commandLine) &&
      commandLine.some((arg) => typeof arg === 'string' && arg === '--allow-file-access-from-files'));
  const isAuraUnlock =
    Array.isArray(commandLine) &&
    commandLine.some(
      (arg) =>
        typeof arg === 'string' &&
        (arg.includes('--vault-open') || arg.includes('--vault-restore') || arg.toLowerCase().endsWith('.aura'))
    );
  if (!bootNoise && !isAuraUnlock) {
    showMainWindow();
  }
  handleCliArgs(commandLine);
});

// Repair legacy auto-start entries so boot launches always stay in the tray,
// and consolidate duplicated entries into a single "AuraSync" Run key.
function ensureAutoStartMinimized() {
  if (process.platform !== 'win32') return;
  setTimeout(() => {
    try {
      const { execFileSync } = require('child_process');
      const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

      const readEntry = (name) => {
        try {
          const out = execFileSync('reg', ['query', RUN_KEY, '/v', name], { encoding: 'utf8', windowsHide: true });
          const match = out.match(new RegExp(name + '\\s+REG_SZ\\s+(.+)'));
          return match ? match[1].trim() : null;
        } catch (_) {
          return null;
        }
      };

      const installerEntry = readEntry('AuraSync');
      const electronEntry = readEntry('electron.app.AuraSync');
      if (!installerEntry && !electronEntry) return; // no auto-start at all

      const source = installerEntry || electronEntry;
      const quoted = source.match(/^"([^"]+)"/);
      const exePath = (quoted ? quoted[1] : source.split(' ')[0]).replace(/"/g, '');
      if (!/AuraSync\.exe$/i.test(exePath)) return;

      const desired = `"${exePath}" --minimized`;
      if (installerEntry !== desired) {
        execFileSync('reg', ['add', RUN_KEY, '/v', 'AuraSync', '/t', 'REG_SZ', '/d', desired, '/f'], { windowsHide: true });
        logStartup(`[Process ${process.pid}] Auto-start entry repaired with --minimized.`);
      }

      // Remove the duplicated Electron entry (used to open the window at boot)
      if (electronEntry) {
        try {
          execFileSync('reg', ['delete', RUN_KEY, '/v', 'electron.app.AuraSync', '/f'], { windowsHide: true });
          logStartup(`[Process ${process.pid}] Duplicate auto-start entry removed.`);
        } catch (_) {}
      }
    } catch (err) {
      logStartup(`[Process ${process.pid}] Auto-start repair skipped: ${err.message}`);
    }
  }, 1000);
}

function pickDefaultProviderId() {
  try {
    const statuses = cloudProviders.getStatuses();
    const connected = statuses.find((s) => s.connected);
    if (connected) return connected.id;
    const configured = statuses.find(
      (s) => s.configured !== false && ['google', 'onedrive', 'dropbox'].includes(s.type || s.id)
    );
    if (configured) return configured.id;
  } catch (_) {}
  return 'google';
}

function handleSingleFileQuickSync(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return;

  const fileName = path.basename(resolved);
  const isLnk = path.extname(resolved).toLowerCase() === '.lnk';

  // 1. Check if the file is already inside any registered folder
  const allFolders = db.getFolders();
  let containingFolder = null;
  for (const f of allFolders) {
    if (!f.path) continue;
    const normFolder = path.resolve(f.path) + path.sep;
    if (resolved.startsWith(normFolder)) {
      containingFolder = f;
      break;
    }
  }

  if (containingFolder) {
    // Already in a watched folder! Trigger high-priority sync
    syncEngine.scanAndSyncFolder(containingFolder.id).catch(() => {});
    if (Notification.isSupported()) {
      new Notification({
        title: 'AuraSync — مزامنة فورية',
        body: `الملف «${fileName}» موجود بالفعل داخل المجلد المتزامن «${containingFolder.name}» وجاري تحديثه بالسحابة.`
      }).show();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('activity:new-log', {
        type: 'info',
        message: `مزامنة سريعة: تم تحديث الملف «${fileName}» داخل مجلد «${containingFolder.name}»`,
        timestamp: new Date().toLocaleTimeString()
      });
      mainWindow.webContents.send('stats:updated', db.getAppStats());
    }
    return;
  }

  // 2. The file is outside any watched folder.
  // Ensure the dedicated "AuraSync Quick Files" managed folder exists.
  const userHome = (app && typeof app.getPath === 'function') ? (app.getPath('documents') || os.homedir()) : os.homedir();
  const quickFilesDir = path.join(userHome, 'AuraSync Quick Files');
  if (!fs.existsSync(quickFilesDir)) {
    try {
      fs.mkdirSync(quickFilesDir, { recursive: true });
    } catch (_) {}
  }

  // Ensure this folder is registered in AuraSync
  let quickFolder = db.getFolderByPath(quickFilesDir);
  if (!quickFolder) {
    quickFolder = db.addFolder(quickFilesDir, 'ملفات سريعة (Quick Files)', pickDefaultProviderId());
    folderDecorator.decorateFolder(quickFolder.path);
    syncEngine.watchFolder(quickFolder);
  }

  // 3. Place the file inside AuraSync Quick Files (linkSync with copyFileSync fallback)
  let destPath = path.join(quickFilesDir, fileName);
  if (fs.existsSync(destPath) && path.resolve(destPath) !== resolved) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let counter = 1;
    while (fs.existsSync(path.join(quickFilesDir, `${base}_(${counter})${ext}`))) {
      counter++;
    }
    destPath = path.join(quickFilesDir, `${base}_(${counter})${ext}`);
  }

  if (path.resolve(destPath) !== resolved) {
    try {
      // Try hardlink first (zero extra disk space on same NTFS volume)
      fs.linkSync(resolved, destPath);
    } catch (_) {
      try {
        fs.copyFileSync(resolved, destPath);
      } catch (err) {
        console.error('[QuickSync] Failed to link/copy file:', err.message);
        return;
      }
    }
  }

  // Trigger sync on the Quick Files folder
  syncEngine.scanAndSyncFolder(quickFolder.id).catch(() => {});

  // 4. Shortcut (.lnk) check & informative feedback
  let shortcutTargetDir = null;
  if (isLnk && shell && typeof shell.readShortcutLink === 'function') {
    try {
      const linkInfo = shell.readShortcutLink(resolved);
      if (linkInfo && linkInfo.target) {
        shortcutTargetDir = path.dirname(linkInfo.target);
      }
    } catch (_) {}
  }

  if (isLnk) {
    const detailMsg = shortcutTargetDir
      ? `تمت مزامنة أيقونة الاختصار. مجلد اللعبة الأصلي: ${shortcutTargetDir}`
      : `تمت مزامنة أيقونة الاختصار بنجاح. لمزامنة اللعبة نفسها، يرجى مزامنة مجلد تثبيت اللعبة.`;
    if (Notification.isSupported()) {
      new Notification({
        title: 'AuraSync — مزامنة أيقونة واختصار',
        body: detailMsg
      }).show();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('activity:new-log', {
        type: 'info',
        message: `مزامنة سريعة: تمت إضافة أيقونة الاختصار «${fileName}» إلى مجلد (ملفات سريعة). ${shortcutTargetDir ? `مسار الملف الأصلي: ${shortcutTargetDir}` : ''}`,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  } else {
    if (Notification.isSupported()) {
      new Notification({
        title: 'AuraSync — مزامنة سريعة',
        body: `تمت إضافة «${fileName}» إلى مجلد (ملفات سريعة) وجاري رفعه للسحابة الآن! ☁️`
      }).show();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('activity:new-log', {
        type: 'info',
        message: `مزامنة سريعة: تمت إضافة الملف «${fileName}» إلى مجلد (ملفات سريعة) وجاري رفعه للسحابة`,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stats:updated', db.getAppStats());
    mainWindow.webContents.send('folders:updated');
  }
}

function handleFolderArgs(argv) {
  if (!Array.isArray(argv)) return;
  const appPath = path.resolve(app.getAppPath());
  const cwdPath = path.resolve(process.cwd());

  const candidates = argv.slice(1).filter((arg) => {
    if (!arg || arg.startsWith('-')) return false;
    let resolved;
    try {
      resolved = path.resolve(arg);
    } catch (_) {
      return false;
    }
    // Never treat the app directory itself (e.g. "electron .") as a watched folder
    if (resolved === appPath || resolved === cwdPath) return false;
    if (resolved.startsWith(appPath + path.sep)) return false;
    return fs.existsSync(resolved);
  });

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        const existing = db.getFolderByPath(candidate);
        if (!existing) {
          const folder = db.addFolder(candidate, path.basename(candidate), pickDefaultProviderId());
          folderDecorator.decorateFolder(folder.path);
          syncEngine.watchFolder(folder);
          syncEngine.scanAndSyncFolder(folder.id).catch(() => {});
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('activity:new-log', {
              type: 'info',
              message: `تمت إضافة المجلد عبر نظام Windows: ${folder.name}`,
              timestamp: new Date().toLocaleTimeString()
            });
            mainWindow.webContents.send('stats:updated', db.getAppStats());
            mainWindow.webContents.send('folders:updated');
          }
        }
      } else if (stat.isFile()) {
        handleSingleFileQuickSync(candidate);
      }
    } catch (_) {}
  }
}

const activeUnlockWindows = new Map();

function showUnlockDialog(targetPath, launchAfter = true) {
  if (!targetPath) return;
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'AuraSync — خطأ',
        body: `الملف غير موجود: ${path.basename(resolved)}`
      }).show();
    }
    return;
  }

  if (activeUnlockWindows.has(resolved)) {
    const existing = activeUnlockWindows.get(resolved);
    if (!existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }
    activeUnlockWindows.delete(resolved);
  }

  const unlockWin = new BrowserWindow({
    width: 430,
    height: 520,
    title: 'فك قفل الملف — Aura Vault',
    icon: path.join(__dirname, '..', 'icon.ico'),
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  unlockWin.center();
  unlockWin.loadFile(path.join(__dirname, 'unlock-dialog.html'), {
    query: { path: resolved, launch: launchAfter ? '1' : '0' }
  });

  unlockWin.once('ready-to-show', () => {
    unlockWin.show();
    unlockWin.focus();
  });

  unlockWin.on('closed', () => {
    activeUnlockWindows.delete(resolved);
  });

  activeUnlockWindows.set(resolved, unlockWin);
}

async function handleCliArgs(argv) {
  if (!Array.isArray(argv)) return;

  let vaultMode = null;
  let targetFile = null;
  let openAuraFile = null;
  let restoreAuraFile = null;
  let deleteBothFile = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (typeof arg !== 'string') continue;

    if (arg.startsWith('--vault-open=')) {
      openAuraFile = arg.replace('--vault-open=', '').trim();
    } else if (arg === '--vault-open' && i + 1 < argv.length) {
      openAuraFile = argv[i + 1];
    } else if (arg.startsWith('--vault-restore=')) {
      restoreAuraFile = arg.replace('--vault-restore=', '').trim();
    } else if (arg === '--vault-restore' && i + 1 < argv.length) {
      restoreAuraFile = argv[i + 1];
    } else if (arg === '--delete-both' && i + 1 < argv.length) {
      deleteBothFile = argv[i + 1];
    } else if (arg.startsWith('--delete-both=')) {
      deleteBothFile = arg.replace('--delete-both=', '').trim();
    } else if (arg.toLowerCase().endsWith('.aura') && !arg.startsWith('-')) {
      openAuraFile = arg;
    } else if (arg.startsWith('--vault-action=')) {
      vaultMode = arg.replace('--vault-action=', '').trim();
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        targetFile = argv[i + 1];
      }
    } else if (arg === '--vault-lock' && i + 1 < argv.length) {
      vaultMode = 'lock';
      targetFile = argv[i + 1];
    } else if (arg === '--vault-hide' && i + 1 < argv.length) {
      vaultMode = 'hide';
      targetFile = argv[i + 1];
    } else if (arg === '--vault-lock-hide' && i + 1 < argv.length) {
      vaultMode = 'lock_hide';
      targetFile = argv[i + 1];
    }
  }

  if (openAuraFile) {
    showUnlockDialog(openAuraFile, true);
    return;
  }
  if (restoreAuraFile) {
    showUnlockDialog(restoreAuraFile, false);
    return;
  }
  if (deleteBothFile) {
    try {
      const resolved = path.resolve(deleteBothFile);
      if (fs.existsSync(resolved)) {
        const isDir = fs.statSync(resolved).isDirectory();
        const typeLabel = isDir ? 'المجلد وكافة محتوياته' : 'الملف';
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          title: 'AuraSync — حذف نهائي فوري',
          message: `هل أنت متأكد من حذف ${typeLabel} «${path.basename(resolved)}» نهائياً من جهازك ومن السحابة معاً بنفس اللحظة؟\n\n(هذا الإجراء سيحذف العنصر فورياً من كل مكان مع بقاء باقي ملفاتك ومجلداتك محمية باتجاه واحد)`,
          buttons: ['حذف من الجهاز والسحابة معاً', 'إلغاء'],
          defaultId: 1,
          cancelId: 1
        });
        if (choice === 0) {
          syncEngine.deleteFileBoth(resolved).then(() => {
            if (Notification.isSupported()) {
              new Notification({
                title: 'AuraSync — حذف نهائي ثنائي',
                body: `تم حذف ${typeLabel} «${path.basename(resolved)}» من جهازك ومن السحابة بنجاح.`
              }).show();
            }
          }).catch(() => {});
        }
      }
    } catch (_) {}
    return;
  }

  if (vaultMode && targetFile) {
    try {
      const resolved = path.resolve(targetFile);
      if (fs.existsSync(resolved)) {
        const fileName = path.basename(resolved);
        showMainWindow();

        const hasPass = vaultManager.hasPassword();
        const isUnlocked = vaultManager.isUnlocked();

        if (!hasPass) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('vault:navigate', {
              needSetup: true,
              pendingAction: vaultMode,
              targetPath: resolved,
              fileName
            });
          }
          if (Notification.isSupported()) {
            new Notification({
              title: 'AuraSync — الخزنة السرية',
              body: `يرجى تعيين كلمة مرور الخزنة أولاً لحماية: ${fileName}`
            }).show();
          }
          return;
        }

        if (vaultMode === 'hide') {
          await vaultManager.hideItem(resolved);
          if (Notification.isSupported()) {
            new Notification({
              title: 'AuraSync — الخزنة السرية',
              body: `👁️ تم إخفاء: ${fileName} بنجاح في الخزنة`
            }).show();
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('vault:updated');
            mainWindow.webContents.send('vault:navigate', { activeTab: 'hidden' });
          }
        } else {
          if (isUnlocked) {
            if (vaultMode === 'lock') {
              await vaultManager.lockItem(resolved);
            } else {
              await vaultManager.lockAndHideItem(resolved);
            }
            if (Notification.isSupported()) {
              new Notification({
                title: 'AuraSync — الخزنة السرية',
                body: `🔒 تم حماية وقفل: ${fileName} بنجاح!`
              }).show();
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('vault:updated');
              mainWindow.webContents.send('vault:navigate', {});
            }
          } else {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('vault:navigate', {
                needUnlock: true,
                pendingAction: vaultMode,
                targetPath: resolved,
                fileName
              });
            }
            if (Notification.isSupported()) {
              new Notification({
                title: 'AuraSync — الخزنة السرية',
                body: `أدخل كلمة المرور في البرنامج لإتمام قفل: ${fileName}`
              }).show();
            }
          }
        }
        return;
      }
    } catch (e) {
      console.error('Error handling vault CLI arg:', e);
      if (Notification.isSupported()) {
        new Notification({
          title: 'AuraSync — خطأ في الخزنة',
          body: e.message
        }).show();
      }
      return;
    }
  }

  handleFolderArgs(argv);
}

// Disable multi-touch gesture pinch-zoom
app.commandLine.appendSwitch('disable-pinch');

function createWindow() {
  logStartup(`[Process ${process.pid}] createWindow called.`);
  // Launched at boot → start hidden in the tray (near the clock).
  // Only honored for the very first window of this process.
  const startMinimized = !firstWindowCreated && process.argv.includes('--minimized');
  firstWindowCreated = true;
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'AuraSync',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    hasShadow: true,
    icon: path.join(__dirname, '..', 'icon.png'),
    show: !startMinimized,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      webviewTag: true
    }
  });

  // Permanently lock zoom level to 100% and prevent all zooming (Ctrl +/-/0, mouse wheel, gestures)
  const enforceZoomLock = () => {
    try {
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
      mainWindow.webContents.setZoomLevel(0);
      mainWindow.webContents.setZoomFactor(1.0);
    } catch (_) {}
  };

  enforceZoomLock();
  mainWindow.webContents.on('did-finish-load', enforceZoomLock);
  mainWindow.webContents.on('dom-ready', enforceZoomLock);
  mainWindow.webContents.on('zoom-changed', (event) => {
    if (event && event.preventDefault) event.preventDefault();
    enforceZoomLock();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && (
      input.key === '=' || 
      input.key === '+' || 
      input.key === '-' || 
      input.key === '_' || 
      input.key === '0' ||
      input.code === 'NumpadAdd' ||
      input.code === 'NumpadSubtract' ||
      input.code === 'Numpad0' ||
      input.code === 'Equal' ||
      input.code === 'Minus' ||
      input.code === 'Digit0'
    )) {
      event.preventDefault();
    }
  });

  // Wire up event emitter to send events to renderer
  const sendEvent = (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
    // Rebuilding the tray menu runs a DB query — skip high-frequency progress events
    if (trayManager && channel !== 'file:progress' && channel !== 'transfer:progress') {
      trayManager.updateContextMenu();
    }
  };

  syncEngine.setEventEmitter(sendEvent);
  transferEngine.setEventEmitter((channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  // Capture all renderer console messages and load failures (supports both
  // legacy positional args and the modern single event-object signature)
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (event && typeof event === 'object' && event.message !== undefined && message === undefined) {
      level = event.level;
      message = event.message;
      line = event.lineNumber;
      sourceId = event.sourceId;
    }
    const logLine = `[Renderer Console L${level}]: ${message} (${sourceId}:${line})\n`;
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-debug.log'), logLine);
    } catch (_) {}
  });

  mainWindow.on('focus', () => {
    try {
      if (syncEngine && typeof syncEngine.reverseSyncAll === 'function') {
        syncEngine.reverseSyncAll().catch(() => {});
      }
    } catch (_) {}
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    const logLine = `[Renderer did-fail-load]: ${errorCode} ${errorDescription} URL:${validatedURL}\n`;
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-debug.log'), logLine);
    } catch (_) {}
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const logLine = `[Renderer gone]: ${JSON.stringify(details)}\n`;
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-debug.log'), logLine);
    } catch (_) {}
  });

  const isDev = process.env.NODE_ENV === 'development';
  const prodIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load dev server:', err.message);
    });
  } else {
    mainWindow.loadFile(prodIndex).catch((err) => {
      const logLine = `[loadFile error]: ${err.stack}\n`;
      try {
        fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-debug.log'), logLine);
      } catch (_) {}
    });
  }

  logStartup(`[Process ${process.pid}] Calling mainWindow.show() and focus()...`);
  if (!startMinimized) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    logStartup(`[Process ${process.pid}] Started minimized to tray (--minimized).`);
  }

  // External link handler — only allow safe https pages
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      const minimizeToTray = db.getSetting('minimizeToTray', 'true') === 'true';
      if (minimizeToTray) {
        event.preventDefault();
        mainWindow.hide();
        return false;
      }
    }
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-change', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-change', false);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers Setup
function setupIpcHandlers() {
  ipcMain.handle('app:get-version', () => {
    try {
      return app.getVersion();
    } catch (_) {
      return '1.7.104';
    }
  });

  ipcMain.handle('oauth:get-status', async () => {
    let credentialsExists = fs.existsSync(googleDrive.credentialsPath);
    let tokenExists = fs.existsSync(googleDrive.tokenPath);
    return {
      credentialsFound: credentialsExists,
      credentialsPath: googleDrive.credentialsPath,
      tokenFound: tokenExists,
      authenticated: !!googleDrive.drive,
      user: googleDrive.userInfo,
      storage: googleDrive.getStorageState()
    };
  });

  ipcMain.handle('oauth:start-login', async () => {
    try {
      const result = await googleDrive.startOAuthFlow();
      syncEngine.processQueue();
      syncEngine.scanAllFolders().catch(() => {});
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('oauth:logout', async () => {
    return await googleDrive.logout();
  });

  // Folders Handlers
  ipcMain.handle('folders:select-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Folder for Continuous Cloud Backup',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];
    return {
      path: folderPath,
      name: path.basename(folderPath)
    };
  });

  ipcMain.handle('folders:get-all', async () => {
    return db.getFolders();
  });

  ipcMain.handle('folders:add', async (event, folderPath, folderName, provider = null, options = {}) => {
    try {
      const folder = db.addFolder(folderPath, folderName, provider || pickDefaultProviderId());
      if (options && options.driveFolderId) {
        db.updateFolderDriveId(folder.id, options.driveFolderId);
        folder.drive_folder_id = options.driveFolderId;
      }
      if (options && options.reverseSync) {
        db.setFolderReverseSync(folder.id, 1);
        folder.reverse_sync = 1;
      }
      folderDecorator.decorateFolder(folder.path);
      syncEngine.watchFolder(folder);
      syncEngine.scanAndSyncFolder(folder.id).catch(() => {});
      return { success: true, folder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Check if the cloud already has a folder with this name (cross-device merge offer)
  ipcMain.handle('folders:check-cloud-name', async (event, folderName, provider = null) => {
    return syncEngine.checkCloudFolderName(folderName, provider || pickDefaultProviderId());
  });

  // Multi-Device Smart Cloud Catalog IPCs (Zero local disk usage until linked)
  ipcMain.handle('cloud:get-remote-folders', async (event, provider = null) => {
    return syncEngine.getRemoteCloudFolders(provider);
  });

  ipcMain.handle('cloud:list-remote-folder-files', async (event, providerId, folderId) => {
    return syncEngine.listRemoteFolderFiles(providerId, folderId);
  });

  ipcMain.handle('cloud:download-remote-file', async (event, providerId, fileId, defaultName) => {
    if (!mainWindow) return { success: false, error: 'No main window' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Cloud File to Local Storage',
      defaultPath: defaultName || 'file'
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    return syncEngine.downloadRemoteFile(providerId, fileId, result.filePath);
  });

  ipcMain.handle('cloud:select-download-dir', async (event, defaultName) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select Local Location for "${defaultName || 'Cloud Folder'}"`,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('cloud:link-remote-folder', async (event, providerId, cloudFolderId, folderName, localPath) => {
    try {
      const res = await syncEngine.linkRemoteFolder(providerId, cloudFolderId, folderName, localPath);
      if (res.success && res.folder) {
        folderDecorator.decorateFolder(res.folder.path);
      }
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cloud:link-all-remote-folders', async (event, providerId, baseDir) => {
    try {
      const res = await syncEngine.linkAllRemoteFolders(providerId, baseDir);
      if (res.success && Array.isArray(res.folders)) {
        for (const f of res.folders) {
          if (f && f.path) folderDecorator.decorateFolder(f.path);
        }
      }
      return res;
    } catch (err) {
      return { success: false, error: err.message, count: 0, folders: [] };
    }
  });

  ipcMain.handle('cloud:trash-remote-folder', async (event, providerId, cloudFolderId) => {
    return syncEngine.trashRemoteFolder(providerId, cloudFolderId);
  });

  ipcMain.handle('folders:remove', async (event, folderId) => {
    try {
      const folder = db.getFolderById(folderId);
      if (folder && folder.path) {
        folderDecorator.undecorateFolder(folder.path);
      }
      syncEngine.unwatchFolder(folderId);
      db.removeFolder(folderId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folders:reapply-badge', async (event, folderId) => {
    try {
      const folder = db.getFolderById(folderId);
      if (folder && folder.path) {
        folderDecorator.decorateFolder(folder.path);
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 3-2-1 backups: choose the additional clouds a folder is replicated to
  ipcMain.handle('folders:set-mirrors', async (event, folderId, providers = []) => {
    try {
      const updated = db.setFolderMirrors(folderId, providers);
      const res = await syncEngine.backfillMirrors(folderId);
      syncEngine.emit('folders:updated');
      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true, folder: updated, queued: res.queued || 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Latest-only (projects) mode
  ipcMain.handle('folders:set-clean-mode', async (event, folderId, enabled) => {
    try {
      const folder = db.setFolderCleanMode(folderId, enabled);
      syncEngine.emit('folders:updated');
      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true, folder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Reverse sync (cloud ➜ device)
  ipcMain.handle('folders:set-reverse', async (event, folderId, enabled) => {
    try {
      const folder = db.setFolderReverseSync(folderId, enabled);
      if (enabled) {
        syncEngine.reverseSyncFolder(folderId).catch(() => {});
      }
      syncEngine.emit('folders:updated');
      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true, folder };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folders:toggle-pause', async (event, folderId, isPaused) => {
    try {
      const updated = db.toggleFolderPause(folderId, isPaused);
      if (isPaused) {
        syncEngine.unwatchFolder(folderId);
      } else {
        syncEngine.watchFolder(updated);
        syncEngine.scanAndSyncFolder(folderId).catch(() => {});
      }
      return { success: true, folder: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('folders:sync-now', async (event, folderId) => {
    syncEngine.scanAndSyncFolder(folderId).catch((err) => {
      console.error('Sync now error:', err.message);
    });
    return { queued: true };
  });

  ipcMain.handle('folders:sync-all-now', async () => {
    syncEngine.scanAllFolders().catch((err) => {
      console.error('Sync all error:', err.message);
    });
    try {
      if (typeof syncEngine.reverseSyncAll === 'function') {
        syncEngine.reverseSyncAll().catch(() => {});
      }
    } catch (_) {}
    return { queued: true };
  });

  // Tracked Files Query
  ipcMain.handle('files:get', async (event, params = {}) => {
    return db.getFiles(params);
  });

  // Aggregated tree view (folders as single rows with size + file count)
  ipcMain.handle('files:tree', async (event, folderId = null) => {
    return db.getTopLevelEntries(folderId || null);
  });

  ipcMain.handle('files:children', async (event, folderId, relativePrefix) => {
    return db.getChildEntries(folderId, relativePrefix || '');
  });

  // Retry failed uploads
  ipcMain.handle('files:retry', async (event, filePath) => {
    try {
      const result = await syncEngine.retryFile(filePath);
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:retry-all', async (event, folderId = null) => {
    try {
      return await syncEngine.retryFailed(folderId || null);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Restore a file from Google Drive back to disk
  // Restore to the exact original location (creates missing folders)
  ipcMain.handle('files:restore', async (event, filePath) => {
    try {
      const file = db.getFileByPath(filePath);
      if (!file) return { success: false, error: 'File is not tracked' };
      if (!file.drive_file_id) return { success: false, error: 'No cloud copy available for this file' };
      const restoreResult = await syncEngine.restoreFile(filePath);
      return restoreResult;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Restore into a chosen destination folder (advanced)
  ipcMain.handle('files:restore-as', async (event, filePath) => {
    try {
      const file = db.getFileByPath(filePath);
      if (!file) return { success: false, error: 'File is not tracked' };
      if (!file.drive_file_id) return { success: false, error: 'No cloud copy available for this file' };

      const defaultDir = fs.existsSync(path.dirname(file.local_path))
        ? path.dirname(file.local_path)
        : app.getPath('documents');

      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر مجلد الاسترجاع (Restore destination)',
        defaultPath: defaultDir,
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const restoreResult = await syncEngine.restoreFile(filePath, result.filePaths[0]);
      return restoreResult;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Storage quota
  ipcMain.handle('storage:get', async () => {
    return {
      authenticated: !!googleDrive.drive,
      storage: googleDrive.getStorageState(),
      quotaFull: googleDrive.isQuotaFull()
    };
  });

  // ---------- Cloud providers (Google Drive / OneDrive / ...) ----------

  ipcMain.handle('providers:get-status', async () => {
    return cloudProviders.getStatuses();
  });

  ipcMain.handle('providers:get-types', async () => {
    return cloudProviders.listProviderTypes();
  });

  // One-time activation from inside the app (distributor): stores the OAuth
  // credentials so every user can sign in normally afterwards.
  ipcMain.handle('providers:set-credentials', async (event, providerId, creds = {}) => {
    try {
      if (providerId === 'onedrive') {
        const clientId = String(creds.clientId || '').trim();
        if (!clientId) return { success: false, error: 'Client ID is required' };
        providerCredentials.set('onedrive', {
          client_id: clientId,
          tenant: String(creds.tenant || 'common').trim() || 'common'
        });
        return { success: true };
      }

      if (providerId === 'dropbox') {
        const appKey = String(creds.appKey || '').trim();
        if (!appKey) return { success: false, error: 'App key is required' };
        const entry = { app_key: appKey };
        const appSecret = String(creds.appSecret || '').trim();
        if (appSecret) entry.app_secret = appSecret;
        providerCredentials.set('dropbox', entry);
        return { success: true };
      }

      return { success: false, error: 'Unsupported provider' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('providers:add-custom', async (event, payload = {}) => {
    try {
      const { type, label, config, secret } = payload;
      const account = await cloudProviders.createCustomAccount(type, label, config, secret);
      syncEngine.processQueue();
      return { success: true, account };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('providers:remove-custom', async (event, accountId) => {
    try {
      cloudProviders.removeCustomAccount(accountId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message, code: err.code || null, linkedFolders: err.linkedFolders || 0 };
    }
  });

  ipcMain.handle('providers:connect', async (event, providerId) => {
    try {
      const provider = cloudProviders.getProvider(providerId);
      if (!provider) return { success: false, error: 'Unknown provider' };
      if (typeof provider.startOAuthFlow !== 'function') {
        return { success: false, error: 'This account type does not require a browser login' };
      }
      const result = await provider.startOAuthFlow();
      if (result && result.success && typeof provider.ensureMobileFolder === 'function') {
        provider.ensureMobileFolder().catch(() => {});
      }
      syncEngine.processQueue();
      syncEngine.scanAllFolders().catch(() => {});
      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cloud:ensure-mobile-folder', async (event, providerId = 'google') => {
    try {
      const provider = cloudProviders.getProvider(providerId);
      if (!provider || typeof provider.ensureMobileFolder !== 'function') {
        return { success: false, error: 'Provider does not support mobile folders' };
      }
      const folderId = await provider.ensureMobileFolder();
      return { success: true, folderId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('providers:disconnect', async (event, providerId) => {
    try {
      const provider = cloudProviders.getProvider(providerId);
      if (!provider) return { success: false, error: 'Unknown provider' };
      await provider.logout();
      if (trayManager) trayManager.updateContextMenu();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('providers:list-folder', async (event, providerId, folderId = null) => {
    try {
      const provider = cloudProviders.getProvider(providerId);
      if (!provider) return { success: false, error: 'Unknown provider' };
      const items = await provider.listFolder(folderId);
      return { success: true, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('providers:get-root', async (event, providerId) => {
    try {
      const provider = cloudProviders.getProvider(providerId);
      if (!provider) return { success: false, error: 'Unknown provider' };
      const id = await provider.getRootFolderId();
      return { success: true, id, name: 'AuraSync' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------- Restore points (snapshots) ----------

  const sendSnapshotProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('snapshot:progress', data);
    }
  };

  ipcMain.handle('snapshots:list', async (event, folderId = null) => {
    return snapshots.listSnapshots(folderId || null);
  });

  ipcMain.handle('snapshots:create', async (event, folderId, label = null) => {
    try {
      const snapshot = await snapshots.createSnapshot(folderId, label, sendSnapshotProgress);
      return { success: true, snapshot };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('snapshots:delete', async (event, id) => {
    try {
      await snapshots.deleteSnapshot(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('snapshots:restore', async (event, id, mode = 'cloud') => {
    try {
      let destDir = null;
      if (mode === 'device') {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'اختر مجلد تنزيل نقطة الاستعادة',
          properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }
        destDir = result.filePaths[0];
      }
      const res = await snapshots.restoreSnapshot(id, mode, destDir, sendSnapshotProgress);
      return { success: true, ...res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ---------- Transfers (device <-> cloud, cloud <-> cloud) ----------

  ipcMain.handle('transfers:start', async (event, payload) => {
    try {
      return await transferEngine.start(payload || {});
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('transfers:list', async () => {
    return transferEngine.list();
  });

  ipcMain.handle('transfers:cancel', async (event, id) => {
    return transferEngine.cancel(id);
  });

  ipcMain.handle('transfers:clear', async () => {
    return transferEngine.clearFinished();
  });

  // Activity Logs
  ipcMain.handle('logs:get', async (event, limit, type) => {
    return db.getRecentLogs(limit, type);
  });

  ipcMain.handle('logs:clear', async () => {
    db.clearLogs();
    return { success: true };
  });

  // App Stats
  ipcMain.handle('app:get-stats', async () => {
    return db.getAppStats();
  });

  // Extended metrics for the statistics page
  ipcMain.handle('metrics:get', async () => {
    return db.getMetricsSummary();
  });

  // Remove a preserved (locally deleted) file from the cloud forever
  ipcMain.handle('files:purge', async (event, filePath) => {
    try {
      const file = db.getFileByPath(filePath);
      if (!file) return { success: false, error: 'File is not tracked' };

      const folder = db.getFolderById(file.folder_id);
      const provider = cloudProviders.getProvider(folder ? (folder.provider || 'google') : 'google');
      if (file.drive_file_id && provider && provider.isConnected()) {
        try {
          await provider.trashFile(file.drive_file_id);
        } catch (cloudErr) {
          console.warn('[files:purge] Cloud trash warning:', cloudErr.message);
        }
      }

      for (const mirror of db.getFileMirrors(filePath)) {
        try {
          const mp = cloudProviders.getProvider(mirror.provider);
          if (mp && mp.isConnected() && mirror.drive_file_id) {
            await mp.trashFile(mirror.drive_file_id);
          }
        } catch (_) {}
        db.removeFileMirror(filePath, mirror.provider);
      }

      db.deleteFileRecord(filePath);
      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Remove ALL preserved (locally deleted) files from the cloud forever
  ipcMain.handle('files:purge-all', async (event, options = {}) => {
    try {
      const folderId = (options && typeof options === 'object') ? options.folderId : (typeof options === 'number' ? options : null);
      const list = db.getFiles({
        status: 'preserved_on_drive',
        folderId: folderId || undefined,
        limit: 1000000,
        offset: 0
      }) || [];
      const total = list.length;
      let deleted = 0;
      let failed = 0;
      let done = 0;

      const purgeOne = async (file) => {
        try {
          const folder = db.getFolderById(file.folder_id);
          const provider = cloudProviders.getProvider(folder ? (folder.provider || 'google') : 'google');
          if (file.drive_file_id && provider && provider.isConnected()) {
            try {
              await provider.trashFile(file.drive_file_id);
            } catch (cloudErr) {
              console.warn('[purgeOne] Cloud trash warning:', cloudErr.message);
            }
          }
          for (const mirror of db.getFileMirrors(file.local_path)) {
            try {
              const mp = cloudProviders.getProvider(mirror.provider);
              if (mp && mp.isConnected() && mirror.drive_file_id) {
                await mp.trashFile(mirror.drive_file_id);
              }
            } catch (_) {}
            db.removeFileMirror(file.local_path, mirror.provider);
          }
          db.deleteFileRecord(file.local_path);
          deleted++;
        } catch (err) {
          console.warn('[purgeOne] Error purging file:', file.local_path, err.message);
          failed++;
        } finally {
          done++;
        }
      };

      const CONCURRENCY = 25;
      for (let i = 0; i < list.length; i += CONCURRENCY) {
        await Promise.all(list.slice(i, i + CONCURRENCY).map(purgeOne));
        try {
          const current = list[Math.min(i, list.length - 1)] || {};
          event.sender.send('files:purge-progress', {
            done,
            total,
            name: current.relative_path || current.local_path || ''
          });
        } catch (_) {}
      }

      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true, deleted, failed, total };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Restore ALL preserved files to local disk
  ipcMain.handle('files:restore-all-preserved', async (event, options = {}) => {
    try {
      const folderId = (options && typeof options === 'object') ? options.folderId : (typeof options === 'number' ? options : null);
      const list = db.getFiles({
        status: 'preserved_on_drive',
        folderId: folderId || undefined,
        limit: 1000000,
        offset: 0
      }) || [];
      const total = list.length;
      let restored = 0;
      let failed = 0;
      let done = 0;

      for (const file of list) {
        try {
          if (file.drive_file_id && file.status !== 'cloud_missing') {
            await syncEngine.restoreFile(file.local_path);
            restored++;
          }
        } catch (err) {
          console.warn('[restoreAllPreserved] Error:', file.local_path, err.message);
          failed++;
        } finally {
          done++;
          try {
            event.sender.send('files:restore-progress', {
              done,
              total,
              name: file.relative_path || file.local_path || ''
            });
          } catch (_) {}
        }
      }

      syncEngine.emit('stats:updated', db.getAppStats());
      return { success: true, restored, failed, total };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Permanently delete a specific file from local disk AND cloud simultaneously
  ipcMain.handle('files:delete-both', async (event, filePath) => {
    return syncEngine.deleteFileBoth(filePath);
  });

  // System & Window Handlers
  ipcMain.handle('system:open-path', async (event, fullPath) => {
    if (fullPath && fs.existsSync(fullPath)) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          await shell.openPath(fullPath);
        } else {
          shell.showItemInFolder(fullPath);
        }
        return { success: true };
      } catch (e) {
        shell.showItemInFolder(fullPath);
        return { success: true };
      }
    }
    return { success: false, error: 'Path not found' };
  });

  // Open a trusted external URL in the default browser (allow-listed)
  ipcMain.handle('system:open-url', async (event, targetUrl) => {
    const allowed = [
      /^https:\/\/portal\.azure\.com\//i,
      /^https:\/\/www\.dropbox\.com\/developers/i,
      /^https:\/\/dropbox\.com\//i
    ];
    if (typeof targetUrl === 'string' && allowed.some((re) => re.test(targetUrl))) {
      try {
        await shell.openExternal(targetUrl);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'URL not allowed' };
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.isMaximized() : false;
  });

  // Settings Handlers
  ipcMain.handle('settings:get-all', async () => {
    return db.getAllSettings();
  });

  ipcMain.handle('settings:set', async (event, key, value) => {
    db.setSetting(key, value);
    if (key === 'startOnBoot') {
      // Manage the single consolidated "AuraSync" Run key (with --minimized)
      // so boot launches never show the window and never duplicate entries.
      try {
        const enable = value === 'true' || value === true;
        const { execFileSync } = require('child_process');
        const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
        if (enable) {
          execFileSync('reg', [
            'add', RUN, '/v', 'AuraSync', '/t', 'REG_SZ',
            '/d', `"${process.execPath}" --minimized`, '/f'
          ], { windowsHide: true });
          try {
            execFileSync('reg', ['delete', RUN, '/v', 'electron.app.AuraSync', '/f'], { windowsHide: true });
          } catch (_) {}
        } else {
          try {
            execFileSync('reg', ['delete', RUN, '/v', 'AuraSync', '/f'], { windowsHide: true });
          } catch (_) {}
          try {
            execFileSync('reg', ['delete', RUN, '/v', 'electron.app.AuraSync', '/f'], { windowsHide: true });
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Could not update auto-start entry:', err.message);
      }
    }
    if (key === 'reverseSyncIntervalMin') {
      try { syncEngine.scheduleReverseSync(); } catch (_) {}
    }
    if (key === 'exactCopyMode') {
      try {
        if (syncEngine && typeof syncEngine.rescanAllFolders === 'function') {
          syncEngine.rescanAllFolders();
        }
      } catch (_) {}
    }
    return { success: true };
  });

  // Full reset: unwatch folders, remove Windows badges, wipe local DB, log out
  ipcMain.handle('app:reset', async () => {
    try {
      syncEngine.stopAll();
      const folders = db.getFolders();
      for (const folder of folders) {
        try {
          if (folder.path) folderDecorator.undecorateFolder(folder.path);
        } catch (_) {}
      }
      db.resetAllData();
      await cloudProviders.logoutAll();
      if (trayManager) trayManager.updateContextMenu();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Full removal: uninstall AuraSync completely (app files, shortcuts, registry,
  // right-click menu, auto-start and user data). Triggered by a long-press in
  // Settings so it can never fire from a single accidental click.
  ipcMain.handle('app:uninstall', async () => {
    try {
      const { execFileSync, spawn } = require('child_process');

      // Prefer the real installed folder; fall back to the portable exe.
      let targetDir = null;
      try {
        const out = execFileSync(
          'reg',
          ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AuraSync', '/v', 'InstallLocation'],
          { encoding: 'utf8', windowsHide: true }
        );
        const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/);
        if (match && match[1] && fs.existsSync(match[1].trim())) targetDir = match[1].trim();
      } catch (_) {}

      const exePath = app.getPath('exe');
      const dataDir = app.getPath('userData');
      const script = buildUninstallerScript(targetDir, {
        exePath: targetDir ? null : exePath,
        dataDir
      });

      const batPath = path.join(app.getPath('temp'), `aurasync-full-removal-${Date.now()}.bat`);
      fs.writeFileSync(batPath, script, 'utf8');

      const child = spawn('cmd.exe', ['/c', 'start', '', '/min', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();

      // Give the helper a moment to start, then quit so it can delete the app.
      setTimeout(() => {
        app.isQuitting = true;
        app.quit();
      }, 700);

      return { success: true, targetDir, portable: !targetDir };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Format / wipe cloud storage (delete all cloud backup files, folders, and trash down to 0 GB)
  ipcMain.handle('cloud:format', async (event, { providerId = 'all' } = {}) => {
    try {
      const onProgress = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cloud:format-progress', data);
        }
      };

      const result = await cloudProviders.formatProvider(providerId, onProgress);
      syncEngine.handleCloudFormatted(providerId);

      if (trayManager) trayManager.updateContextMenu();
      return { success: true, ...result };
    } catch (err) {
      console.error('Format cloud error:', err);
      return { success: false, error: err.message };
    }
  });

  // Remove every trace of AuraSync from the cloud (trash the whole AuraSync folder)
  ipcMain.handle('cloud:wipe-all', async () => {
    try {
      const onProgress = (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cloud:wipe-progress', data);
        }
      };
      const result = await cloudProviders.wipeAllTraces(onProgress);
      syncEngine.handleCloudFormatted('all');
      if (trayManager) trayManager.updateContextMenu();
      return { success: true, ...result };
    } catch (err) {
      console.error('Wipe cloud error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('app:quit', () => {
    app.isQuitting = true;
    app.quit();
  });

  // Open an https URL in the default browser (used by the in-app cloud browser)
  ipcMain.handle('shell:open-external', async (event, targetUrl) => {
    try {
      if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
        const { shell } = require('electron');
        await shell.openExternal(targetUrl);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ==========================================
  // VAULT & CONTEXT MENU IPC HANDLERS
  // ==========================================
  ipcMain.handle('vault:get-status', async () => {
    return vaultManager.getStatus();
  });

  ipcMain.handle('vault:set-password', async (event, { password, hint }) => {
    return vaultManager.setPassword(password, hint);
  });

  ipcMain.handle('vault:verify-password', async (event, password) => {
    return vaultManager.verifyPassword(password);
  });

  ipcMain.handle('vault:unlock', async (event, password) => {
    return vaultManager.unlockVault(password);
  });

  ipcMain.handle('vault:lock', async () => {
    // Re-encrypt any temporarily-opened folders so they lock again automatically.
    await vaultManager.relockAllTempEntries().catch(() => {});
    return vaultManager.lockVault();
  });

  ipcMain.handle('vault:relock-temp', async (event, { id }) => {
    const res = await vaultManager.relockTempFolderById(id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return res;
  });

  ipcMain.handle('vault:get-temp-list', async () => {
    return vaultManager.getTempOpenList();
  });

  ipcMain.handle('vault:get-items', async () => {
    return vaultManager.getItems();
  });

  ipcMain.handle('vault:action', async (event, { mode, filePath, password }) => {
    let res;
    if (mode === 'lock') {
      res = await vaultManager.lockItem(filePath, password);
    } else if (mode === 'hide') {
      res = await vaultManager.hideItem(filePath);
    } else if (mode === 'lock_hide') {
      res = await vaultManager.lockAndHideItem(filePath, password);
    } else {
      throw new Error('وضع غير معروف: ' + mode);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return { success: true, item: res };
  });

  ipcMain.handle('vault:restore', async (event, { id, password }) => {
    const res = await vaultManager.restoreItem(id, password);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return res;
  });

  ipcMain.handle('vault:launch-item', async (event, { id, password }) => {
    const item = db.getVaultItemById(id);
    if (!item) throw new Error('العنصر غير موجود');
    // Already temporarily open → just reveal it, never double-decrypt.
    if (vaultManager.isTempOpen(id)) {
      const entry = vaultManager.getTempOpenList().find((e) => String(e.itemId) === String(id));
      if (entry && fs.existsSync(entry.originalPath)) {
        shell.openPath(entry.originalPath);
        return { success: true, restoredPath: entry.originalPath, tempOpen: true };
      }
    }
    const res = await vaultManager.restoreItem(id, password);
    if (res && res.restoredPath && fs.existsSync(res.restoredPath)) {
      shell.openPath(res.restoredPath);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return { success: true, restoredPath: res.restoredPath, isFolder: res.isFolder };
  });

  ipcMain.handle('vault:get-unlock-file-info', async (event, filePath) => {
    return vaultManager.getUnlockFileInfo(filePath);
  });

  ipcMain.handle('vault:unlock-and-launch', async (event, { filePath, password, launch }) => {
    const res = await vaultManager.unlockAndLaunch(filePath, password, launch !== false);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return res;
  });

  ipcMain.handle('vault:close-unlock-dialog', (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin && !senderWin.isDestroyed()) {
      senderWin.close();
    }
    return { success: true };
  });

  ipcMain.handle('vault:delete', async (event, { id }) => {
    const res = vaultManager.deleteItem(id);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vault:updated');
    }
    return res;
  });

  ipcMain.handle('vault:preview', async (event, { id, password }) => {
    return vaultManager.getPreviewData(id, password);
  });

  ipcMain.handle('vault:select-files-dialog', async (event, options = {}) => {
    let properties;
    if (options.foldersOnly) {
      properties = ['openDirectory', 'multiSelections'];
    } else if (options.allowFolders) {
      properties = ['openFile', 'openDirectory', 'multiSelections'];
    } else {
      properties = ['openFile', 'multiSelections'];
    }
    const res = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'اختر ملفات لحمايتها في الخزنة',
      properties,
      buttonLabel: 'اختيار'
    });
    return res.filePaths || [];
  });

  ipcMain.handle('context-menu:get-status', async () => {
    return contextMenu.getStatus();
  });

  ipcMain.handle('context-menu:toggle', async (event, enabled) => {
    return contextMenu.setEnabled(enabled);
  });

  // ==========================================
  // BROWSER VAULT GUARD IPC HANDLERS
  // ==========================================
  ipcMain.handle('browser-guard:get-status', async () => {
    return browserGuard.getStatus();
  });

  ipcMain.handle('browser-guard:set-enabled', async (event, enabled) => {
    return browserGuard.setEnabled(enabled);
  });

  ipcMain.handle('browser-guard:set-pin', async (event, pin) => {
    return browserGuard.setPin(pin);
  });

  ipcMain.handle('browser-guard:set-browsers', async (event, browsers) => {
    return browserGuard.setProtectedBrowsers(browsers);
  });

  ipcMain.handle('browser-guard:verify-pin', async (event, pin) => {
    return browserGuard.verifyPinDetailed(pin);
  });

  ipcMain.handle('browser-guard:unlock', async () => {
    browserGuard.unlockCurrentBrowser();
    return { success: true };
  });

  ipcMain.handle('browser-guard:minimize', async () => {
    browserGuard.minimizeProtectedBrowser();
    return { success: true };
  });

  ipcMain.handle('browser-guard:close-tab', async () => {
    browserGuard.closeCurrentLockedTab();
    return { success: true };
  });

  ipcMain.handle('browser-guard:set-grace-period', async (event, minutes) => {
    return browserGuard.setGracePeriodMinutes(minutes);
  });

  ipcMain.handle('browser-guard:get-live-tabs', async () => {
    return browserGuard.getLiveTabs();
  });

  ipcMain.handle('browser-guard:get-locked-tabs', async () => {
    return browserGuard.getLockedTabs();
  });

  ipcMain.handle('browser-guard:toggle-lock-tab', async (event, domain) => {
    return browserGuard.toggleLockTab(domain);
  });

  ipcMain.handle('browser-guard:open-extension-folder', async () => {
    return browserGuard.openExtensionFolder();
  });

  ipcMain.handle('browser-guard:set-guard-mode', async (event, mode) => {
    return browserGuard.setGuardMode(mode);
  });

  ipcMain.handle('browser-guard:toggle-lock-page', async (event, pageId) => {
    return browserGuard.toggleLockPage(pageId);
  });

  ipcMain.handle('browser-guard:get-detected-pages', async () => {
    return browserGuard.getDetectedPages();
  });

  ipcMain.handle('browser-guard:clear-detected-pages', async () => {
    return browserGuard.clearDetectedPages();
  });

  ipcMain.handle('browser-guard:trigger-scan', async () => {
    return browserGuard.triggerScan();
  });

  ipcMain.handle('browser-guard:add-custom-locked-page', async (event, keyword) => {
    return browserGuard.addCustomLockedPage(keyword);
  });

  ipcMain.handle('browser-guard:get-installed-browsers', async () => {
    return browserGuard.getInstalledBrowsers();
  });

  ipcMain.handle('browser-guard:launch-browser-extension', async (event, browserId) => {
    return browserGuard.launchBrowserWithExtension(browserId);
  });

  // 1-Click GitHub Auto-Updater Handlers
  ipcMain.handle('updater:check', async () => {
    return await updaterEngine.checkForUpdates();
  });

  ipcMain.handle('updater:start-download', async (event, downloadUrl) => {
    return await updaterEngine.downloadAndInstall(downloadUrl, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', progress);
      }
    });
  });

  // 1-Click Disaster Recovery & PC Migration Handlers
  disasterRecovery.setSyncEngine(syncEngine);

  ipcMain.handle('disaster-recovery:scan', async (event, providerId = null) => {
    return await disasterRecovery.scanBackups(providerId);
  });

  ipcMain.handle('disaster-recovery:start', async (event, plan, options = {}) => {
    return await disasterRecovery.startRecovery(plan, options, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('disaster-recovery:progress', progress);
      }
    });
  });

  ipcMain.handle('disaster-recovery:cancel', async () => {
    disasterRecovery.cancelRecovery();
    return { success: true };
  });

  ipcMain.handle('disaster-recovery:select-path', async (event, folderName, currentPath) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select Local Location for "${folderName || 'Restored Folder'}"`,
      defaultPath: currentPath || undefined,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

function registerInstallerIpc() {
  // Idempotent registration: some channels (folders:select-dialog, window:*)
  // may already exist when the main app registered its handlers first.
  const register = (channel, handler) => {
    try { ipcMain.removeHandler(channel); } catch (_) {}
    ipcMain.handle(channel, handler);
  };

  register('installer:get-info', async () => {
    const defaultDir = path.join(
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
      'Programs',
      'AuraSync'
    );

    // Smart update: if AuraSync is already installed, default to THAT location
    // so running the new setup updates the existing installation in place.
    let installDir = defaultDir;
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AuraSync', '/v', 'InstallLocation'],
        { encoding: 'utf8', windowsHide: true }
      );
      const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/);
      if (match && match[1]) {
        const registered = match[1].trim();
        if (fs.existsSync(path.join(registered, 'AuraSync.exe'))) {
          installDir = registered;
        }
      }
    } catch (_) {}

    return {
      defaultInstallDir: installDir,
      appVersion: app.getVersion(),
      isAutoUpdate: process.argv.includes('--auto-update')
    };
  });

  register('folders:select-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر مجلد التثبيت',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });

  register('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  register('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  register('installer:run', async (event, options) => {
    installerBusy = true;
    try {
    const copyFs = (originalFs && originalFs.promises) ? originalFs.promises : fs.promises;
    const {
      installDir,
      createDesktopShortcut = true,
      createStartMenuShortcut = true,
      autoStart = true
    } = options || {};

    const targetDir = installDir || path.join(
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'),
      'Programs',
      'AuraSync'
    );

    const sendProgress = (percent, status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('installer:progress', { percent, status });
      }
    };

    sendProgress(6, 'جاري تحضير مجلد التثبيت...');
    await copyFs.mkdir(targetDir, { recursive: true });

    // Smart update: close a running AuraSync from targetDir only if it is actually running
    // (locked for writing), ensuring the installer's own renderer and window are NEVER terminated.
    try {
      const targetExe = path.join(targetDir, 'AuraSync.exe');
      let isOldInstanceRunning = false;

      if (fs.existsSync(targetExe)) {
        try {
          const handle = await copyFs.open(targetExe, 'r+');
          await handle.close();
        } catch (openErr) {
          if (openErr.code === 'EBUSY' || openErr.code === 'EPERM') {
            isOldInstanceRunning = true;
          }
        }
      }

      // Safe instance counter for regression check
      const countInstances = async () => isOldInstanceRunning ? 1 : 0;

      if (isOldInstanceRunning) {
        sendProgress(7, 'جاري إغلاق النسخة القديمة لتحديثها...');
        const { execFile } = require('child_process');
        const targetExeNorm = path.normalize(targetExe).toLowerCase();
        await new Promise((resolve) => {
          execFile(
            'powershell',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Get-Process -Name AuraSync -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.ToLower() -eq '${targetExeNorm.replace(/'/g, "''")}' } | Stop-Process -Force -ErrorAction SilentlyContinue; exit 0`
            ],
            { windowsHide: true },
            () => resolve()
          );
        });

        // Wait up to 3 seconds for the file handle to be released
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 200));
          try {
            const h = await copyFs.open(targetExe, 'r+');
            await h.close();
            break;
          } catch (_) {}
        }
      }
    } catch (_) {}

    let sourceDir = null;
    const candidates = [
      path.join(__dirname, '..', 'release', 'win-unpacked'),
      path.resolve(app.getAppPath(), '..'),
      path.join(process.resourcesPath, '..'),
      path.join(__dirname, '..')
    ];

    for (const c of candidates) {
      try {
        if (fs.existsSync(path.join(c, 'AuraSync.exe')) && path.resolve(c) !== path.resolve(targetDir)) {
          sourceDir = c;
          break;
        }
      } catch (_) {}
    }

    if (!sourceDir) {
      sourceDir = path.join(__dirname, '..', 'release', 'win-unpacked');
    }

    const dirExists = async (p) => {
      try { await copyFs.access(p); return true; } catch (_) { return false; }
    };

    if (!(await dirExists(sourceDir))) {
      sendProgress(100, 'فشل التثبيت: لم يتم العثور على ملفات البرنامج.');
      return { success: false, error: 'Installation source files were not found', installDir: targetDir };
    }

    // 1) Measure the payload so the progress bar reflects reality
    sendProgress(8, 'جاري فحص ملفات البرنامج...');
    let totalBytes = 0;
    {
      const stack = [sourceDir];
      while (stack.length > 0) {
        const dir = stack.pop();
        let entries = [];
        try { entries = await copyFs.readdir(dir, { withFileTypes: true }); } catch (_) { continue; }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
          } else if (entry.isFile()) {
            try { totalBytes += (await copyFs.stat(full)).size; } catch (_) {}
          }
        }
        await new Promise((r) => setImmediate(r)); // keep the window responsive
      }
    }

    // 2) Asynchronous copy with live progress — never blocks the UI thread
    let copyError = null;
    let copiedAnyFile = false;
    let copiedBytes = 0;
    let lastReport = 0;

    const reportCopy = (force = false) => {
      const ratio = totalBytes > 0 ? Math.min(1, copiedBytes / totalBytes) : 0.5;
      const percent = Math.round(10 + ratio * 75);
      const now = Date.now();
      if (force || now - lastReport > 150) {
        lastReport = now;
        sendProgress(percent, 'جاري نسخ ملفات البرنامج...');
      }
    };

    // Install diagnostics log (helps diagnosing copy problems on any machine)
    const installLogPath = path.join(app.getPath('temp'), 'aurasync-install.log');
    const logInstall = (msg) => {
      try { fs.appendFileSync(installLogPath, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
    };
    logInstall(`install start: source=${sourceDir} target=${targetDir}`);
    try {
      logInstall(`source resources dir: ${JSON.stringify(fs.readdirSync(path.join(sourceDir, 'resources')))}`);
    } catch (e) {
      logInstall(`cannot list source resources: ${e.message}`);
    }

    // Chunked copy with the destination handle held open — resistant to
    // antivirus scanners that lock files during the initial write.
    const copyChunked = async (s, d) => {
      const srcHandle = await copyFs.open(s, 'r');
      let dstHandle = null;
      try {
        dstHandle = await copyFs.open(d, 'w');
        const buf = Buffer.alloc(8 * 1024 * 1024);
        let pos = 0;
        for (;;) {
          const { bytesRead } = await srcHandle.read(buf, 0, buf.length, pos);
          if (bytesRead <= 0) break;
          let written = 0;
          while (written < bytesRead) {
            const { bytesWritten } = await dstHandle.write(buf, written, bytesRead - written, pos + written);
            written += bytesWritten;
          }
          pos += bytesRead;
        }
      } finally {
        if (dstHandle) { try { await dstHandle.close(); } catch (_) {} }
        try { await srcHandle.close(); } catch (_) {}
      }
    };

    // Robust single-file copy: antivirus scanners can briefly lock freshly
    // created files, so retry with three different APIs before giving up.
    const copyFileRobust = async (s, d) => {
      let lastError = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await copyFs.copyFile(s, d);
          return;
        } catch (err) {
          lastError = err;
          logInstall(`copyFile failed (${err.code}) attempt ${attempt + 1}: ${s}`);
        }
        try {
          const data = await copyFs.readFile(s);
          await copyFs.writeFile(d, data);
          return;
        } catch (err) {
          lastError = err;
          logInstall(`read/write failed (${err.code}) attempt ${attempt + 1}: ${s}`);
        }
        try {
          await copyChunked(s, d);
          return;
        } catch (err) {
          lastError = err;
          logInstall(`chunked failed (${err.code}) attempt ${attempt + 1}: ${s}`);
        }
        await new Promise((r) => setTimeout(r, 700 + attempt * 400));
      }
      throw lastError || new Error('Copy failed');
    };

    {
      const stack = [[sourceDir, targetDir]];
      while (stack.length > 0) {
        const [src, dest] = stack.pop();
        try { await copyFs.mkdir(dest, { recursive: true }); } catch (_) {}
        let entries = [];
        try { entries = await copyFs.readdir(src, { withFileTypes: true }); } catch (_) { continue; }
        for (const entry of entries) {
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            stack.push([s, d]);
          } else if (entry.isFile()) {
            let copiedSize = 0;
            try { copiedSize = (await copyFs.stat(s)).size; } catch (_) {}

            // Smart Delta Update Check:
            // Static Electron runtime assets (ffmpeg.dll, icudtl.dat, *.pak, etc.)
            // that already exist at destination with matching size do not need to be re-written to disk.
            const isCoreDynamic = entry.name.toLowerCase() === 'app.asar' || entry.name.toLowerCase() === 'aurasync.exe';
            let canSkipCopy = false;
            if (!isCoreDynamic) {
              try {
                const dstStat = await copyFs.stat(d);
                if (dstStat.isFile() && dstStat.size === copiedSize) {
                  canSkipCopy = true;
                }
              } catch (_) {}
            }

            if (!canSkipCopy) {
              if (copiedSize > 50 * 1024 * 1024) {
                logInstall(`copying big file: ${s} (${Math.round(copiedSize / 1048576)}MB)`);
              }
              try {
                await copyFileRobust(s, d);
              } catch (copyErr) {
                copyError = copyErr.message;
                logInstall(`GAVE UP on ${s}: ${copyErr.code || ''} ${copyErr.message}`);
                continue;
              }
            }
            copiedAnyFile = true;
            copiedBytes += copiedSize;
            reportCopy();
          }
        }
        await new Promise((r) => setImmediate(r));
      }
    }

    if (!copiedAnyFile) {
      sendProgress(100, 'فشل التثبيت: لم يتم نسخ ملفات البرنامج.');
      return { success: false, error: copyError || 'Copy failed', installDir: targetDir };
    }

    // Verify the application payload really arrived — a missing app.asar means
    // a silently broken install that cannot start.
    if (!(await dirExists(path.join(targetDir, 'resources', 'app.asar')))) {
      logInstall(`VERIFY FAILED: app.asar missing. copyError=${copyError || 'none'}`);
      sendProgress(100, 'فشل التثبيت: تعذّر نسخ ملفات البرنامج الأساسية.');
      const detail = copyError ? ` — ${copyError}` : '';
      return { success: false, error: `resources/app.asar could not be copied${detail}`, installDir: targetDir };
    }
    logInstall('install ok');

    reportCopy(true);
    sendProgress(86, 'جاري إعداد الاختصارات وتسجيل البرنامج...');

    const iconPath = path.join(targetDir, 'icon.ico');
    const exePath = path.join(targetDir, 'AuraSync.exe');

    // Generate a complete standalone uninstaller next to the installed app.
    // It re-launches itself from %TEMP% so it can delete the whole install
    // folder (including itself) and the Desktop shortcut cleanly.
    const uninstallBat = path.join(targetDir, 'Uninstall AuraSync.bat');
    try {
      fs.writeFileSync(uninstallBat, buildUninstallerScript(targetDir), 'utf8');
    } catch (uninstallErr) {
      console.warn('Could not write uninstaller:', uninstallErr.message);
    }

    try {
      const iconTarget = fs.existsSync(iconPath) ? iconPath : exePath;
      const shortcutDetails = {
        target: exePath,
        cwd: targetDir,
        icon: iconTarget,
        iconIndex: 0,
        description: 'AuraSync - Cloud Backup & Sync'
      };

      // 1. Gather all potential Desktop targets (current user, OneDrive redirection, and localized desktop)
      const desktopTargets = new Set();
      if (createDesktopShortcut) {
        try {
          const appDesktop = app.getPath('desktop');
          if (appDesktop) desktopTargets.add(path.normalize(appDesktop));
        } catch (_) {}
        if (process.env.USERPROFILE) {
          const upDesktop = path.join(process.env.USERPROFILE, 'Desktop');
          if (fs.existsSync(upDesktop)) desktopTargets.add(path.normalize(upDesktop));
        }
        if (process.env.OneDrive) {
          const odDesktop = path.join(process.env.OneDrive, 'Desktop');
          if (fs.existsSync(odDesktop)) desktopTargets.add(path.normalize(odDesktop));
        }
        if (process.env.ONEDRIVECOMMERCIAL) {
          const odcDesktop = path.join(process.env.ONEDRIVECOMMERCIAL, 'Desktop');
          if (fs.existsSync(odcDesktop)) desktopTargets.add(path.normalize(odcDesktop));
        }
        if (desktopTargets.size === 0) {
          try { desktopTargets.add(path.normalize(app.getPath('desktop'))); } catch (_) {}
        }
      }

      // 2. Gather Start Menu targets
      const startMenuTargets = new Set();
      if (createStartMenuShortcut) {
        try {
          const smDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
          if (!fs.existsSync(smDir)) fs.mkdirSync(smDir, { recursive: true });
          startMenuTargets.add(path.normalize(smDir));
        } catch (_) {}
      }

      // 3. Gather SendTo targets
      const sendToTargets = new Set();
      try {
        const sendToDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo');
        if (!fs.existsSync(sendToDir)) fs.mkdirSync(sendToDir, { recursive: true });
        sendToTargets.add(path.normalize(sendToDir));
      } catch (_) {}

      // Robust shortcut creator: tries native 'create' first, then verifies file existence on disk,
      // and falls back to PowerShell WScript.Shell CreateShortcut for AuraSync.lnk if needed.
      const { execFile } = require('child_process');
      const createShortcutRobust = async (destFolder, description = 'AuraSync - Cloud Backup & Sync') => {
        try {
          if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
          const shortcutPath = path.join(destFolder, 'AuraSync.lnk');
          const details = {
            target: exePath,
            cwd: targetDir,
            icon: iconTarget,
            iconIndex: 0,
            description
          };
          let created = false;
          try {
            // Use 'create' (which creates or overwrites), never 'replace' (which silently fails if missing)
            created = shell.writeShortcutLink(shortcutPath, 'create', details);
          } catch (_) {
            created = false;
          }

          if (!created || !fs.existsSync(shortcutPath)) {
            // PowerShell WScript.Shell CreateShortcut for AuraSync.lnk
            const iconParam = fs.existsSync(iconTarget) ? `$s.IconLocation = '${iconTarget.replace(/'/g, "''")},0';` : '';
            const psScript = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); $s.TargetPath = '${exePath.replace(/'/g, "''")}'; $s.WorkingDirectory = '${targetDir.replace(/'/g, "''")}'; ${iconParam} $s.Description = '${description.replace(/'/g, "''")}'; $s.Save();`;
            await new Promise((resolve) => {
              execFile(
                'powershell',
                ['-NoProfile', '-NonInteractive', '-Command', psScript],
                { windowsHide: true },
                () => resolve()
              );
            });
          }
          logInstall(`Shortcut status: ${shortcutPath} exists=${fs.existsSync(shortcutPath)}`);
        } catch (err) {
          logInstall(`Shortcut creation warning for ${destFolder}: ${err.message}`);
        }
      };

      for (const d of desktopTargets) {
        await createShortcutRobust(d, 'AuraSync - Cloud Backup & Sync');
      }
      for (const s of startMenuTargets) {
        await createShortcutRobust(s, 'AuraSync - Cloud Backup & Sync');
      }
      for (const st of sendToTargets) {
        await createShortcutRobust(st, 'AuraSync - add this folder to cloud backup');
      }

      // Ultra-fast native registry registration via reg.exe (runs in ~10ms without PowerShell/AMSI overhead)
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AuraSync';
      const regOps = [
        ['reg', ['add', regKey, '/v', 'DisplayName', '/d', 'AuraSync', '/f']],
        ['reg', ['add', regKey, '/v', 'DisplayVersion', '/d', String(app.getVersion()), '/f']],
        ['reg', ['add', regKey, '/v', 'Publisher', '/d', 'AuraSync Team', '/f']],
        ['reg', ['add', regKey, '/v', 'DisplayIcon', '/d', iconTarget, '/f']],
        ['reg', ['add', regKey, '/v', 'InstallLocation', '/d', targetDir, '/f']],
        ['reg', ['add', regKey, '/v', 'UninstallString', '/d', `"${uninstallBat}"`, '/f']]
      ];

      if (autoStart) {
        regOps.push([
          'reg',
          ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'AuraSync', '/d', `"${exePath}" --minimized`, '/f']
        ]);
      }

      await Promise.all(
        regOps.map(([cmd, args]) => new Promise((resolve) => {
          execFile(cmd, args, { windowsHide: true }, (err) => {
            if (err) logInstall(`reg add notice: ${err.message}`);
            resolve();
          });
        }))
      );

      // Force Windows Explorer to flush shell & desktop icon caches immediately
      try {
        const notifyScript = `
          $code = @'
          using System;
          using System.Runtime.InteropServices;
          public class ShellNotify {
            [DllImport("shell32.dll")]
            public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
          }
          '@
          Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
          [ShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
        `;
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', notifyScript], { windowsHide: true }, () => {});
      } catch (_) {}
    } catch (shortcutErr) {
      console.error('Error creating shortcuts/registry:', shortcutErr);
    }

    sendProgress(95, 'جاري الانتهاء من التثبيت وتفعيل الحماية...');
    await new Promise((r) => setTimeout(r, 400));
    sendProgress(100, 'اكتمل التثبيت بنجاح!');

    return { success: true, installDir: targetDir };
    } finally {
      installerBusy = false;
    }
  });

  register('installer:launch-app', async (event, targetDir) => {
    const exe = path.join(targetDir || app.getPath('userData'), 'AuraSync.exe');
    if (fs.existsSync(exe)) {
      const { spawn } = require('child_process');
      // Never leak the portable-setup environment to the installed app
      const env = { ...process.env };
      delete env.PORTABLE_EXECUTABLE_FILE;
      delete env.PORTABLE_EXECUTABLE_DIR;
      delete env.PORTABLE_EXECUTABLE_APP_FILENAME;
      const child = spawn(exe, [], { detached: true, stdio: 'ignore', env });
      child.unref();
    }
    app.quit();
    return { success: true };
  });
}

function createInstallerWindow() {
  logStartup(`[Process ${process.pid}] Creating Cloud-Shaped Installer Window...`);
  mainWindow = new BrowserWindow({
    width: 620,
    height: 420,
    title: 'AuraSync Setup',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    icon: path.join(__dirname, '..', 'icon.png'),
    show: true,
    center: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  const prodIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173#installer');
  } else {
    mainWindow.loadFile(prodIndex, { hash: 'installer' }).catch((err) => {
      const logLine = `[loadFile installer error]: ${err.stack}\n`;
      try {
        fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-debug.log'), logLine);
      } catch (_) {}
    });
  }

  mainWindow.show();
  mainWindow.focus();

  // Never allow the setup window to be closed while files are being copied —
  // aborting mid-copy leaves a broken (half-installed) app behind.
  mainWindow.on('close', (event) => {
    if (installerBusy && !app.isQuitting) {
      event.preventDefault();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

app.whenReady().then(async () => {
  logStartup(`[Process ${process.pid}] app.whenReady fired. isSetupMode: ${isSetupMode}`);

  if (isSetupMode) {
    if (!gotSetupLock) return;
    registerInstallerIpc();
    createInstallerWindow();
    return;
  }

  // 1. Setup IPC handlers first so any renderer requests are immediately answered
  try {
    setupIpcHandlers();
  } catch (e) {
    console.error('IPC setup error:', e.message);
  }

  // 2. Init database (fast sql.js initialization, ~70ms)
  try {
    await db.initDatabase();
  } catch (e) {
    console.error('Database init error:', e.message);
  }

  // 2.5 Reconcile any temporarily-opened vault folders left from a previous
  //     session (keeps genuinely-open plaintext, drops stale registrations).
  try { vaultManager.reconcileTempEntries(); } catch (_) {}

  // 3. Repair the boot auto-start entry so it launches hidden in the tray
  ensureAutoStartMinimized();

  // 3. Show window now that IPC and DB are ready
  createWindow();

  // 4. Init system tray immediately
  try {
    trayManager = initTray(mainWindow, () => {
      syncEngine.scanAllFolders();
    });
  } catch (e) {
    console.error('Tray init error:', e.message);
  }

  // 5. Ensure all monitored folders have the AuraSync badge and halo in Windows Explorer (deferred & non-blocking)
  setTimeout(() => {
    try {
      const folders = db.getFolders();
      folderDecorator.decorateAll(folders);
    } catch (e) {
      console.error('Folder decorator init error:', e.message);
    }
  }, 1200);

  // Handle CLI / Windows Explorer arguments (Vault actions or folder sync)
  handleCliArgs(process.argv);

  // Deactivate and clean up Windows Explorer vault context menu
  try {
    contextMenu.cleanLegacyVaultKeys();
    contextMenu.unregister().catch(() => {});
    db.setSetting('context_menu_enabled', 'false');
  } catch (_) {}

  // 6. Initialize cloud providers in background (non-blocking)
  try {
    cloudProviders.initAccounts(app.getPath('userData'));
  } catch (e) {
    console.error('Account manager init error:', e.message);
  }
  cloudProviders.initializeAll().then((results) => {
    syncEngine.start();
  }).catch((e) => {
    console.error('Cloud providers init error:', e.message);
    syncEngine.start();
  });

  // 7. Start Browser Guard if enabled
  try {
    browserGuard.start();
  } catch (e) {
    console.error('Browser guard start error:', e.message);
  }

  // 8. Auto check for GitHub releases in background & on window focus
  let lastUpdateCheckTime = 0;
  const triggerBackgroundUpdateCheck = async () => {
    const now = Date.now();
    if (now - lastUpdateCheckTime < 60000) return; // Debounce 60s
    lastUpdateCheckTime = now;
    try {
      if (mainWindow && !mainWindow.isDestroyed() && !isSetupMode) {
        const res = await updaterEngine.checkForUpdates();
        // Only send if it's an actual desktop update and not mobile-only
        if (res && res.updateAvailable && !res.isMobileRelease && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater:update-available', res);
        }
      }
    } catch (_) {}
  };

  // Check quietly once in background 20 seconds after launch (never on window focus)
  setTimeout(triggerBackgroundUpdateCheck, 20000);
});

app.on('activate', () => {
  showMainWindow();
});

let vaultRelockSettled = false;
app.on('before-quit', (event) => {
  app.isQuitting = true;
  try {
    browserGuard.stop();
  } catch (_) {}
  // Auto re-lock any temporarily-opened encrypted folders before shutting down.
  if (!vaultRelockSettled && vaultManager.getTempOpenList().length) {
    event.preventDefault();
    vaultManager.relockAllTempEntries()
      .catch(() => {})
      .finally(() => {
        vaultRelockSettled = true;
        app.quit();
      });
    return;
  }
  if (trayManager && trayManager.destroy) {
    try { trayManager.destroy(); } catch (_) {}
  }
  db.closeDatabase();
});

app.on('window-all-closed', () => {
  const minimizeToTray = db.getSetting('minimizeToTray', 'true') === 'true';
  if (!minimizeToTray) {
    app.isQuitting = true;
    if (trayManager && trayManager.destroy) {
      try { trayManager.destroy(); } catch (_) {}
    }
    app.quit();
  }
});
