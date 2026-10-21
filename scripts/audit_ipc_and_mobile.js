const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('=====================================================');
console.log('🔍 SWARM PARALLEL AUDIT: IPC, BRIDGE & ARCHITECTURE');
console.log('=====================================================\n');

// 1. Audit Electron IPC (Main <-> Preload <-> Frontend)
const mainCode = fs.readFileSync(path.join(rootDir, 'electron', 'main.js'), 'utf8');
const preloadCode = fs.readFileSync(path.join(rootDir, 'electron', 'preload.js'), 'utf8');

const mainHandleRegex = /(?:ipcMain\.handle|register)\(\s*['"]([^'"]+)['"]/g;
const mainOnRegex = /ipcMain\.on\(\s*['"]([^'"]+)['"]/g;
const webContentsSendRegex = /mainWindow\.webContents\.send\(\s*['"]([^'"]+)['"]/g;
const anyWebContentsSendRegex = /webContents\.send\(\s*['"]([^'"]+)['"]/g;

const preloadInvokeRegex = /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g;
const preloadSendRegex = /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g;
const preloadOnRegex = /ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g;

const mainHandles = new Set([...mainCode.matchAll(mainHandleRegex)].map(m => m[1]));
const mainOns = new Set([...mainCode.matchAll(mainOnRegex)].map(m => m[1]));
const mainSends = new Set([
  ...[...mainCode.matchAll(webContentsSendRegex)].map(m => m[1]),
  ...[...mainCode.matchAll(anyWebContentsSendRegex)].map(m => m[1])
]);

const preloadInvokes = new Set([...preloadCode.matchAll(preloadInvokeRegex)].map(m => m[1]));
const preloadSends = new Set([...preloadCode.matchAll(preloadSendRegex)].map(m => m[1]));
const preloadOns = new Set([...preloadCode.matchAll(preloadOnRegex)].map(m => m[1]));

console.log(`[DESKTOP IPC] Found ${mainHandles.size} main.handle/register, ${mainOns.size} main.on, ${mainSends.size} webContents.send`);
console.log(`[PRELOAD IPC] Found ${preloadInvokes.size} preload.invoke, ${preloadSends.size} preload.send, ${preloadOns.size} preload.on\n`);

// Check Preload invokes that have no handler in main
const missingMainHandles = [];
for (const ch of preloadInvokes) {
  if (!mainHandles.has(ch)) {
    missingMainHandles.push(ch);
  }
}
if (missingMainHandles.length > 0) {
  console.error('❌ CRITICAL: Preload invokes channel with NO main.handle:', missingMainHandles);
} else {
  console.log('✅ ALL Preload invoke channels are registered in electron/main.js!');
}

// Check Preload sends that have no handler in main
const missingMainOns = [];
for (const ch of preloadSends) {
  if (!mainOns.has(ch)) {
    missingMainOns.push(ch);
  }
}
if (missingMainOns.length > 0) {
  console.error('❌ CRITICAL: Preload sends channel with NO main.on:', missingMainOns);
} else {
  console.log('✅ ALL Preload send channels are registered in electron/main.js!');
}

// 2. Audit Frontend (src/) API usage against Preload exposed methods
const preloadMethods = new Set();
const apiMethodRegex = /^\s*([a-zA-Z0-9_]+)\s*:\s*(?:\([^)]*\)|function|\()/gm;
let m;
while ((m = apiMethodRegex.exec(preloadCode)) !== null) {
  preloadMethods.add(m[1]);
}
console.log(`\n[PRELOAD API] Found ${preloadMethods.size} exposed methods on window.electronAPI`);

function getFiles(dir, exts = ['.js', '.jsx']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFiles(fullPath, exts));
    } else if (exts.includes(path.extname(item.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcFiles = getFiles(path.join(rootDir, 'src'));
const frontendCalledMethods = new Map();
const missingMethods = [];

const electronApiCallRegex = /(?:window\.)?electronAPI\.([a-zA-Z0-9_]+)\s*\(/g;
for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = electronApiCallRegex.exec(content)) !== null) {
    const method = match[1];
    if (!frontendCalledMethods.has(method)) {
      frontendCalledMethods.set(method, []);
    }
    frontendCalledMethods.get(method).push(path.relative(rootDir, file));
    if (!preloadMethods.has(method)) {
      missingMethods.push({ method, file: path.relative(rootDir, file) });
    }
  }
}

console.log(`[FRONTEND CALLS] Found ${frontendCalledMethods.size} unique electronAPI methods called in src/`);
if (missingMethods.length > 0) {
  console.error('❌ CRITICAL: Frontend calls electronAPI methods that DO NOT EXIST in preload.js:');
  console.table(missingMethods);
} else {
  console.log('✅ ALL Frontend electronAPI calls MATCH preload.js!');
}

// 3. Audit Mobile Native Bridge (MainActivity.java <-> Mobile Frontend)
console.log('\n=====================================================');
console.log('📱 MOBILE NATIVE BRIDGE AUDIT: Java <-> React');
console.log('=====================================================');

const javaPath = path.join(rootDir, 'mobile', 'android', 'src', 'com', 'aurasync', 'mobile', 'MainActivity.java');
let javaCode = '';
if (fs.existsSync(javaPath)) {
  javaCode = fs.readFileSync(javaPath, 'utf8');
  console.log('Found Android MainActivity.java at:', path.relative(rootDir, javaPath));
} else {
  console.error('❌ MainActivity.java not found!');
}

const javaBridgeMethods = new Set();
const jsInterfaceRegex = /@JavascriptInterface\s+public\s+[a-zA-Z0-9_<>[\]]+\s+([a-zA-Z0-9_]+)\s*\(/g;
let jm;
while ((jm = jsInterfaceRegex.exec(javaCode)) !== null) {
  javaBridgeMethods.add(jm[1]);
}
console.log(`[ANDROID JAVA BRIDGE] Found ${javaBridgeMethods.size} @JavascriptInterface methods in MainActivity.java:`, [...javaBridgeMethods]);

const mobileFiles = getFiles(path.join(rootDir, 'src', 'components', 'mobile'));
const mobileCalls = new Map();
const missingJavaMethods = [];

const mobileBridgeRegex = /(?:window\.)?AuraSyncAndroid\.([a-zA-Z0-9_]+)\s*\(/g;
for (const file of mobileFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = mobileBridgeRegex.exec(content)) !== null) {
    const method = match[1];
    if (!mobileCalls.has(method)) {
      mobileCalls.set(method, []);
    }
    mobileCalls.get(method).push(path.relative(rootDir, file));
    if (!javaBridgeMethods.has(method)) {
      missingJavaMethods.push({ method, file: path.relative(rootDir, file) });
    }
  }
}

console.log(`[MOBILE FRONTEND] Found ${mobileCalls.size} AuraSyncAndroid calls in mobile components:`, [...mobileCalls.keys()]);
if (missingJavaMethods.length > 0) {
  console.error('❌ CRITICAL: Mobile frontend calls Java methods that DO NOT EXIST in MainActivity.java:');
  console.table(missingJavaMethods);
} else {
  console.log('✅ ALL Mobile bridge calls MATCH Java @JavascriptInterface implementations!');
}

console.log('\n=====================================================');
console.log('🎉 AUDIT COMPLETE');
console.log('=====================================================');
