const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const { execFileSync } = require('child_process');
const db = require('./database');

class ContextMenuManager {
  getExePath() {
    if (app && app.isPackaged) {
      return app.getPath('exe');
    }
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AuraSync', '/v', 'InstallLocation'],
        { encoding: 'utf8', windowsHide: true }
      );
      const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/);
      if (match && match[1]) {
        const candidate = path.join(match[1].trim(), 'AuraSync.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (_) {}

    if (fs.existsSync('E:\\AuraSync\\AuraSync.exe')) {
      return 'E:\\AuraSync\\AuraSync.exe';
    }

    const localAppData = process.env.LOCALAPPDATA || '';
    const installedExe = path.join(localAppData, 'Programs', 'AuraSync', 'AuraSync.exe');
    if (fs.existsSync(installedExe)) {
      return installedExe;
    }
    const appDir = app ? app.getAppPath() : path.resolve(__dirname, '..');
    const portableExe = path.join(appDir, 'AuraSync-Portable.exe');
    if (fs.existsSync(portableExe)) {
      return portableExe;
    }
    const batPath = path.join(appDir, 'AuraSync.bat');
    if (fs.existsSync(batPath)) {
      return batPath;
    }
    return process.execPath;
  }

  getIconPath() {
    const appDir = app ? app.getAppPath() : path.resolve(__dirname, '..');
    const directIcon = path.join(appDir, 'icon.ico');
    if (fs.existsSync(directIcon)) return directIcon;

    if (fs.existsSync('E:\\AuraSync\\icon.ico')) {
      return 'E:\\AuraSync\\icon.ico';
    }

    const localAppData = process.env.LOCALAPPDATA || '';
    const installedIcon = path.join(localAppData, 'Programs', 'AuraSync', 'icon.ico');
    if (fs.existsSync(installedIcon)) return installedIcon;

    return directIcon;
  }

  isRegistered() {
    if (process.platform !== 'win32') return false;
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Classes\\*\\shell\\AuraSyncVault'],
        { encoding: 'utf8', windowsHide: true }
      );
      return Boolean(out && out.includes('AuraSyncVault'));
    } catch (_) {
      return false;
    }
  }

  getStatus() {
    const isSystemRegistered = this.isRegistered();
    const settingEnabled = db.getSetting('context_menu_enabled');
    return {
      enabled: settingEnabled !== 'false' && isSystemRegistered,
      isRegistered: isSystemRegistered
    };
  }

  async register() {
    if (process.platform !== 'win32') return { success: false, error: 'Not Windows' };

    const exePath = this.getExePath();
    const iconPath = this.getIconPath();

    const escExe = exePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escIcon = iconPath.replace(/\\/g, '\\\\');

    const regContent = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\AuraSyncVault]
"MUIVerb"="AuraSync ☁️"
"SubCommands"=""
"Icon"="${escIcon}"

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\AuraSyncVault\\shell\\1_Sync]
"MUIVerb"="☁️ مزامنة سريعة مع السحابة"

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\AuraSyncVault\\shell\\1_Sync\\command]
@="\\"${escExe}\\" --sync \\"%1\\""

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\AuraSyncVault\\shell\\2_DeleteBoth]
"MUIVerb"="🗑️ حذف نهائي (من الجهاز والسحابة معاً)"

[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\AuraSyncVault\\shell\\2_DeleteBoth\\command]
@="\\"${escExe}\\" --delete-both \\"%1\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\AuraSyncVault]
"MUIVerb"="AuraSync ☁️"
"SubCommands"=""
"Icon"="${escIcon}"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\AuraSyncVault\\shell\\1_Sync]
"MUIVerb"="☁️ مزامنة المجلد مع AuraSync"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\AuraSyncVault\\shell\\1_Sync\\command]
@="\\"${escExe}\\" --sync \\"%1\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\AuraSyncVault\\shell\\2_DeleteBoth]
"MUIVerb"="🗑️ حذف نهائي (من الجهاز والسحابة معاً)"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\AuraSyncVault\\shell\\2_DeleteBoth\\command]
@="\\"${escExe}\\" --delete-both \\"%1\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault]
"MUIVerb"="AuraSync ☁️"
"SubCommands"=""
"Icon"="${escIcon}"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault\\shell\\1_Sync]
"MUIVerb"="☁️ مزامنة هذا المجلد مع AuraSync"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault\\shell\\1_Sync\\command]
@="\\"${escExe}\\" --sync \\"%V\\""

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault\\shell\\2_DeleteBoth]
"MUIVerb"="🗑️ حذف نهائي لهذا المجلد (من الجهاز والسحابة معاً)"

