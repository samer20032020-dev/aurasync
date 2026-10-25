const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const expectedVersion = pkg.version;

if (!fs.existsSync(releaseDir)) {
  console.log('No release directory found.');
  process.exit(0);
}

console.log(`Cleaning and streamlining release directory for v${expectedVersion}...`);

// Ensure no running AuraSync processes lock output binaries
try {
  execSync('powershell -Command "Get-Process -Name AuraSync*,electron* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { windowsHide: true });
} catch (_) {}

// Helper for safe directory removal without crashing Node on locked files
function safeRemoveDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          safeRemoveDir(fullPath);
          try { fs.rmdirSync(fullPath); } catch {}
        } else {
          try {
            fs.chmodSync(fullPath, 0o666);
            fs.unlinkSync(fullPath);
          } catch {}
        }
      } catch {}
    }
    try { fs.rmdirSync(dir); } catch {}
  } catch {}
  if (fs.existsSync(dir)) {
    try {
      const os = require('os');
      const tempDest = path.join(os.tmpdir(), `aurasync-prune-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      fs.renameSync(dir, tempDest);
    } catch (_) {}
  }
}

// 1. Remove temporary files (.blockmap, .yml, .log, .7z)
try {
  const files = fs.readdirSync(releaseDir);
  for (const file of files) {
    const fullPath = path.join(releaseDir, file);
    if (file.endsWith('.blockmap') || file.endsWith('.yml') || file.endsWith('.log') || file.endsWith('.7z') || file.endsWith('.nsis.7z')) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`Removed: ${file}`);
      } catch (e) {
        console.warn(`Could not remove ${file}:`, e.message);
      }
    }
  }
} catch (e) {
  console.warn('Error reading release directory for temp files:', e.message);
}

// 2. Clean temporary staging directories if present
const legacyStagingDirs = ['win-unpacked.tmp', 'win-unpacked-old'];
for (const ld of legacyStagingDirs) {
  const fullLd = path.join(releaseDir, ld);
  if (fs.existsSync(fullLd)) {
    safeRemoveDir(fullLd);
  }
}

// 3. Remove stale archived binaries from older versions in release/
try {
  const files = fs.readdirSync(releaseDir);
  for (const f of files) {
    if (f.endsWith('.exe')) {
      const match = f.match(/v(\d+\.\d+\.\d+)/i);
      if (match && match[1] !== expectedVersion) {
        try {
          fs.unlinkSync(path.join(releaseDir, f));
          console.log(`Purged stale older version binary: ${f}`);
        } catch (_) {}
      }
    } else if (f.endsWith('.apk')) {
      const match = f.match(/v(\d+\.\d+\.\d+)/i);
      const mobileVer = pkg.mobileVersion || '1.0.5';
      if (match && match[1] !== mobileVer) {
        try {
          fs.unlinkSync(path.join(releaseDir, f));
          console.log(`Purged stale non-mobile APK: ${f}`);
        } catch (_) {}
      }
    }
  }
} catch (e) {
  console.warn('Notice checking stale binaries:', e.message);
}

// 3b. Prune stale older versions from dedicated desktop release folder
const desktopRelDir = path.join(releaseDir, 'desktop');
if (fs.existsSync(desktopRelDir)) {
  try {
    const df = fs.readdirSync(desktopRelDir);
    for (const f of df) {
      if (f.endsWith('.exe')) {
        const match = f.match(/v(\d+\.\d+\.\d+)/i);
        if (match && match[1] !== expectedVersion) {
          try {
            fs.unlinkSync(path.join(desktopRelDir, f));
            console.log(`Purged stale older desktop binary: ${f}`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

// 3c. Prune stale older versions from dedicated mobile release folder
const mobileRelDir = path.join(releaseDir, 'mobile');
if (fs.existsSync(mobileRelDir)) {
  try {
    const mf = fs.readdirSync(mobileRelDir);
    const mobileVer = pkg.mobileVersion || '1.0.5';
    for (const f of mf) {
      if (f.endsWith('.apk')) {
        const match = f.match(/v(\d+\.\d+\.\d+)/i);
        if (match && match[1] !== mobileVer) {
          try {
            fs.unlinkSync(path.join(mobileRelDir, f));
            console.log(`Purged stale older mobile APK: ${f}`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

// 4. Locate the newly compiled portable executable
const copyWithRetry = (src, dst) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (fs.existsSync(dst)) {
        try { fs.unlinkSync(dst); } catch (_) {}
      }
      fs.copyFileSync(src, dst);
      return true;
    } catch (err) {
      try {
        execSync('powershell -Command "Get-Process -Name AuraSync*,electron* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { windowsHide: true });
        execSync('powershell -Command "Start-Sleep -Milliseconds 400"', { windowsHide: true });
      } catch (_) {}
      if (attempt === 9) throw err;
    }
  }
};

// Check if electron-builder outputted to any dynamic build-* or dist-electron directory
try {
  const rootEntries = fs.readdirSync(rootDir);
  const candidateDirs = rootEntries.filter(
    (e) => e.startsWith('build-') || e === 'build-output' || e === 'dist-electron'
  );
  for (const outSub of candidateDirs) {
    const outDir = path.join(rootDir, outSub);
    if (fs.existsSync(outDir) && fs.statSync(outDir).isDirectory()) {
      try {
        const dFiles = fs.readdirSync(outDir);
        for (const df of dFiles) {
          if (df.endsWith('.exe')) {
            const srcExe = path.join(outDir, df);
            const dstExe = path.join(releaseDir, df);
            copyWithRetry(srcExe, dstExe);
            console.log(`[Clean-Release] Imported ${df} from ${outSub} to release/`);
          }
        }
      } catch (dErr) {
        console.warn(`[Clean-Release] Notice importing ${outSub}:`, dErr.message);
      }
      // Prune temporary build directory after importing compiled executables
      safeRemoveDir(outDir);
      console.log(`[Clean-Release] Pruned temporary build dir: ${outSub}`);
    }
  }
  // Also clean up any lingering mobile staging directory
  const mobileBuildStage = path.join(rootDir, 'mobile-build-stage');
  if (fs.existsSync(mobileBuildStage)) {
    safeRemoveDir(mobileBuildStage);
  }
} catch (_) {}

const portableFinal = path.join(releaseDir, 'AuraSync-Portable.exe');
const setupFinal = path.join(releaseDir, 'AuraSync-Setup.exe');
const setupVersioned = path.join(releaseDir, `AuraSync-Setup-v${expectedVersion}.exe`);
const portableVersioned = path.join(releaseDir, `AuraSync-Portable-v${expectedVersion}.exe`);

if (!fs.existsSync(portableFinal)) {
  // If electron-builder named it differently, check candidate
  const candidates = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.exe') && !f.includes('Setup'));
  for (const c of candidates) {
    const full = path.join(releaseDir, c);
    const stat = fs.statSync(full);
    if (stat.size > 50 * 1024 * 1024) {
      fs.copyFileSync(full, portableFinal);
      break;
    }
  }
}

if (!fs.existsSync(portableFinal)) {
  console.error(`FATAL: No portable executable found in ${releaseDir}`);
  process.exit(1);
}

// 5. Verify the newly compiled portable executable has the correct PE ProductVersion
try {
  const peVer = execSync(`powershell -Command "(Get-Item '${portableFinal}').VersionInfo.ProductVersion"`, { encoding: 'utf8', windowsHide: true }).trim();
  console.log(`🔍 [PE Check] Built executable ProductVersion: ${peVer} (Target: ${expectedVersion})`);
  if (!peVer.startsWith(expectedVersion)) {
    throw new Error(`CRITICAL VERSION MISMATCH: Built executable is ${peVer}, but package.json requires ${expectedVersion}!`);
  }
  console.log(`✅ [PE Check] Executable version strictly validated as v${expectedVersion}!`);
} catch (peErr) {
  console.error(peErr.message);
  process.exit(1);
}

// 6. Generate Setup and versioned binaries from the freshly verified portable build

try {
  copyWithRetry(portableFinal, setupFinal);
  copyWithRetry(portableFinal, setupVersioned);
  copyWithRetry(portableFinal, portableVersioned);
  const stat = fs.statSync(setupFinal);
  console.log(`Updated AuraSync-Setup.exe (cloud-shaped installer) (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // Update dedicated desktop release folder
  const desktopReleaseDir = path.join(releaseDir, 'desktop');
  fs.mkdirSync(desktopReleaseDir, { recursive: true });
  copyWithRetry(setupFinal, path.join(desktopReleaseDir, 'AuraSync-Setup.exe'));
  copyWithRetry(setupFinal, path.join(desktopReleaseDir, `AuraSync-Setup-v${expectedVersion}.exe`));
  copyWithRetry(portableFinal, path.join(desktopReleaseDir, 'AuraSync-Portable.exe'));
  copyWithRetry(portableFinal, path.join(desktopReleaseDir, `AuraSync-Portable-v${expectedVersion}.exe`));

  // Update root files
  copyWithRetry(setupFinal, path.join(rootDir, 'AuraSync-Setup.exe'));
  copyWithRetry(portableFinal, path.join(rootDir, 'AuraSync-Portable.exe'));
  console.log(`Updated root AuraSync-Setup.exe & AuraSync-Portable.exe to v${expectedVersion}`);

  // Final root PE verification
  const rootVer = execSync(`powershell -Command "(Get-Item '${path.join(rootDir, 'AuraSync-Setup.exe')}').VersionInfo.ProductVersion"`, { encoding: 'utf8', windowsHide: true }).trim();
  if (!rootVer.startsWith(expectedVersion)) {
    throw new Error(`CRITICAL ROOT MISMATCH: Root AuraSync-Setup.exe is ${rootVer}, expected ${expectedVersion}!`);
  }
  console.log(`✅ [Root Verification] Root installer is confirmed as v${rootVer}!`);
} catch (copyErr) {
  console.error('Fatal error copying binaries:', copyErr.message);
  process.exit(1);
}

// 6b. Automatically compile and package the native Android Mobile APK (skipped if desktop-only)
const isDesktopOnly = process.argv.includes('--desktop') || process.argv.includes('--desktop-only');
const isMobileOnly = process.argv.includes('--mobile') || process.argv.includes('--mobile-only');

if (!isDesktopOnly) {
  try {
    console.log('\n📱 Compiling and packaging AuraSync Android Mobile APK...');
    const apkScript = path.join(__dirname, 'build-android-apk.js');
    if (fs.existsSync(apkScript)) {
      execFileSync(process.execPath, [apkScript], { stdio: 'inherit', windowsHide: true });
    }
  } catch (apkErr) {
    console.error('Android APK build error (non-fatal):', apkErr.message);
  }
} else {
  console.log('\n💻 [Desktop-Only Mode] Skipping Android APK compilation.');
}

console.log('\nFinal Release Contents:');
try {
  const remaining = fs.readdirSync(releaseDir);
  for (const f of remaining) {
    try {
      const s = fs.statSync(path.join(releaseDir, f));
      if (s.isFile()) {
        console.log(`  - ${f} (${(s.size / 1024 / 1024).toFixed(1)} MB)`);
      } else {
        console.log(`  - [DIR] ${f}`);
      }
    } catch {}
  }
} catch {}

console.log('Release directory cleaning complete.');

// 7. Automatically publish build to GitHub Releases and optimize local disk space
try {
  console.log('\n🚀 Automatically syncing build with GitHub Releases...');
  const { execFileSync } = require('child_process');
  const ghScript = path.join(__dirname, 'github-release.js');
  if (fs.existsSync(ghScript)) {
    const ghArgs = [];
    if (isDesktopOnly) ghArgs.push('--desktop');
    else if (isMobileOnly) ghArgs.push('--mobile');
    execFileSync(process.execPath, [ghScript, ...ghArgs], { stdio: 'inherit', windowsHide: true });
  }
} catch (ghErr) {
  console.warn('GitHub release sync notice (non-fatal):', ghErr.message);
}
