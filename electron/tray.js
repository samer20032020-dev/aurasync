const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');

let tray = null;

function createTrayIcon() {
  // Multi-size ICO first — Windows picks the crispest size for the DPI
  const icoPath = path.join(__dirname, '..', 'tray.ico');
  if (fs.existsSync(icoPath)) {
    try {
      const img = nativeImage.createFromPath(icoPath);
      if (!img.isEmpty()) return img;
    } catch (_) {}
  }

  const iconPath = path.join(__dirname, '..', 'tray-icon.png');
  if (fs.existsSync(iconPath)) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) return img;
    } catch (_) {}
  }

  const pngPath = path.join(__dirname, '..', 'icon.png');
  if (fs.existsSync(pngPath)) {
    try {
      const img = nativeImage.createFromPath(pngPath);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    } catch (_) {}
  }

  // Fallback 16x16 buffer
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const isCloud = (
        (y >= 6 && y <= 12 && x >= 3 && x <= 13) ||
        (y >= 4 && y <= 8 && x >= 5 && x <= 10) ||
        (y >= 5 && y <= 9 && x >= 9 && x <= 12)
      );

      if (isCloud) {
        buffer[idx] = 34;
        buffer[idx + 1] = 211;
        buffer[idx + 2] = 238;
        buffer[idx + 3] = 255;
      } else {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function initTray(mainWindow, onSyncNow) {
  try {
    if (tray && !tray.isDestroyed()) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }

    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('AuraSync — النسخ الاحتياطي السحابي');

    let updateTimer = null;
    const doUpdateContextMenu = () => {
      try {
        if (!tray || tray.isDestroyed()) return;
        const stats = db.getAppStats();
        const statusLine = `${stats.totalFolders} مجلدات · ${stats.syncedFiles} ملف محمي${
          stats.pendingFiles > 0 ? ` · ${stats.pendingFiles} قيد الرفع` : ''
        }`;
        const contextMenu = Menu.buildFromTemplate([
          {
            label: 'AuraSync — النسخ الاحتياطي السحابي',
            enabled: false,
          },
          {
            label: statusLine,
            enabled: false,
          },
          { type: 'separator' },
          {
            label: 'فتح AuraSync',
            click: () => {
              if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
              }
            }
          },
          {
            label: 'مزامنة الكل الآن',
            click: () => {
              if (onSyncNow) onSyncNow();
            }
          },
          { type: 'separator' },
          {
            label: 'إغلاق البرنامج نهائياً',
            click: () => {
              app.isQuitting = true;
              if (tray && !tray.isDestroyed()) {
                try { tray.destroy(); } catch (_) {}
                tray = null;
              }
              app.quit();
            }
          }
        ]);

        tray.setContextMenu(contextMenu);
      } catch (e) {
        console.error('Error updating tray menu:', e);
      }
    };

    const updateContextMenu = (immediate = false) => {
      if (immediate) {
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }
        doUpdateContextMenu();
        return;
      }
      if (updateTimer) return;
      updateTimer = setTimeout(() => {
        updateTimer = null;
        doUpdateContextMenu();
      }, 600);
    };

    updateContextMenu(true);

    let clickTimer = null;

    tray.on('double-click', () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

    tray.on('click', () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        // Two clicks within debounce window: treat as open
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
        }
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
            mainWindow.hide();
          } else {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      }, 260);
    });

    return {
      tray,
      updateContextMenu,
      destroy: () => {
        if (updateTimer) {
          clearTimeout(updateTimer);
          updateTimer = null;
        }
        if (tray && !tray.isDestroyed()) {
          try { tray.destroy(); } catch (_) {}
          tray = null;
        }
      }
    };
  } catch (err) {
    console.warn('Tray initialization skipped:', err.message);
    return {
      tray: null,
      updateContextMenu: () => {},
      destroy: () => {}
    };
  }
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
}

module.exports = { initTray };
