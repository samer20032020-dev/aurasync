const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function bumpPatch(ver) {
  const parts = String(ver || '1.0.0').split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join('.');
}

const args = process.argv.slice(2);
const isMobileOnly = args.includes('--mobile') || args.includes('-m');
const isDesktopOnly = args.includes('--desktop') || args.includes('-d');
const explicitVersion = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));

let targetDesktop = pkg.version;
let targetMobile = pkg.mobileVersion || '1.0.8';

if (isMobileOnly) {
  targetMobile = explicitVersion || bumpPatch(targetMobile);
} else if (isDesktopOnly) {
  targetDesktop = explicitVersion || bumpPatch(targetDesktop);
} else if (args[0] && /^\d+\.\d+\.\d+$/.test(args[0])) {
  targetDesktop = args[0];
  if (args[1] && /^\d+\.\d+\.\d+$/.test(args[1])) {
    targetMobile = args[1];
  }
} else {
  targetDesktop = bumpPatch(targetDesktop);
  targetMobile = bumpPatch(targetMobile);
}

const updateDesktop = !isMobileOnly;
const updateMobile = !isDesktopOnly;

console.log(`\n======================================================`);
console.log(`🔄 AuraSync Independent Platform Version Manager`);
console.log(`======================================================`);
console.log(`Mode: ${isMobileOnly ? '📱 MOBILE ONLY' : isDesktopOnly ? '💻 DESKTOP ONLY' : '🌐 FULL CODEBASE'}`);
console.log(`Target Desktop : ${targetDesktop} (${updateDesktop ? 'UPDATING' : 'UNCHANGED'})`);
console.log(`Target Mobile  : ${targetMobile} (${updateMobile ? 'UPDATING' : 'UNCHANGED'})`);
console.log(`======================================================\n`);

// 1. package.json
if (updateDesktop) pkg.version = targetDesktop;
if (updateMobile) pkg.mobileVersion = targetMobile;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('Updated package.json');

// 2. package-lock.json
if (updateDesktop) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = targetDesktop;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = targetDesktop;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
    console.log('Updated package-lock.json');
  }
}

