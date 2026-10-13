/**
 * AuraSync — GitHub Release Publisher
 * ====================================
 * Automatically creates a GitHub Release and uploads the built executables
 * after every `npm run dist`. Requires a GitHub Personal Access Token
 * stored in the environment variable GITHUB_TOKEN (or a local .env.release file).
 *
 * Usage:
 *   node scripts/github-release.js                  # publishes current version
 *   node scripts/github-release.js --dry-run        # validates without uploading
 *   node scripts/github-release.js --notes "..."    # custom release notes
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT        = path.resolve(__dirname, '..');
const PKG         = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION     = PKG.version;
const TAG         = `v${VERSION}`;
const RELEASE_DIR = path.join(ROOT, 'release');

// Load .env.release if it exists (key=value pairs)
const envFile = path.join(ROOT, '.env.release');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  });
}

const TOKEN       = process.env.GITHUB_TOKEN || '';
const REPO_OWNER  = process.env.GITHUB_OWNER || '';
const REPO_NAME   = process.env.GITHUB_REPO  || '';
const DRY_RUN     = process.argv.includes('--dry-run');

// Parse --notes "..." from CLI
let cliNotes = '';
const notesIdx = process.argv.indexOf('--notes');
if (notesIdx !== -1 && process.argv[notesIdx + 1]) {
  cliNotes = process.argv[notesIdx + 1];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json || raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function uploadAsset(uploadUrl, filePath, token) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const fileData = fs.readFileSync(filePath);

  // Strip template from upload_url:  ...{?name,label}  ->  ...
  const baseUrl = uploadUrl.replace(/\{[^}]+\}/, '');
  const urlObj  = new URL(`${baseUrl}?name=${encodeURIComponent(fileName)}`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/octet-stream',
        'Content-Length': fileSize,
        'User-Agent':    'AuraSync-Release-Script/1.0',
        Accept:          'application/vnd.github+json'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Extract "What's new" section from README.md for this version
// ---------------------------------------------------------------------------
function extractReleaseNotes(version) {
  try {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const escaped = version.replace(/\./g, '\\.');
    const rx = new RegExp(
      `##\\s+✨\\s+What['']s new in ${escaped}([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'
    );
    const m = readme.match(rx);
    if (m && m[1]) return m[1].trim();
  } catch (_) {}
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🚀 AuraSync GitHub Release Publisher`);
  console.log(`   Version : ${VERSION}`);
  console.log(`   Tag     : ${TAG}`);
  console.log(`   Dry-run : ${DRY_RUN}\n`);

  // ── Validate prerequisites ──────────────────────────────────────────────
  if (!TOKEN)      fail('GITHUB_TOKEN is not set.\n   Add it to .env.release or set it as an environment variable.');
  if (!REPO_OWNER) fail('GITHUB_OWNER is not set (e.g. your GitHub username).');
  if (!REPO_NAME)  fail('GITHUB_REPO is not set (e.g. aurasync).');

  // ── Find executables ─────────────────────────────────────────────────────
  const assets = [];
  const candidates = [
    { file: path.join(RELEASE_DIR, 'AuraSync-Setup.exe'),    label: `AuraSync-Setup-${TAG}.exe` },
    { file: path.join(RELEASE_DIR, 'AuraSync-Portable.exe'), label: `AuraSync-Portable-${TAG}.exe` }
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.file)) {
      const sizeMB = (fs.statSync(c.file).size / 1024 / 1024).toFixed(1);
      console.log(`  ✔ Found ${path.basename(c.file)} (${sizeMB} MB) → will upload as ${c.label}`);
      assets.push(c);
    } else {
      console.warn(`  ⚠ Not found: ${c.file} (skipped)`);
    }
  }
  if (assets.length === 0) fail('No executables found in release/. Run `npm run dist` first.');

  if (DRY_RUN) {
    console.log('\n✅ Dry-run complete — no files were uploaded.');
    return;
  }

  // ── Build release notes ──────────────────────────────────────────────────
  const notes = cliNotes || extractReleaseNotes(VERSION) || `AuraSync ${TAG} — automated release.`;

  // ── Create the GitHub Release ────────────────────────────────────────────
  console.log(`\n📝 Creating GitHub Release ${TAG}...`);
  const createRes = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent':   'AuraSync-Release-Script/1.0',
      Accept:         'application/vnd.github+json'
    }
  }, JSON.stringify({
    tag_name:         TAG,
    target_commitish: 'main',
    name:             `AuraSync ${TAG}`,
    body:             notes,
    draft:            false,
    prerelease:       false
  }));

  if (createRes.status === 422 && createRes.body && createRes.body.errors) {
    // Release already exists — fetch it
    console.log(`  ℹ Release ${TAG} already exists, fetching upload URL...`);
    const getRes = await httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent':  'AuraSync-Release-Script/1.0',
        Accept:        'application/vnd.github+json'
      }
    });
    if (getRes.status !== 200) fail(`Could not fetch existing release: ${JSON.stringify(getRes.body)}`);
    createRes.body = getRes.body;
  } else if (createRes.status !== 201) {
    fail(`Failed to create release (HTTP ${createRes.status}): ${JSON.stringify(createRes.body)}`);
  }

  const uploadUrl = createRes.body.upload_url;
  const releaseUrl = createRes.body.html_url;
  console.log(`  ✔ Release created: ${releaseUrl}`);

  // ── Upload assets ────────────────────────────────────────────────────────
  for (const asset of assets) {
    // Temporarily rename file to versioned name for the upload
    const tmpPath = path.join(path.dirname(asset.file), asset.label);
    let useTmp = false;
    if (!fs.existsSync(tmpPath)) {
      fs.copyFileSync(asset.file, tmpPath);
      useTmp = true;
    }
    try {
      console.log(`\n📤 Uploading ${asset.label}...`);
      const res = await uploadAsset(uploadUrl, tmpPath, TOKEN);
      if (res.status === 201) {
        console.log(`  ✔ Uploaded: ${res.body.browser_download_url}`);
      } else {
        console.warn(`  ⚠ Upload returned HTTP ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } finally {
      if (useTmp) {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    }
  }

  console.log(`\n🎉 Release published: ${releaseUrl}\n`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
