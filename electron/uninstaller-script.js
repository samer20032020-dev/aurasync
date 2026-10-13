// Builds the complete standalone uninstaller script that lives inside the
// installed folder as "Uninstall AuraSync.bat" — and the in-app "full removal"
// helper launched from Settings.
//
// It must:
//  - work even when double-clicked from inside the install folder
//  - wait for the running app to close (otherwise the exe stays locked)
//  - delete Desktop + Start Menu + Send-To shortcuts and registry entries
//  - remove the Explorer right-click menu + .aura file association
//  - remove the whole install folder OR just the portable exe, retrying until
//    Windows releases it
//  - optionally wipe the user data folder (%APPDATA%\cloudvault-backup)
//  - clean up after itself (runs from a copy in %TEMP%)
function buildUninstallerScript(targetDir, options = {}) {
  const contextMenuCleanup = options.keepContextMenu ? [] : [
    'reg delete "HKCU\\Software\\Classes\\*\\shell\\AuraSyncVault" /f >nul 2>nul',
    'reg delete "HKCU\\Software\\Classes\\Directory\\shell\\AuraSyncVault" /f >nul 2>nul',
    'reg delete "HKCU\\Software\\Classes\\Directory\\Background\\shell\\AuraSyncVault" /f >nul 2>nul',
    'reg delete "HKCU\\Software\\Classes\\.aura" /f >nul 2>nul',
    'reg delete "HKCU\\Software\\Classes\\AuraSync.VaultFile" /f >nul 2>nul'
  ];

  const dataCleanup = options.dataDir
    ? [`rmdir /s /q "${options.dataDir}" >nul 2>nul`]
    : [];

  let payloadRemoval;
  if (options.exePath && !targetDir) {
    // Portable build: never delete the whole folder — only the exe itself.
    payloadRemoval = [
      'set /a tries=0',
      ':exe_retry',
      `del /f /q "${options.exePath}" >nul 2>nul`,
      `if not exist "${options.exePath}" goto done`,
      'set /a tries+=1',
      'if %tries% lss 15 (timeout /t 1 /nobreak >nul & goto exe_retry)'
    ];
  } else {
    payloadRemoval = [
      'set /a tries=0',
      ':rmdir_retry',
      `rmdir /s /q "${targetDir}" >nul 2>nul`,
      `if not exist "${targetDir}" goto done`,
      'set /a tries+=1',
      'if %tries% lss 15 (timeout /t 1 /nobreak >nul & goto rmdir_retry)'
    ];
  }

  return [
    '@echo off',
    'title AuraSync Uninstall',
    'chcp 65001 >nul 2>nul',
    'if /i "%~dp0"=="%TEMP%\\" goto run',
    'copy /y "%~f0" "%TEMP%\\aurasync-uninstall.bat" >nul 2>nul',
    'start "" /min cmd /c ""%TEMP%\\aurasync-uninstall.bat"',
    'exit /b 0',

    ':run',
    'rem Never keep the install folder as the working directory — Windows',
    'rem cannot delete a directory that is the CWD of a running process.',
    'cd /d "%TEMP%"',

    'taskkill /IM AuraSync.exe /F >nul 2>nul',
    'set /a tries=0',
    ':waitapp',
    'tasklist /FI "IMAGENAME eq AuraSync.exe" 2>nul | find /i "AuraSync.exe" >nul',
    'if errorlevel 1 goto appclosed',
    'set /a tries+=1',
    'if %tries% geq 20 goto appclosed',
    'timeout /t 1 /nobreak >nul',
    'goto waitapp',
    ':appclosed',

    'del /f /q "%USERPROFILE%\\Desktop\\AuraSync.lnk" >nul 2>nul',
    'if defined OneDrive del /f /q "%OneDrive%\\Desktop\\AuraSync.lnk" >nul 2>nul',
    'if defined ONEDRIVECOMMERCIAL del /f /q "%ONEDRIVECOMMERCIAL%\\Desktop\\AuraSync.lnk" >nul 2>nul',
    'del /f /q "%PUBLIC%\\Desktop\\AuraSync.lnk" >nul 2>nul',
    'del /f /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\AuraSync.lnk" >nul 2>nul',
    'del /f /q "%APPDATA%\\Microsoft\\Windows\\SendTo\\AuraSync.lnk" >nul 2>nul',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AuraSync" /f >nul 2>nul',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v AuraSync /f >nul 2>nul',
    ...contextMenuCleanup,

    ...payloadRemoval,

    ':done',
    ...dataCleanup,
    'del /f /q "%~f0" >nul 2>nul',
    'exit /b 0',
    ''
  ].join('\r\n');
}

module.exports = { buildUninstallerScript };