[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault\\shell\\2_DeleteBoth\\command]
@="\\"${escExe}\\" --delete-both \\"%V\\""

[HKEY_CURRENT_USER\\Software\\Classes\\.aura]
@="AuraSync.VaultFile"
"Content Type"="application/x-aurasync-vault"
"PerceivedType"="document"

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile]
@="ملف AuraSync مقفل ومحمي"
"FriendlyTypeName"="ملف AuraSync مقفل ومحمي"

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile\\DefaultIcon]
@="${escIcon},0"

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile\\shell\\open]
@="فك قفل وتشغيل الملف"
"MUIVerb"="🔓 فك قفل وتشغيل الملف"

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile\\shell\\open\\command]
@="\\"${escExe}\\" --vault-open \\"%1\\""

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile\\shell\\restore]
@="استعادة إلى المجلد الأصلي"
"MUIVerb"="📦 استعادة إلى المجلد الأصلي"

[HKEY_CURRENT_USER\\Software\\Classes\\AuraSync.VaultFile\\shell\\restore\\command]
@="\\"${escExe}\\" --vault-restore \\"%1\\""
`;

    const tempDir = (app && typeof app.getPath === 'function') ? app.getPath('temp') : os.tmpdir();
    const regFilePath = path.join(tempDir, `aurasync_vault_${Date.now()}.reg`);

    try {
      // Windows reg import expects UTF-16LE with BOM (\ufeff)
      fs.writeFileSync(regFilePath, '\ufeff' + regContent, { encoding: 'utf16le' });
      execFileSync('reg', ['import', regFilePath], { windowsHide: true });
      try { fs.unlinkSync(regFilePath); } catch (_) {}
      db.setSetting('context_menu_enabled', 'true');
      this.refreshShellIcons();
      return { success: true };
    } catch (e) {
      try { fs.unlinkSync(regFilePath); } catch (_) {}
      console.error('[ContextMenu] Failed to import reg file:', e.message);
      return { success: false, error: e.message };
    }
  }

  refreshShellIcons() {
    if (process.platform !== 'win32') return;
    try {
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[ShellNotifier]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', psScript], {
        windowsHide: true,
        timeout: 4000
      });
    } catch (_) {}
  }

  async unregister() {
    if (process.platform !== 'win32') return { success: false };

    try {
      execFileSync('reg', ['delete', 'HKCU\\Software\\Classes\\*\\shell\\AuraSyncVault', '/f'], { windowsHide: true });
    } catch (_) {}

    try {
      execFileSync('reg', ['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\AuraSyncVault', '/f'], { windowsHide: true });
    } catch (_) {}

    try {
      execFileSync('reg', ['delete', 'HKCU\\Software\\Classes\\.aura', '/f'], { windowsHide: true });
    } catch (_) {}

    try {
      execFileSync('reg', ['delete', 'HKCU\\Software\\Classes\\AuraSync.VaultFile', '/f'], { windowsHide: true });
    } catch (_) {}

    db.setSetting('context_menu_enabled', 'false');
    this.refreshShellIcons();
    return { success: true };
  }

  cleanLegacyVaultKeys() {
    if (process.platform !== 'win32') return;
    const legacySubKeys = ['1' + '_Lock', '2' + '_Hide', '3' + '_LockHide', '2' + '_Lock', '4' + '_Hide'];
    const roots = [
      'HKCU\\Software\\Classes\\*\\shell\\AuraSyncVault\\shell',
      'HKCU\\Software\\Classes\\Directory\\shell\\AuraSyncVault\\shell',
      'HKCU\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault\\shell'
    ];
    for (const root of roots) {
      for (const sub of legacySubKeys) {
        try {
          execFileSync('reg', ['delete', `${root}\\${sub}`, '/f'], { windowsHide: true, stdio: 'ignore' });
        } catch (_) {}
      }
    }
  }

  async setEnabled(enable) {
    if (enable) {
      return this.register();
    } else {
      return this.unregister();
    }
  }
}

module.exports = new ContextMenuManager();