// 3. electron/main.js
if (updateDesktop) {
  const mainPath = path.join(rootDir, 'electron', 'main.js');
  let mainContent = fs.readFileSync(mainPath, 'utf8');
  mainContent = mainContent.replace(
    /ipcMain\.handle\('app:get-version',.*?return ['"](.*?)['"];/s,
    (match) => match.replace(/return ['"].*?['"];/, `return '${targetDesktop}';`)
  );
  fs.writeFileSync(mainPath, mainContent, 'utf8');
  console.log('Updated electron/main.js');
}

// 4. src/App.jsx
const appPath = path.join(rootDir, 'src', 'App.jsx');
let appContent = fs.readFileSync(appPath, 'utf8');
if (updateDesktop) {
  appContent = appContent.replace(
    /const \[appVersion, setAppVersion\] = useState\(['"].*?['"]\);/,
    `const [appVersion, setAppVersion] = useState('${targetDesktop}');`
  );
}
if (updateMobile) {
  appContent = appContent.replace(
    /<MobileApp\s+version=['"].*?['"]/,
    `<MobileApp\n            version="${targetMobile}"`
  );
}
fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Updated src/App.jsx');

// 5. Desktop components
if (updateDesktop) {
  const sidebarPath = path.join(rootDir, 'src', 'components', 'Sidebar.jsx');
  let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
  sidebarContent = sidebarContent.replace(/version = ['"].*?['"]/, `version = '${targetDesktop}'`);
  fs.writeFileSync(sidebarPath, sidebarContent, 'utf8');
  console.log('Updated src/components/Sidebar.jsx');

  const settingsPath = path.join(rootDir, 'src', 'components', 'SettingsPage.jsx');
  let settingsContent = fs.readFileSync(settingsPath, 'utf8');
  settingsContent = settingsContent.replace(/appVersion = ['"].*?['"]/, `appVersion = '${targetDesktop}'`);
  fs.writeFileSync(settingsPath, settingsContent, 'utf8');
  console.log('Updated src/components/SettingsPage.jsx');

  const installerPath = path.join(rootDir, 'src', 'components', 'CloudInstaller.jsx');
  let installerContent = fs.readFileSync(installerPath, 'utf8');
  installerContent = installerContent.replace(
    /const \[version, setVersion\] = useState\(['"].*?['"]\);/,
    `const [version, setVersion] = useState('${targetDesktop}');`
  );
  fs.writeFileSync(installerPath, installerContent, 'utf8');
  console.log('Updated src/components/CloudInstaller.jsx');
}

// 6. Mobile Components
if (updateMobile) {
  const mobileAppPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileApp.jsx');
  if (fs.existsSync(mobileAppPath)) {
    let mobileAppContent = fs.readFileSync(mobileAppPath, 'utf8');
    mobileAppContent = mobileAppContent.replace(/version = ['"].*?['"]/, `version = '${targetMobile}'`);
    fs.writeFileSync(mobileAppPath, mobileAppContent, 'utf8');
    console.log('Updated src/components/mobile/MobileApp.jsx');
  }

  const mobileSettingsPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileSettings.jsx');
  if (fs.existsSync(mobileSettingsPath)) {
    let mobileSettingsContent = fs.readFileSync(mobileSettingsPath, 'utf8');
    mobileSettingsContent = mobileSettingsContent.replace(/version = ['"].*?['"]/, `version = '${targetMobile}'`);
    fs.writeFileSync(mobileSettingsPath, mobileSettingsContent, 'utf8');
    console.log('Updated src/components/mobile/MobileSettings.jsx');
  }

  const mobileHomePath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileHome.jsx');
  if (fs.existsSync(mobileHomePath)) {
    let mobileHomeContent = fs.readFileSync(mobileHomePath, 'utf8');
    mobileHomeContent = mobileHomeContent.replace(/version = ['"].*?['"]/, `version = '${targetMobile}'`);
    fs.writeFileSync(mobileHomePath, mobileHomeContent, 'utf8');
    console.log('Updated src/components/mobile/MobileHome.jsx');
  }

  const mobileLoginPath = path.join(rootDir, 'src', 'components', 'mobile', 'MobileCloudLogin.jsx');
  if (fs.existsSync(mobileLoginPath)) {
    let mobileLoginContent = fs.readFileSync(mobileLoginPath, 'utf8');
    mobileLoginContent = mobileLoginContent.replace(/version = ['"].*?['"]/, `version = '${targetMobile}'`);
    fs.writeFileSync(mobileLoginPath, mobileLoginContent, 'utf8');
    console.log('Updated src/components/mobile/MobileCloudLogin.jsx');
  }
}

// 7. website/index.html
const webPath = path.join(rootDir, 'website', 'index.html');
let webContent = fs.readFileSync(webPath, 'utf8');
if (updateDesktop) {
  webContent = webContent.replace(/id="navVersionBadge">v.*?<\/span>/g, `id="navVersionBadge">v${targetDesktop}</span>`);
  webContent = webContent.replace(/AuraSync <span class="v">v.*?<\/span>/g, `AuraSync <span class="v">v${targetDesktop}</span>`);
  webContent = webContent.replace(/v1\.7\.\d+/g, `v${targetDesktop}`);
  webContent = webContent.replace(/الإصدار 1\.7\.\d+/g, `الإصدار ${targetDesktop}`);
}
if (updateMobile) {
  webContent = webContent.replace(/AuraSync\.apk \(v.*?\)/g, `AuraSync.apk (v${targetMobile})`);
}
fs.writeFileSync(webPath, webContent, 'utf8');
console.log('Updated website/index.html');

// 8. README.md (Desktop)
if (updateDesktop) {
  const readmePath = path.join(rootDir, 'README.md');
  let readmeContent = fs.readFileSync(readmePath, 'utf8');
  readmeContent = readmeContent.replace(/\*\*v\d+\.\d+\.\d+\*\*/, `**v${targetDesktop}**`);
  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  console.log('Updated README.md');
}

// 9. scripts/test-suite.js (Desktop)
if (updateDesktop) {
  const testPath = path.join(rootDir, 'scripts', 'test-suite.js');
  let testContent = fs.readFileSync(testPath, 'utf8');
  testContent = testContent.replace(/assert\(pkg\.version === '.*?', 'package\.json version is .*?',/g, `assert(pkg.version === '${targetDesktop}', 'package.json version is ${targetDesktop}',`);
  testContent = testContent.replace(/assert\(pkgJsonRaw\.version === '.*?', 'package\.json version matches .*?'\);/g, `assert(pkgJsonRaw.version === '${targetDesktop}', 'package.json version matches ${targetDesktop}');`);
  fs.writeFileSync(testPath, testContent, 'utf8');
  console.log('Updated scripts/test-suite.js');
}

// 10. version.json (Fast CDN release manifest)
const versionJsonPath = path.join(rootDir, 'version.json');
const versionJsonContent = {
  version: targetDesktop,
  desktopVersion: targetDesktop,
  mobileVersion: targetMobile,
  independentPlatforms: true,
  name: `AuraSync Desktop v${targetDesktop} / Mobile v${targetMobile}`,
  updated_at: new Date().toISOString(),
  downloadUrl: `https://github.com/samer20032020-dev/aurasync/releases/download/v${targetDesktop}/AuraSync-Setup-v${targetDesktop}.exe`,
  portableUrl: `https://github.com/samer20032020-dev/aurasync/releases/download/v${targetDesktop}/AuraSync-Portable-v${targetDesktop}.exe`,
  apkUrl: `https://github.com/samer20032020-dev/aurasync/releases/download/v${targetMobile}/AuraSync-v${targetMobile}.apk`
};
fs.writeFileSync(versionJsonPath, JSON.stringify(versionJsonContent, null, 2) + '\n', 'utf8');
console.log('Updated version.json');

console.log(`\n🎉 Platform sync complete: Desktop = ${targetDesktop}, Mobile = ${targetMobile}!`);
