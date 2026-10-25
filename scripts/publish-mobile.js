/**
 * AuraSync — Dedicated Mobile Release Pipeline (Android APK)
 * ==========================================================
 * Builds Vite web application distribution, compiles, aligns,
 * signs the native Android APK, and publishes only the mobile release
 * to GitHub Releases without rebuilding desktop binaries.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const mobileVer = pkg.mobileVersion || '1.0.8';

console.log(`\n==================================================`);
console.log(`📱 AuraSync Mobile Release Pipeline v${mobileVer}`);
console.log(`==================================================\n`);

// 1. Build Vite frontend
console.log('⚡ [1/3] Building Vite frontend distribution...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// 2. Build Android APK
console.log('\n📦 [2/3] Building & signing Android APK...');
const apkScript = path.join(__dirname, 'build-android-apk.js');
execFileSync(process.execPath, [apkScript], { stdio: 'inherit' });

// 3. Publish to GitHub Releases (Mobile only)
console.log('\n🚀 [3/3] Publishing Android APK to GitHub Releases...');
const ghScript = path.join(__dirname, 'github-release.js');
execFileSync(process.execPath, [ghScript, '--mobile'], { stdio: 'inherit' });

// 4. Sync version metadata with git origin main
try {
  console.log('\n🔄 [4/4] Syncing version metadata with git origin main...');
  execSync('git add version.json package.json package-lock.json website/index.html src/', { cwd: rootDir, stdio: 'inherit' });
  execSync(`git commit -m "chore(mobile): release v${mobileVer} and sync version metadata"`, { cwd: rootDir, stdio: 'inherit' });
  execSync('git push origin main', { cwd: rootDir, stdio: 'inherit' });
  console.log('✅ Git origin main synced successfully!');
} catch (err) {
  console.log('ℹ️ Git push status:', err.message);
}

console.log(`\n✅ Successfully published AuraSync Mobile v${mobileVer} to GitHub Releases!\n`);

