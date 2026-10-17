'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn } = require('child_process');

const REPO_OWNER = 'samer20032020-dev';
const REPO_NAME = 'aurasync';

class UpdaterEngine {
  constructor() {
    this.currentVersion = app ? app.getVersion() : '1.7.77';
    this.isChecking = false;
    this.isDownloading = false;
    this.lastCheckResult = null;
  }

  // Parse semver into numeric tuple [major, minor, patch]
  parseSemver(v) {
    if (!v) return [0, 0, 0];
    const clean = String(v).replace(/^v/i, '').trim();
    return clean.split('.').map((n) => parseInt(n, 10) || 0);
  }

  // Compare v1 and v2: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
  compareVersions(v1, v2) {
    const p1 = this.parseSemver(v1);
    const p2 = this.parseSemver(v2);
    for (let i = 0; i < 3; i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  // Fetch JSON from a URL with redirect handling
  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'AuraSync-Desktop-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJson(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub API error: HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON from GitHub API: ' + e.message));
          }
        });
      }).on('error', reject);
    });
  }

  // Check for updates from GitHub Releases
  async checkForUpdates() {
    if (this.isChecking) return this.lastCheckResult;
    this.isChecking = true;
    try {
      let release = null;
      try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest?t=${Date.now()}`;
        release = await this.fetchJson(url);
      } catch (latestErr) {
        // Fallback to releases list if latest returns 404 or fails
        const releasesListUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=1&t=${Date.now()}`;
        const list = await this.fetchJson(releasesListUrl);
        if (Array.isArray(list) && list.length > 0) {
          release = list[0];
        } else {
          throw latestErr;
        }
      }

      if (!release) throw new Error('No release data found on GitHub');

      const latestTag = release.tag_name || release.name || '';
      const cleanLatest = latestTag.replace(/^v/i, '').trim();
      const current = (app ? app.getVersion() : this.currentVersion || '1.7.79').replace(/^v/i, '').trim();

      // Find installer executable asset
      const assets = Array.isArray(release.assets) ? release.assets : [];
      let installerAsset = assets.find((a) =>
        /setup.*\.exe$/i.test(a.name) || /AuraSync.*\.exe$/i.test(a.name)
      );
      if (!installerAsset && assets.length > 0) {
        installerAsset = assets.find((a) => /\.exe$/i.test(a.name));
      }

      const isHigher = this.compareVersions(cleanLatest, current) > 0;
      const updateAvailable = isHigher && !!installerAsset;

      this.lastCheckResult = {
        success: true,
        updateAvailable,
        currentVersion: current,
        latestVersion: cleanLatest,
        releaseName: release.name || latestTag,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
        htmlUrl: release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${latestTag}`,
        downloadUrl: installerAsset ? installerAsset.browser_download_url : null,
        assetName: installerAsset ? installerAsset.name : null,
        assetSizeMB: installerAsset ? (installerAsset.size / 1024 / 1024).toFixed(1) : null
      };
      return this.lastCheckResult;
    } catch (err) {
      console.warn('[UpdaterEngine] Check failed:', err.message);
      this.lastCheckResult = {
        success: false,
        updateAvailable: false,
        currentVersion: (app ? app.getVersion() : this.currentVersion || '1.7.79').replace(/^v/i, '').trim(),
        error: err.message
      };
      return this.lastCheckResult;
    } finally {
      this.isChecking = false;
    }
  }

  // Download and automatically launch the update
  downloadAndInstall(downloadUrl, onProgress) {
    if (this.isDownloading) throw new Error('Download already in progress');
    if (!downloadUrl) throw new Error('No download URL provided');

    this.isDownloading = true;

    return new Promise((resolve, reject) => {
      const tempDir = app.getPath('temp');
      const targetPath = path.join(tempDir, `AuraSync-Update-Setup-${Date.now()}.exe`);
      const fileStream = fs.createWriteStream(targetPath);
      let redirectCount = 0;

      const downloadFile = (fileUrl) => {
        const client = fileUrl.startsWith('https') ? https : http;
        client.get(fileUrl, {
          headers: {
            'User-Agent': 'AuraSync-Desktop-App',
            'Accept': 'application/octet-stream'
          }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            redirectCount++;
            if (redirectCount > 8) {
              fileStream.close();
              try { fs.unlinkSync(targetPath); } catch (_) {}
              this.isDownloading = false;
              return reject(new Error('Too many redirects while downloading update'));
            }
            return downloadFile(res.headers.location);
          }
          if (res.statusCode !== 200) {
            fileStream.close();
            try { fs.unlinkSync(targetPath); } catch (_) {}
            this.isDownloading = false;
            return reject(new Error(`Failed to download update: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
          let downloadedBytes = 0;
          let startTime = Date.now();

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            fileStream.write(chunk);
            if (totalBytes > 0 && typeof onProgress === 'function') {
              const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
              const elapsedSec = (Date.now() - startTime) / 1000 || 1;
              const speedMBs = ((downloadedBytes / 1024 / 1024) / elapsedSec).toFixed(2);
              onProgress({
                percent,
                transferredMB: (downloadedBytes / 1024 / 1024).toFixed(1),
                totalMB: (totalBytes / 1024 / 1024).toFixed(1),
                speedMBs
              });
            }
          });

          res.on('end', () => {
            fileStream.end(async () => {
              this.isDownloading = false;
              console.log(`[UpdaterEngine] Update downloaded to: ${targetPath}`);
              try {
                // Launch installer with --setup and --auto-update for zero-click automatic completion
                const child = spawn(targetPath, ['--setup', '--auto-update'], {
                  detached: true,
                  stdio: 'ignore'
                });
                child.unref();

                // Cleanly quit app after 600ms
                setTimeout(() => {
                  try { app.isQuitting = true; } catch (_) {}
                  app.quit();
                }, 600);
                resolve({ success: true, targetPath });
              } catch (launchErr) {
                reject(launchErr);
              }
            });
          });
        }).on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(targetPath); } catch (_) {}
          this.isDownloading = false;
          reject(err);
        });
      };

      downloadFile(downloadUrl);
    });
  }
}

module.exports = new UpdaterEngine();
