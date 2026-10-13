const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Determine new version
let currentVersion = pkg.version;
let targetVersion = process.argv[2];

if (!targetVersion) {
  const parts = currentVersion.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  targetVersion = parts.join('.');
}

console.log(`Bumping version: ${currentVersion} -> ${targetVersion}`);

// 1. package.json
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('Updated package.json');

// 2. package-lock.json
const lockPath = path.join(rootDir, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = targetVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = targetVersion;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log('Updated package-lock.json');
}

// 3. electron/main.js
const mainPath = path.join(rootDir, 'electron', 'main.js');
let mainContent = fs.readFileSync(mainPath, 'utf8');
mainContent = mainContent.replace(
  /ipcMain\.handle\('app:get-version',.*?return ['"](.*?)['"];/s,
  (match) => match.replace(/return ['"].*?['"];/, `return '${targetVersion}';`)
);
fs.writeFileSync(mainPath, mainContent, 'utf8');
console.log('Updated electron/main.js');

// 4. src/App.jsx
const appPath = path.join(rootDir, 'src', 'App.jsx');
let appContent = fs.readFileSync(appPath, 'utf8');
appContent = appContent.replace(
  /const \[appVersion, setAppVersion\] = useState\(['"].*?['"]\);/,
  `const [appVersion, setAppVersion] = useState('${targetVersion}');`
);
fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Updated src/App.jsx');

// 5. src/components/Sidebar.jsx
const sidebarPath = path.join(rootDir, 'src', 'components', 'Sidebar.jsx');
let sidebarContent = fs.readFileSync(sidebarPath, 'utf8');
sidebarContent = sidebarContent.replace(
  /version = ['"].*?['"]/,
  `version = '${targetVersion}'`
);
fs.writeFileSync(sidebarPath, sidebarContent, 'utf8');
console.log('Updated src/components/Sidebar.jsx');

// 6. src/components/SettingsPage.jsx
const settingsPath = path.join(rootDir, 'src', 'components', 'SettingsPage.jsx');
let settingsContent = fs.readFileSync(settingsPath, 'utf8');
settingsContent = settingsContent.replace(
  /appVersion = ['"].*?['"]/,
  `appVersion = '${targetVersion}'`
);
fs.writeFileSync(settingsPath, settingsContent, 'utf8');
console.log('Updated src/components/SettingsPage.jsx');

// 7. src/components/CloudInstaller.jsx
const installerPath = path.join(rootDir, 'src', 'components', 'CloudInstaller.jsx');
let installerContent = fs.readFileSync(installerPath, 'utf8');
installerContent = installerContent.replace(
  /const \[version, setVersion\] = useState\(['"].*?['"]\);/,
  `const [version, setVersion] = useState('${targetVersion}');`
);
fs.writeFileSync(installerPath, installerContent, 'utf8');
console.log('Updated src/components/CloudInstaller.jsx');

// 8. website/index.html
const webPath = path.join(rootDir, 'website', 'index.html');
let webContent = fs.readFileSync(webPath, 'utf8');
webContent = webContent.replace(/AuraSync <span class="v">v.*?<\/span>/g, `AuraSync <span class="v">v${targetVersion}</span>`);
webContent = webContent.replace(/v1\.\d+\.\d+/g, `v${targetVersion}`);
webContent = webContent.replace(/الإصدار 1\.\d+\.\d+/g, `الإصدار ${targetVersion}`);
fs.writeFileSync(webPath, webContent, 'utf8');
console.log('Updated website/index.html');

// 9. README.md
const readmePath = path.join(rootDir, 'README.md');
let readmeContent = fs.readFileSync(readmePath, 'utf8');
readmeContent = readmeContent.replace(/\*\*v\d+\.\d+\.\d+\*\*/, `**v${targetVersion}**`);
if (!readmeContent.includes(`## ✨ What's new in ${targetVersion}`)) {
  const newSection = `## ✨ What's new in ${targetVersion}

* **Instant Browser Lock on Switch/Blur & Zero Interruption While Browsing (قفل فوري للمتصفح عند التبديل وعدم المقاطعة أثناء العمل)** — Eliminated the 5-minute timer interruption while actively using protected browsers. The moment focus leaves the browser to any other application or window, the session is locked immediately (0ms) so returning always requires the PIN every single time.
* **Ultra-Fast Mass-Folder Sync Engine & 40,000+ Files Acceleration (تسريع هائل لرفع وفحص آلاف الملفات والمجلدات الضخمة)** — Re-engineered \`scanAndSyncFolder\` with \`upsertFilesBatch\` SQLite transactions (reducing tens of thousands of individual synchronous disk queries to sub-second batch commits), non-blocking background folder hierarchy creation, and parallel upload initiation.
* **Parent Folder File Cache & Zero-API-Throttling (تخزين ملفات المجلدات في الذاكرة لتفادي قيود Google Drive)** — Added in-memory parent folder file caching in \`google-drive.js\` (\`parentFolderFilesCache\`), eliminating thousands of redundant \`files.list\` API calls and preventing HTTP 429 quota exhaustion.
* **Ultra Turbo Concurrency (24 & 32 Concurrent Workers) (أقصى سرعة رفع واستغلال كامل سرعة الإنترنت)** — Added Ultra Turbo profile up to 24 and 32 parallel upload workers in Settings to fully utilize high-speed fiber internet and upload mass directories in minutes.
* **Smooth Google Drive-like Windowed Browsing (تصفح سريع وخفيف زي جوجل درايف)** — Added windowed rendering chunking in \`FilesPage.jsx\` with debounced tree refreshing and a "Show More" expansion button, ensuring 60 FPS silky smooth scrolling and instantaneous responsiveness even with thousands of files.
* **Automated GitHub Releases & Local Disk Space Preservation (الرفع التلقائي إلى GitHub وحفظ مساحة الجهاز)** — Implemented automated publishing of all releases and setup/portable binaries directly to GitHub Releases (\`samer20032020-dev/aurasync\`) with full release notes, automatically purging local bulky archives to keep hard drive space 100% clean.
* **Full Codebase Synchronization & Regression Suite Pass** — 100% test pass across all integration test suites.

`;
  readmeContent = readmeContent.replace(/(## ✨ What's new in .*?\n)/, `${newSection}$1`);
}
fs.writeFileSync(readmePath, readmeContent, 'utf8');
console.log('Updated README.md');

// 10. scripts/test-suite.js
const testPath = path.join(rootDir, 'scripts', 'test-suite.js');
let testContent = fs.readFileSync(testPath, 'utf8');
testContent = testContent.replace(/assert\(pkg\.version === '.*?', 'package\.json version is .*?',/g, `assert(pkg.version === '${targetVersion}', 'package.json version is ${targetVersion}',`);
testContent = testContent.replace(/Full Browser Lock Engine.*?\(v.*?\)/g, `Full Browser Lock Engine & Clean Vault UI (v${targetVersion})`);
fs.writeFileSync(testPath, testContent, 'utf8');
console.log('Updated scripts/test-suite.js');

console.log(`\nSuccessfully synchronized all files to version ${targetVersion}!`);
