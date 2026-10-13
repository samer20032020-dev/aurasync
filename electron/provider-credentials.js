// Unified provider credentials.
//
// Lets the distributor activate Google Drive / OneDrive / Dropbox for ALL end
// users with a single file. End users then simply click "Connect" and sign in
// with their normal account — no files, no setup.
//
// File name: provider-credentials.json (place it next to the .exe, or in the
// project root during development, or in the app's userData folder).
//
// Shape:
// {
//   "google":   { "client_id": "...", "client_secret": "..." },
//   "onedrive": { "client_id": "...", "tenant": "common" },
//   "dropbox":  { "app_key": "...", "app_secret": "..." }
// }

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE_NAME = 'provider-credentials.json';

function candidatePaths() {
  const list = [];
  try {
    if (app && typeof app.getPath === 'function') {
      list.push(path.join(app.getPath('userData'), FILE_NAME));
    }
  } catch (_) {}
  list.push(path.join(path.dirname(process.execPath || ''), FILE_NAME));
  list.push(path.join(process.cwd(), FILE_NAME));
  list.push(path.join(__dirname, '..', FILE_NAME));
  list.push(path.join(process.resourcesPath || '', 'app', FILE_NAME));
  list.push(path.join(process.resourcesPath || '', FILE_NAME));
  return list;
}

let cache = null;
let cachePath = null;

function loadAll() {
  for (const candidate of candidatePaths()) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        if (cache && cachePath === candidate) return cache;
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        cache = parsed && typeof parsed === 'object' ? parsed : {};
        cachePath = candidate;
        return cache;
      }
    } catch (err) {
      console.error(`Invalid ${FILE_NAME} at ${candidate}:`, err.message);
    }
  }
  return {};
}

function get(section) {
  const all = loadAll();
  const value = all[section];
  return value && typeof value === 'object' ? value : null;
}

function getSourcePath() {
  loadAll();
  return cachePath;
}

// Write/merge a section into the userData copy (used by the in-app activation flow)
function set(section, value) {
  const p = getUserDataPath();
  // Seed from every existing source first so sections already present in the
  // bundled file (next to the exe) are not shadowed by the userData copy.
  let data = {};
  try {
    data = { ...loadAll() };
  } catch (_) {
    data = {};
  }
  try {
    if (fs.existsSync(p)) {
      const local = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (local && typeof local === 'object') data = { ...data, ...local };
    }
  } catch (_) {}
  data[section] = value;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  cache = data;
  cachePath = p;
  return p;
}

function getUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), FILE_NAME);
    }
  } catch (_) {}
  return path.join(process.cwd(), FILE_NAME);
}

module.exports = { get, set, getSourcePath, getUserDataPath, FILE_NAME };
