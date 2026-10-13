const fs = require('fs');
const path = require('path');

const releaseDir = path.resolve(__dirname, '..', 'release');

if (!fs.existsSync(releaseDir)) {
  console.log('No release directory found.');
  process.exit(0);
}

console.log('Cleaning and streamlining release directory...');

// Ensure no running AuraSync processes lock output binaries
try {
  const { execSync } = require('child_process');
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
          try { fs.unlinkSync(fullPath); } catch {}
        }
      } catch {}
    }
    try { fs.rmdirSync(dir); } catch {}
  } catch {}
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
const winUnpackedTmp = path.join(releaseDir, 'win-unpacked.tmp');
if (fs.existsSync(winUnpackedTmp)) {
  safeRemoveDir(winUnpackedTmp);
}

// 3. Normalize Portable executable name to AuraSync-Portable.exe (version-agnostic)
try {
  const portableCandidates = fs
    .readdirSync(releaseDir)
    .filter((f) => /\.exe$/i.test(f) && /^AuraSync/i.test(f) && !/setup/i.test(f) && f !== 'AuraSync-Portable.exe');

  for (const name of portableCandidates) {
    const p = path.join(releaseDir, name);
    const target = path.join(releaseDir, 'AuraSync-Portable.exe');
    try {
      const stat = fs.statSync(p);
      // Only accept the full packaged executable (> 50 MB)
      if (stat.size > 50 * 1024 * 1024) {
        if (fs.existsSync(target)) {
          try { fs.unlinkSync(target); } catch {}
        }
        try {
          fs.renameSync(p, target);
          console.log(`Renamed portable to: AuraSync-Portable.exe (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
          break;
        } catch {
          // If rename fails, try copy
          fs.copyFileSync(p, target);
          try { fs.unlinkSync(p); } catch {}
          console.log(`Copied portable to: AuraSync-Portable.exe (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
          break;
        }
      }
    } catch (e) {
      console.warn(`Error processing candidate ${name}:`, e.message);
    }
  }
} catch (e) {
  console.warn('Error normalizing portable executable:', e.message);
}

// 4. Normalize Installer executable name to AuraSync-Setup.exe (version-agnostic)
try {
  const setupCandidates = fs
    .readdirSync(releaseDir)
    .filter((f) => /\.exe$/i.test(f) && /^AuraSync/i.test(f) && /setup/i.test(f) && f !== 'AuraSync-Setup.exe');

  for (const name of setupCandidates) {
    const p = path.join(releaseDir, name);
    const target = path.join(releaseDir, 'AuraSync-Setup.exe');
    try {
      const stat = fs.statSync(p);
      if (stat.size > 50 * 1024 * 1024) {
        if (fs.existsSync(target)) {
          try {
            const targetStat = fs.statSync(target);
            if (targetStat.size < 50 * 1024 * 1024) {
              fs.unlinkSync(target);
              fs.renameSync(p, target);
              console.log(`Replaced stub with full installer: AuraSync-Setup.exe (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
            }
          } catch {}
        } else {
          try {
            fs.renameSync(p, target);
            console.log(`Renamed installer to: AuraSync-Setup.exe (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
          } catch {
            fs.copyFileSync(p, target);
            try { fs.unlinkSync(p); } catch {}
            console.log(`Copied installer to: AuraSync-Setup.exe (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
          }
        }
        break;
      }
    } catch (e) {
      console.warn(`Error processing setup candidate ${name}:`, e.message);
    }
  }
} catch (e) {
  console.warn('Error normalizing setup executable:', e.message);
}

const rootDir = path.resolve(__dirname, '..');
const portableFinal = path.join(releaseDir, 'AuraSync-Portable.exe');
const setupFinal = path.join(releaseDir, 'AuraSync-Setup.exe');
if (fs.existsSync(portableFinal)) {
  try {
    fs.copyFileSync(portableFinal, setupFinal);
    const stat = fs.statSync(setupFinal);
    console.log(`Updated AuraSync-Setup.exe (cloud-shaped installer) (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    const copyWithRetry = (src, dst) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.copyFileSync(src, dst);
          return true;
        } catch (err) {
          if (attempt === 4) throw err;
          const { execSync } = require('child_process');
          try { execSync('powershell -Command "Start-Sleep -Milliseconds 300"', { windowsHide: true }); } catch (_) {}
        }
      }
    };
    try {
      if (fs.existsSync(setupFinal)) {
        copyWithRetry(setupFinal, path.join(rootDir, 'AuraSync-Setup.exe'));
      }
      copyWithRetry(portableFinal, path.join(rootDir, 'AuraSync-Portable.exe'));
      console.log(`Updated root AuraSync-Setup.exe & AuraSync-Portable.exe`);
    } catch (rootCopyErr) {
      console.warn('Could not update root executables (may be in use):', rootCopyErr.message);
    }
  } catch (e) {
    console.warn('Could not finalize setup executables:', e.message);
  }
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

// 5. Automatically publish build to GitHub Releases and optimize local disk space
try {
  console.log('\n🚀 Automatically syncing build with GitHub Releases...');
  const { execFileSync } = require('child_process');
  const ghScript = path.join(__dirname, 'github-release.js');
  if (fs.existsSync(ghScript)) {
    execFileSync(process.execPath, [ghScript], { stdio: 'inherit', windowsHide: true });
  }
} catch (ghErr) {
  console.warn('GitHub release sync notice (non-fatal):', ghErr.message);
}
