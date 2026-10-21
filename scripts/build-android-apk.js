/**
 * AuraSync — Native Android Mobile APK Packaging Engine
 * ======================================================
 * Compiles, links, aligns, and cryptographically signs
 * the native AuraSync Mobile Android APK package (v1.7.x)
 * directly using the local Android SDK & JDK 17.
 *
 * Outputs:
 *   - release/AuraSync.apk
 *   - release/AuraSync-v<version>.apk
 *   - AuraSync.apk (project root)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

function getShortPath(p) {
  try {
    return execSync(`cmd.exe /c "for %I in (\"${p}\") do @echo %~sI"`, { encoding: 'utf8', windowsHide: true }).trim();
  } catch (_) {
    return p;
  }
}

const ROOT_DIR = path.resolve(__dirname, '..');
const SHORT_ROOT = getShortPath(ROOT_DIR);
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const PKG = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const VERSION = PKG.mobileVersion || '1.0.5';

// Parse numeric version code (e.g., "1.7.94" -> 10794)
function computeVersionCode(verStr) {
  const parts = verStr.split('.').map((p) => parseInt(p, 10) || 0);
  const major = parts[0] || 1;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}
const VERSION_CODE = computeVersionCode(VERSION);

console.log(`\n==================================================`);
console.log(`📱 AuraSync Android Mobile APK Builder v${VERSION} (Code: ${VERSION_CODE})`);
console.log(`==================================================`);

// 1. Detect Java Home & Tools
function getJavaTools() {
  const candidates = [
    process.env.JAVA_HOME,
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.8-hotspot',
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Java\\jdk-21'
  ].filter(Boolean);

  let javaHome = null;
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'bin', 'javac.exe'))) {
      javaHome = c;
      break;
    }
  }

  if (!javaHome) {
    throw new Error('Fatal: JDK 17 (javac.exe) not found on system.');
  }

  return {
    javaHome,
    javac: path.join(javaHome, 'bin', 'javac.exe'),
    jar: path.join(javaHome, 'bin', 'jar.exe'),
    keytool: path.join(javaHome, 'bin', 'keytool.exe')
  };
}

// 2. Detect Android SDK & Tools
function getAndroidTools() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    'C:\\Users\\samer\\AppData\\Local\\Android\\Sdk'
  ].filter(Boolean);

  let sdkRoot = null;
  for (const r of sdkRoots) {
    if (fs.existsSync(r)) {
      sdkRoot = r;
      break;
    }
  }

  if (!sdkRoot) {
    throw new Error('Fatal: Android SDK directory not found.');
  }

  // Find build tools (prefer 35.0.0 or 34.0.0)
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  const availableVersions = fs.existsSync(buildToolsDir) ? fs.readdirSync(buildToolsDir).sort().reverse() : [];
  if (availableVersions.length === 0) {
    throw new Error('Fatal: No Android build-tools found in ' + buildToolsDir);
  }
  const chosenVersion = availableVersions[0];
  const buildTools = path.join(buildToolsDir, chosenVersion);

  // Find android.jar (prefer android-34 or 35)
  const platformsDir = path.join(sdkRoot, 'platforms');
  const platforms = fs.existsSync(platformsDir) ? fs.readdirSync(platformsDir).sort().reverse() : [];
  if (platforms.length === 0) {
    throw new Error('Fatal: No Android platforms found in ' + platformsDir);
  }
  const chosenPlatform = platforms.find((p) => p.includes('34')) || platforms[0];
  const androidJar = path.join(platformsDir, chosenPlatform, 'android.jar');

  return {
    sdkRoot,
    buildTools,
    androidJar,
    aapt2: path.join(buildTools, 'aapt2.exe'),
    d8: path.join(buildTools, 'd8.bat'),
    zipalign: path.join(buildTools, 'zipalign.exe'),
    apksigner: path.join(buildTools, 'apksigner.bat')
  };
}

const javaTools = getJavaTools();
const androidTools = getAndroidTools();
console.log(`Java JDK: ${javaTools.javaHome}`);
console.log(`Android SDK Build-Tools: ${androidTools.buildTools}`);
console.log(`Android Target JAR: ${androidTools.androidJar}`);

const ENV = {
  ...process.env,
  JAVA_HOME: javaTools.javaHome,
  PATH: `${path.join(javaTools.javaHome, 'bin')};${process.env.PATH}`
};

// 3. Ensure Release Keystore exists
const KS_PATH = path.join(SHORT_ROOT, 'mobile', 'release.keystore');
if (!fs.existsSync(KS_PATH)) {
  console.log('Generating cryptographic release keystore...');
  fs.mkdirSync(path.dirname(KS_PATH), { recursive: true });
  execFileSync(javaTools.keytool, [
    '-genkeypair', '-v',
    '-keystore', KS_PATH,
    '-alias', 'aurasync',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', 'aurasync123',
    '-keypass', 'aurasync123',
    '-dname', 'CN=AuraSync, OU=Mobile, O=AuraSync, L=Global, ST=Cloud, C=US'
  ], { stdio: 'inherit' });
}

// 4. Prepare Staging Build Directory
const STAGING = path.join(SHORT_ROOT, 'mobile-build-stage');
if (fs.existsSync(STAGING)) {
  try { fs.rmSync(STAGING, { recursive: true, force: true }); } catch (_) {}
}
fs.mkdirSync(path.join(STAGING, 'src', 'com', 'aurasync', 'mobile'), { recursive: true });
fs.mkdirSync(path.join(STAGING, 'classes'), { recursive: true });
fs.mkdirSync(path.join(STAGING, 'bin'), { recursive: true });
fs.mkdirSync(path.join(STAGING, 'res', 'values'), { recursive: true });
fs.mkdirSync(path.join(STAGING, 'res', 'drawable'), { recursive: true });
fs.mkdirSync(path.join(STAGING, 'assets', 'www'), { recursive: true });

// Copy App Icons
const iconSrc = path.join(SHORT_ROOT, 'icon.png');
fs.copyFileSync(iconSrc, path.join(STAGING, 'res', 'drawable', 'ic_launcher.png'));
fs.copyFileSync(iconSrc, path.join(STAGING, 'res', 'drawable', 'ic_launcher_round.png'));

// Write strings.xml
fs.writeFileSync(path.join(STAGING, 'res', 'values', 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">AuraSync</string>
</resources>`, 'utf8');

// Write styles.xml
fs.writeFileSync(path.join(STAGING, 'res', 'values', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">
        <item name="android:windowBackground">@android:color/black</item>
        <item name="android:statusBarColor">#090a0f</item>
        <item name="android:navigationBarColor">#090a0f</item>
    </style>
</resources>`, 'utf8');

// 5. Prepare AndroidManifest.xml with updated versioning
const manifestTemplate = path.join(ROOT_DIR, 'mobile', 'android', 'AndroidManifest.xml');
let manifestContent = fs.readFileSync(manifestTemplate, 'utf8');
manifestContent = manifestContent.replace(
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
  `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    android:versionCode="${VERSION_CODE}"
    android:versionName="${VERSION}"`
);
manifestContent = manifestContent.replace(/@mipmap\/ic_launcher/g, '@drawable/ic_launcher');
manifestContent = manifestContent.replace(/@mipmap\/ic_launcher_round/g, '@drawable/ic_launcher_round');
manifestContent = manifestContent.replace(/android:theme=".*?"/, 'android:theme="@style/AppTheme"');

fs.writeFileSync(path.join(STAGING, 'AndroidManifest.xml'), manifestContent, 'utf8');

// 6. Copy Vite web application assets from dist/ to assets/www/
const distDir = path.join(ROOT_DIR, 'dist');
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('Building Vite web application first...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
}

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dst, file));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}
copyRecursive(distDir, path.join(STAGING, 'assets', 'www'));
console.log('Injected Vite web app distribution into Android assets/www.');

// 7. Copy Java source files
const mainActivitySrc = path.join(ROOT_DIR, 'mobile', 'android', 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java');
const mainActivityDst = path.join(STAGING, 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java');
fs.copyFileSync(mainActivitySrc, mainActivityDst);

// 8. Compile Java sources with javac
console.log('Compiling Java native source code with javac...');
execFileSync(javaTools.javac, [
  '-cp', androidTools.androidJar,
  '-d', path.join(STAGING, 'classes'),
  '-encoding', 'UTF-8',
  '-source', '1.8',
  '-target', '1.8',
  mainActivityDst
], { stdio: 'inherit', env: ENV });

// 9. Convert compiled .class files to DEX bytecode with d8
console.log('Converting Java classes to Dalvik Executable (classes.dex) with d8...');
const classFiles = [
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity.class'),
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity$AuraSyncAndroidBridge.class'),
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity$AuraSyncAndroidBridge$1.class'),
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity$1.class'),
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity$2.class'),
  path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', 'MainActivity$3.class')
].filter(fs.existsSync);

// If there are other inner classes generated by javac, include all in that folder
const allClassFiles = fs.readdirSync(path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile'))
  .filter((f) => f.endsWith('.class'))
  .map((f) => path.join(STAGING, 'classes', 'com', 'aurasync', 'mobile', f));

execFileSync('cmd.exe', [
  '/c', androidTools.d8,
  '--output', path.join(STAGING, 'bin'),
  '--lib', androidTools.androidJar,
  '--min-api', '24',
  ...allClassFiles
], { stdio: 'inherit', env: ENV });

// 10. Compile resources with aapt2
console.log('Compiling Android resources with aapt2...');
const resZip = path.join(STAGING, 'res.zip');
execFileSync(androidTools.aapt2, [
  'compile',
  '--dir', path.join(STAGING, 'res'),
  '-o', resZip
], { stdio: 'inherit' });

// 11. Link APK with aapt2
console.log('Linking base APK package with aapt2...');
const unalignedApk = path.join(STAGING, 'bin', 'unaligned.apk');
execFileSync(androidTools.aapt2, [
  'link',
  '-I', androidTools.androidJar,
  '--manifest', path.join(STAGING, 'AndroidManifest.xml'),
  '--min-sdk-version', '24',
  '--target-sdk-version', '34',
  '-o', unalignedApk,
  resZip,
  '--auto-add-overlay'
], { stdio: 'inherit' });

// 12. Add classes.dex and web assets into APK using jar
console.log('Adding classes.dex bytecode to APK package...');
execFileSync(javaTools.jar, [
  'uf', unalignedApk,
  '-C', path.join(STAGING, 'bin'),
  'classes.dex'
], { stdio: 'inherit', env: ENV });

console.log('Adding web assets into APK package with UNIX forward slashes...');
execFileSync(javaTools.jar, [
  'uf', unalignedApk,
  '-C', STAGING,
  'assets'
], { stdio: 'inherit', env: ENV });

// 13. Align APK with zipalign (4-byte alignment)
console.log('Aligning APK package boundaries with zipalign...');
const alignedApk = path.join(STAGING, 'bin', 'aligned.apk');
if (fs.existsSync(alignedApk)) fs.unlinkSync(alignedApk);
execFileSync(androidTools.zipalign, [
  '-p', '-f', '4',
  unalignedApk,
  alignedApk
], { stdio: 'inherit' });

// 14. Sign APK with apksigner (v1, v2, and v3 schemes)
console.log('Cryptographically signing APK with apksigner...');
const signedApk = path.join(STAGING, 'bin', 'AuraSync-release.apk');
if (fs.existsSync(signedApk)) fs.unlinkSync(signedApk);

execFileSync('cmd.exe', [
  '/c', androidTools.apksigner, 'sign',
  '--ks', KS_PATH,
  '--ks-pass', 'pass:aurasync123',
  '--ks-key-alias', 'aurasync',
  '--key-pass', 'pass:aurasync123',
  '--out', signedApk,
  alignedApk
], { stdio: 'inherit', env: ENV });

// 15. Verify cryptographic signatures
console.log('Verifying APK signature status...');
execFileSync('cmd.exe', [
  '/c', androidTools.apksigner, 'verify',
  '--verbose',
  signedApk
], { stdio: 'inherit', env: ENV });

// 16. Deploy output APK to release/, release/mobile/, and root directories
const releaseDir = path.join(ROOT_DIR, 'release');
const mobileReleaseDir = path.join(releaseDir, 'mobile');
fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(mobileReleaseDir, { recursive: true });

const targetReleaseDefault = path.join(releaseDir, 'AuraSync.apk');
const targetReleaseVersioned = path.join(releaseDir, `AuraSync-v${VERSION}.apk`);
const targetMobileDefault = path.join(mobileReleaseDir, 'AuraSync.apk');
const targetMobileVersioned = path.join(mobileReleaseDir, `AuraSync-v${VERSION}.apk`);
const targetRootDefault = path.join(ROOT_DIR, 'AuraSync.apk');

fs.copyFileSync(signedApk, targetReleaseDefault);
fs.copyFileSync(signedApk, targetReleaseVersioned);
fs.copyFileSync(signedApk, targetMobileDefault);
fs.copyFileSync(signedApk, targetMobileVersioned);
fs.copyFileSync(signedApk, targetRootDefault);

const finalStat = fs.statSync(targetReleaseDefault);
const finalSizeMB = (finalStat.size / (1024 * 1024)).toFixed(2);

console.log(`\n==================================================`);
console.log(`✅ AuraSync Mobile Android APK Successfully Built!`);
console.log(`📦 Version: v${VERSION} (Code: ${VERSION_CODE})`);
console.log(`📁 Outputs:`);
console.log(`   - ${targetMobileVersioned} (${finalSizeMB} MB)`);
console.log(`   - ${targetReleaseVersioned} (${finalSizeMB} MB)`);
console.log(`   - ${targetRootDefault} (${finalSizeMB} MB)`);
console.log(`==================================================\n`);

// 17. Clean up staging directory to preserve disk space
try {
  fs.rmSync(STAGING, { recursive: true, force: true });
} catch (_) {}

module.exports = {
  version: VERSION,
  versionCode: VERSION_CODE,
  apkPath: targetReleaseDefault,
  versionedApkPath: targetReleaseVersioned,
  sizeMB: finalSizeMB
};
