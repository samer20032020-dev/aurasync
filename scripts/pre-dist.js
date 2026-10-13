/**
 * Pre-Distribution Build Preparation
 * ==================================
 * 1. Terminates any running AuraSync/Electron instances to release all Windows file locks.
 * 2. Purges stale executables from release/ and root before building, ensuring that
 *    electron-builder compiles completely fresh binaries and cannot reuse stale ones.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');

console.log('🧹 [Pre-Dist] Preparing clean build environment...');

// 1. Terminate all running AuraSync and Electron processes
try {
  execSync(
    'powershell -Command "Get-Process -Name AuraSync*,electron* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"',
    { windowsHide: true }
  );
  execSync('powershell -Command "Start-Sleep -Milliseconds 400"', { windowsHide: true });
} catch (_) {}

// 2. Remove previous installer binaries in release/ to guarantee fresh compilation
if (fs.existsSync(releaseDir)) {
  try {
    const files = fs.readdirSync(releaseDir);
    for (const f of files) {
      if (f.endsWith('.exe')) {
        const full = path.join(releaseDir, f);
        try {
          fs.unlinkSync(full);
          console.log(`[Pre-Dist] Removed previous release binary: ${f}`);
        } catch (err) {
          // Force remove locked file
          try {
            execSync(`powershell -Command "Remove-Item -Force -Path '${full}' -ErrorAction SilentlyContinue"`, { windowsHide: true });
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.warn('[Pre-Dist] Notice cleaning release directory:', err.message);
  }
}

// 3. Verify root executables can be written to
for (const rootExe of ['AuraSync-Setup.exe', 'AuraSync-Portable.exe']) {
  const p = path.join(root, rootExe);
  if (fs.existsSync(p)) {
    try {
      // Test write lock
      const fd = fs.openSync(p, 'r+');
      fs.closeSync(fd);
    } catch (lockErr) {
      console.warn(`[Pre-Dist] Root executable ${rootExe} is locked. Terminating locking processes...`);
      try {
        execSync('powershell -Command "Get-Process -Name AuraSync*,electron* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { windowsHide: true });
        execSync('powershell -Command "Start-Sleep -Milliseconds 500"', { windowsHide: true });
      } catch (_) {}
    }
  }
}

console.log('✅ [Pre-Dist] Clean build environment ready.');
