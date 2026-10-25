/**
 * AuraSync — Clean & Streamline Workspace
 * ========================================
 * Safely purges temporary packaging directories, obsolete staging files,
 * and stale historical binaries from the workspace to reclaim disk space
 * and ensure the repository is clean, organized, and production-ready.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const currentDesktop = pkg.version;
const currentMobile = pkg.mobileVersion || '1.0.9';

let totalBytesFreed = 0;
let filesRemoved = 0;
let dirsRemoved = 0;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function safeRemoveFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const stat = fs.statSync(filePath);
    totalBytesFreed += stat.size;
    try { fs.chmodSync(filePath, 0o666); } catch (_) {}
    fs.unlinkSync(filePath);
    filesRemoved++;
    console.log(`  🗑️ [File Removed] ${path.relative(rootDir, filePath)} (${formatBytes(stat.size)})`);
  } catch (err) {
    console.warn(`  ⚠️ Could not remove file ${filePath}:`, err.message);
  }
}

function safeRemoveDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        safeRemoveDir(full);
      } else {
        safeRemoveFile(full);
      }
    }
    try { fs.rmdirSync(dirPath); } catch (_) {}
    dirsRemoved++;
    console.log(`  📁 [Folder Pruned] ${path.relative(rootDir, dirPath)}`);
  } catch (err) {
    console.warn(`  ⚠️ Could not remove folder ${dirPath}:`, err.message);
  }
}

console.log('\n======================================================');
console.log('🧹 AuraSync Deep Workspace & Release Cleaner');
console.log('======================================================');
console.log(`Current Desktop Target : v${currentDesktop}`);
console.log(`Current Mobile Target  : v${currentMobile}`);
console.log('======================================================\n');

// 1. Terminate any stray background Electron or AuraSync processes to avoid file locks
try {
  execSync('powershell -Command "Get-Process -Name AuraSync*,electron* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { windowsHide: true });
} catch (_) {}

// 2. Remove all temporary build-* directories in project root
console.log('1️⃣ Cleaning temporary build directories from root...');
try {
  const rootEntries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isDirectory() && (entry.name.startsWith('build-') || entry.name === 'build-output' || entry.name === 'mobile-build-stage' || entry.name === 'temp-vault-test' || entry.name === 'scratch')) {
      safeRemoveDir(path.join(rootDir, entry.name));
    }
  }
} catch (e) {
  console.warn('Notice scanning root build dirs:', e.message);
}

// 3. Clean temporary files and legacy unpacked folders from release/
console.log('\n2️⃣ Cleaning release temporary artifacts and legacy staging...');
if (fs.existsSync(releaseDir)) {
  const legacyDirs = ['win-unpacked-old', 'win-unpacked.tmp'];
  for (const ld of legacyDirs) {
    const fullLd = path.join(releaseDir, ld);
    if (fs.existsSync(fullLd)) {
      safeRemoveDir(fullLd);
    }
  }

  try {
    const rFiles = fs.readdirSync(releaseDir);
    for (const f of rFiles) {
      const fullF = path.join(releaseDir, f);
      if (f.endsWith('.blockmap') || f.endsWith('.yml') || f.endsWith('.log') || f.endsWith('.7z') || f.endsWith('.nsis.7z')) {
        safeRemoveFile(fullF);
      }
    }
  } catch (e) {
    console.warn('Notice cleaning release files:', e.message);
  }

  // 4. Clean stale historical binaries in release/
  console.log('\n3️⃣ Pruning stale historical binaries in release/ root...');
  try {
    const rFiles = fs.readdirSync(releaseDir);
    for (const f of rFiles) {
      const fullF = path.join(releaseDir, f);
      if (f.endsWith('.exe')) {
        const match = f.match(/v(\d+\.\d+\.\d+)/i);
        if (match && match[1] !== currentDesktop) {
          safeRemoveFile(fullF);
        }
      } else if (f.endsWith('.apk')) {
        const match = f.match(/v(\d+\.\d+\.\d+)/i);
        if (match && match[1] !== currentMobile) {
          safeRemoveFile(fullF);
        }
      }
    }
  } catch (e) {
    console.warn('Notice pruning release/ stale binaries:', e.message);
  }

  // 5. Clean stale historical binaries in release/desktop/
  console.log('\n4️⃣ Pruning stale historical binaries in release/desktop/...');
  const desktopDir = path.join(releaseDir, 'desktop');
  if (fs.existsSync(desktopDir)) {
    try {
      const dFiles = fs.readdirSync(desktopDir);
      for (const f of dFiles) {
        if (f.endsWith('.exe')) {
          const match = f.match(/v(\d+\.\d+\.\d+)/i);
          if (match && match[1] !== currentDesktop) {
            safeRemoveFile(path.join(desktopDir, f));
          }
        }
      }
    } catch (e) {
      console.warn('Notice pruning release/desktop stale binaries:', e.message);
    }
  }

  // 6. Clean stale historical binaries in release/mobile/
  console.log('\n5️⃣ Pruning stale historical binaries in release/mobile/...');
  const mobileDir = path.join(releaseDir, 'mobile');
  if (fs.existsSync(mobileDir)) {
    try {
      const mFiles = fs.readdirSync(mobileDir);
      for (const f of mFiles) {
        if (f.endsWith('.apk')) {
          const match = f.match(/v(\d+\.\d+\.\d+)/i);
          if (match && match[1] !== currentMobile) {
            safeRemoveFile(path.join(mobileDir, f));
          }
        }
      }
    } catch (e) {
      console.warn('Notice pruning release/mobile stale binaries:', e.message);
    }
  }
}

console.log('\n======================================================');
console.log('🎉 Workspace Cleaning Complete!');
console.log(`📁 Folders pruned : ${dirsRemoved}`);
console.log(`🗑️ Files removed  : ${filesRemoved}`);
console.log(`💾 Disk space saved: ${formatBytes(totalBytesFreed)}`);
console.log('======================================================\n');
