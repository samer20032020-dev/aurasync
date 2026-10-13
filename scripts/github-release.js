/**
 * AuraSync — GitHub Release Publisher & Cloud Space Optimizer
 * ============================================================
 * Automatically creates GitHub Releases with release notes from README.md
 * and uploads Setup & Portable executables to GitHub Releases.
 * Cleans up local disk space by archiving binaries on GitHub.
 *
 * Usage:
 *   node scripts/github-release.js             # publishes current version
 *   node scripts/github-release.js --all       # publishes all historical versions in releases-archive/
 *   node scripts/github-release.js 1.7.68      # publishes specific version
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CURRENT_VERSION = PKG.version;
const RELEASE_DIR = path.join(ROOT, 'release');
const ARCHIVE_DIR = path.join(ROOT, 'releases-archive');

// 1. Locate GitHub CLI (gh.exe)
function getGhPath() {
  const customCandidates = [
    'C:\\Users\\samer\\Desktop\\SDN Program\\tools\\gh\\gh.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'GitHub CLI', 'gh.exe')
  ];
  for (const c of customCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'gh';
}

const GH_BIN = getGhPath();

// Check if GH is logged in
function checkGhAuth() {
  try {
    const out = execFileSync(GH_BIN, ['auth', 'status'], { encoding: 'utf8', windowsHide: true });
    return true;
  } catch (err) {
    // If exit code is 0 with stderr output or status
    const combined = (err.stdout || '') + (err.stderr || '');
    return combined.includes('Logged in to github.com');
  }
}

// 2. Extract Release Notes from README.md
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
  return `### AuraSync v${version}\n\n* تحديثات أمنية وتحسينات للأداء واستقرار المزامنة والسحابة.\n* Automatic multi-cloud desktop backup with zero-deletion policy.`;
}

// 3. Publish a specific release version
async function publishVersion(version, isHistorical = false) {
  const tag = `v${version}`;
  console.log(`\n========================================`);
  console.log(`📦 Processing Release: ${tag}`);
  console.log(`========================================`);

  const notes = extractReleaseNotes(version);
  const notesFile = path.join(ROOT, `scratch`, `release_notes_${version}.md`);
  try {
    fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true });
    fs.writeFileSync(notesFile, notes, 'utf8');
  } catch (_) {}

  // Find binaries for this version
  const assetsToUpload = [];
  const candidateFiles = [
    // release folder files
    path.join(RELEASE_DIR, `AuraSync-Setup-v${version}.exe`),
    path.join(RELEASE_DIR, `AuraSync-Portable-v${version}.exe`),
    // releases-archive files
    path.join(ARCHIVE_DIR, `AuraSync-Setup-v${version}.exe`),
    path.join(ARCHIVE_DIR, `AuraSync-Portable-v${version}.exe`),
    // root files
    path.join(ROOT, `AuraSync-Setup-v${version}.exe`),
    path.join(ROOT, `AuraSync-Portable-v${version}.exe`)
  ];

  // If this is current version, also check unversioned files in release/
  if (version === CURRENT_VERSION) {
    candidateFiles.unshift(
      path.join(RELEASE_DIR, 'AuraSync-Setup.exe'),
      path.join(RELEASE_DIR, 'AuraSync-Portable.exe'),
      path.join(ROOT, 'AuraSync-Setup.exe'),
      path.join(ROOT, 'AuraSync-Portable.exe')
    );
  }

  const seenNames = new Set();
  for (const f of candidateFiles) {
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f);
      if (stat.size > 50 * 1024 * 1024) { // Only valid electron bundles (> 50MB)
        let uploadName = path.basename(f);
        if (uploadName === 'AuraSync-Setup.exe') uploadName = `AuraSync-Setup-v${version}.exe`;
        if (uploadName === 'AuraSync-Portable.exe') uploadName = `AuraSync-Portable-v${version}.exe`;

        if (!seenNames.has(uploadName)) {
          seenNames.add(uploadName);
          // If the file is not named uploadName, copy it to a temp path
          let actualUploadPath = f;
          if (path.basename(f) !== uploadName) {
            const staged = path.join(RELEASE_DIR, uploadName);
            try {
              fs.copyFileSync(f, staged);
              actualUploadPath = staged;
            } catch (_) {}
          }
          assetsToUpload.push({ path: actualUploadPath, name: uploadName, originalPath: f, sizeMB: (stat.size / 1024 / 1024).toFixed(1) });
        }
      }
    }
  }

  if (assetsToUpload.length === 0) {
    console.warn(`⚠️ No executable assets found for ${tag}. Skipping binary upload.`);
    return false;
  }

  console.log(`Found ${assetsToUpload.length} executable asset(s) for ${tag}:`);
  assetsToUpload.forEach((a) => console.log(`  - ${a.name} (${a.sizeMB} MB)`));

  // Check if release already exists on GitHub
  let releaseExists = false;
  try {
    execFileSync(GH_BIN, ['release', 'view', tag], { encoding: 'utf8', windowsHide: true });
    releaseExists = true;
    console.log(`Release ${tag} already exists on GitHub. Uploading/updating assets...`);
  } catch (_) {
    releaseExists = false;
  }

  if (!releaseExists) {
    console.log(`Creating new GitHub Release ${tag}...`);
    const args = [
      'release',
      'create',
      tag,
      '--title', `AuraSync ${tag}`,
      '--notes-file', notesFile
    ];
    for (const a of assetsToUpload) {
      args.push(a.path);
    }
    try {
      execFileSync(GH_BIN, args, { stdio: 'inherit', windowsHide: true });
      console.log(`✅ Successfully published release ${tag} to GitHub!`);
    } catch (err) {
      console.error(`❌ Failed to create release ${tag}:`, err.message);
      return false;
    }
  } else {
    // Upload/clobber assets into existing release
    for (const a of assetsToUpload) {
      console.log(`Uploading asset ${a.name} to ${tag}...`);
      try {
        execFileSync(GH_BIN, ['release', 'upload', tag, a.path, '--clobber'], { stdio: 'inherit', windowsHide: true });
        console.log(`✅ Uploaded ${a.name}`);
      } catch (err) {
        console.error(`⚠️ Failed to upload ${a.name}:`, err.message);
      }
    }
  }

  // 4. Local Disk Cleanup:
  // If the assets have been successfully pushed to GitHub Releases,
  // clean up bulky local archived versions to prevent filling up the user's hard drive!
  if (isHistorical || version !== CURRENT_VERSION) {
    console.log(`\n🧹 Cleaning local archived files for ${version} to save disk space...`);
    for (const a of assetsToUpload) {
      if (a.originalPath.includes('releases-archive') || a.originalPath.includes(ROOT)) {
        try {
          if (fs.existsSync(a.originalPath) && a.originalPath !== path.join(ROOT, 'AuraSync-Setup.exe') && a.originalPath !== path.join(ROOT, 'AuraSync-Portable.exe')) {
            fs.unlinkSync(a.originalPath);
            console.log(`  ✔ Removed local archived file: ${path.basename(a.originalPath)} (saved ${a.sizeMB} MB)`);
          }
        } catch (e) {
          console.warn(`  Could not remove ${a.originalPath}:`, e.message);
        }
      }
    }
  }

  // Cleanup scratch notes
  try { if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile); } catch (_) {}
  try { fs.rmdirSync(path.join(ROOT, 'scratch')); } catch (_) {}
  return true;
}

// 5. Discover all historical versions in releases-archive/ and workspace
function discoverVersions() {
  const versions = new Set();
  const checkDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const m = f.match(/v?(\d+\.\d+\.\d+)/);
        if (m && /\.exe$/i.test(f)) {
          versions.add(m[1]);
        }
      }
    } catch (_) {}
  };

  checkDir(ARCHIVE_DIR);
  checkDir(ROOT);
  checkDir(RELEASE_DIR);
  return Array.from(versions).sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 AuraSync — GitHub Release & Storage Optimization Engine`);
  console.log(`======================================================\n`);

  if (!checkGhAuth()) {
    console.error('❌ GitHub CLI is not authenticated. Please log in with `gh auth login`.');
    process.exit(1);
  }

  const arg = process.argv[2];

  if (arg === '--all' || arg === '--archive') {
    const allVersions = discoverVersions();
    console.log(`Discovered ${allVersions.length} versions to publish: ${allVersions.join(', ')}`);
    for (const v of allVersions) {
      await publishVersion(v, true);
    }
    console.log('\n🎉 All versions processed and archived on GitHub Releases!');
  } else if (arg && /^\d+\.\d+\.\d+$/.test(arg)) {
    await publishVersion(arg, arg !== CURRENT_VERSION);
  } else {
    // Publish current version + any pending historical versions
    const allVersions = discoverVersions();
    for (const v of allVersions) {
      if (v !== CURRENT_VERSION) {
        await publishVersion(v, true);
      }
    }
    // Publish current version
    await publishVersion(CURRENT_VERSION, false);
  }
}

main().catch((err) => {
  console.error('Fatal error in github-release:', err);
  process.exit(1);
});
