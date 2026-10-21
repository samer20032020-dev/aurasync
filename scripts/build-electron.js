/**
 * Isolated Dynamic Electron Builder Pipeline
 * ==========================================
 * Packages Windows executables into a fresh isolated directory on every run,
 * preventing Windows Defender / SmartScreen file locks (EBUSY on app.asar)
 * from ever interrupting or failing the build process.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const timestamp = Date.now();
const targetDir = `build-${timestamp}`;

console.log(`\n🚀 [Build-Electron] Packaging binaries into fresh isolated target: ${targetDir}...`);

try {
  execSync(`npx electron-builder --config.directories.output=${targetDir}`, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true
  });
  console.log(`✅ [Build-Electron] Isolated compilation complete: ${targetDir}\n`);
} catch (err) {
  console.error('❌ [Build-Electron] Error during packaging:', err.message);
  process.exit(1);
}
