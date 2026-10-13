const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { exec } = require('child_process');

class FolderDecorator {
  constructor() {
    this.icoPath = null;
    this.pendingShellNotifies = new Set();
    this.shellNotifyTimer = null;
  }

  ensureIconPath() {
    try {
      const userDataDir = app ? app.getPath('userData') : path.join(process.env.APPDATA || '', 'cloudvault-backup');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      const targetIco = path.join(userDataDir, 'aurasync-folder.ico');

      // Candidate asset sources
      const candidateSources = [
        path.join(__dirname, '..', 'assets', 'aurasync-folder.ico'),
        path.join(__dirname, '..', '..', 'assets', 'aurasync-folder.ico'),
        path.join(process.resourcesPath || '', 'assets', 'aurasync-folder.ico'),
        path.join(process.resourcesPath || '', 'app', 'assets', 'aurasync-folder.ico'),
        path.join(__dirname, '..', 'assets', 'cloudvault-folder.ico')
      ];

      for (const src of candidateSources) {
        if (fs.existsSync(src)) {
          let needCopy = true;
          if (fs.existsSync(targetIco)) {
            try {
              const srcStat = fs.statSync(src);
              const tgtStat = fs.statSync(targetIco);
              if (srcStat.size === tgtStat.size && srcStat.mtimeMs <= tgtStat.mtimeMs) {
                needCopy = false;
              }
            } catch (_) {}
          }
          if (needCopy) {
            fs.copyFileSync(src, targetIco);
          }
          break;
        }
      }

      if (fs.existsSync(targetIco)) {
        this.icoPath = targetIco;
        return this.icoPath;
      }
    } catch (err) {
      console.error('[FolderDecorator] Error ensuring icon path:', err.message);
    }

    // Direct fallback
    const directFallback = path.resolve(__dirname, '..', 'assets', 'aurasync-folder.ico');
    if (fs.existsSync(directFallback)) {
      this.icoPath = directFallback;
      return this.icoPath;
    }

    return null;
  }

  notifyWindowsShell(folderPath) {
    if (process.platform !== 'win32') return;
    if (folderPath) {
      this.pendingShellNotifies.add(folderPath);
    }

    if (this.shellNotifyTimer) return;
    this.shellNotifyTimer = setTimeout(() => {
      this.shellNotifyTimer = null;
      const paths = Array.from(this.pendingShellNotifies);
      this.pendingShellNotifies.clear();
      if (paths.length === 0) return;

      try {
        const scriptParts = [
          'Add-Type -Namespace Win32 -Name Shell32 -MemberDefinition \'[System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern void SHChangeNotify(int wEventId, uint uFlags, string dwItem1, string dwItem2);\''
        ];
        for (const p of paths) {
          const escaped = p.replace(/'/g, "''");
          scriptParts.push(`[Win32.Shell32]::SHChangeNotify(0x00002000, 0x0005, '${escaped}', $null)`);
          scriptParts.push(`[Win32.Shell32]::SHChangeNotify(0x00000008, 0x0005, '${escaped}', $null)`);
        }
        const script = scriptParts.join('; ');
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
          windowsHide: true,
          timeout: 6000
        }, () => {});
      } catch (_) {}
    }, 500);
  }

  decorateFolder(folderPath) {
    if (process.platform !== 'win32') return false;
    if (!folderPath || !fs.existsSync(folderPath)) return false;

    const ico = this.ensureIconPath();
    if (!ico) {
      console.warn('[FolderDecorator] Cannot decorate: icon file not found');
      return false;
    }

    try {
      const iniPath = path.join(folderPath, 'desktop.ini');
      let existingCustomIcon = null;

      if (fs.existsSync(iniPath)) {
        try {
          const content = fs.readFileSync(iniPath, 'utf8');
          // If already decorated by AuraSync, skip touching attributes or files
          if (content.includes('AuraSync Protected') && (content.includes('aurasync-folder.ico') || content.includes('cloudvault-folder.ico'))) {
            return true;
          }

          // If the folder already has a custom game/application icon, preserve it!
          const match = content.match(/IconResource\s*=\s*([^\r\n]+)/i);
          if (match && match[1]) {
            const rawIcon = match[1].trim();
            if (!rawIcon.toLowerCase().includes('cloudvault-folder.ico') && 
                !rawIcon.toLowerCase().includes('aurasync-folder.ico')) {
              existingCustomIcon = rawIcon;
            }
          }
        } catch (_) {}

        exec(`attrib -h -s -r "${iniPath}"`, { windowsHide: true }, () => {});
      }

      // Preserve existing custom game/app icon, otherwise use the yellow folder with blue contour line
      const iconToUse = existingCustomIcon ? existingCustomIcon : `${ico},0`;

      const iniContent = [
        '[.ShellClassInfo]',
        `IconResource=${iconToUse}`,
        'InfoTip=AuraSync Protected • مجلد محمي ومزامن سحابياً (Zero-Deletion Active)',
        '[ViewState]',
        'Mode=',
        'Vid=',
        'FolderType=Generic',
        ''
      ].join('\r\n');

      fs.writeFileSync(iniPath, iniContent, { encoding: 'utf8' });

      // In Windows, desktop.ini MUST be +h +s, and folder MUST be +r (async)
      exec(`attrib +h +s "${iniPath}"`, { windowsHide: true }, () => {});
      exec(`attrib +r "${folderPath}"`, { windowsHide: true }, () => {});

      this.notifyWindowsShell(folderPath);
      return true;
    } catch (err) {
      console.error('[FolderDecorator] Error decorating folder:', err.message);
      return false;
    }
  }

  undecorateFolder(folderPath) {
    if (process.platform !== 'win32') return false;
    if (!folderPath || !fs.existsSync(folderPath)) return false;

    try {
      const iniPath = path.join(folderPath, 'desktop.ini');
      if (fs.existsSync(iniPath)) {
        exec(`attrib -h -s -r "${iniPath}"`, { windowsHide: true }, () => {});

        let content = '';
        try { content = fs.readFileSync(iniPath, 'utf8'); } catch (_) {}

        const customIcon = (content.match(/IconResource\s*=\s*([^\r\n]+)/i) || [])[1];
        const customIsOurs = !customIcon || /aurasync-folder\.ico|cloudvault-folder\.ico/i.test(customIcon);
        const hasOurMarker = /AuraSync Protected|aurasync-folder\.ico|cloudvault-folder\.ico/i.test(content);

        if (customIcon && !customIsOurs) {
          // The user had a custom folder icon before AuraSync: restore just it
          fs.writeFileSync(iniPath, `[.ShellClassInfo]\r\nIconResource=${customIcon.trim()}\r\n`, { encoding: 'utf8' });
          exec(`attrib +h +s "${iniPath}"`, { windowsHide: true }, () => {});
        } else if (hasOurMarker) {
          try { fs.unlinkSync(iniPath); } catch (_) {}
        }
        // Otherwise the desktop.ini was not created by AuraSync: leave it untouched
      }

      exec(`attrib -r "${folderPath}"`, { windowsHide: true }, () => {});

      this.notifyWindowsShell(folderPath);
      return true;
    } catch (err) {
      console.error('[FolderDecorator] Error undecorating folder:', err.message);
      return false;
    }
  }

  decorateAll(folders) {
    if (!Array.isArray(folders)) return;
    for (const f of folders) {
      if (f.path && fs.existsSync(f.path)) {
        this.decorateFolder(f.path);
      }
    }
  }
}

module.exports = new FolderDecorator();
