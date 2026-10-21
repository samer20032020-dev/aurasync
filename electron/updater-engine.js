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
      // 100% Platform Independence: Fetch recent releases and isolate desktop releases
      let releases = [];
      try {
        const list = await this.fetchJson(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=10`);
        if (Array.isArray(list)) releases = list;
      } catch (_) {}

      if (releases.length === 0) {
        try {
          const single = await this.fetchJson(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
          if (single) releases = [single];
        } catch (_) {}
      }

      if (releases.length === 0) {
        throw new Error('No releases found on GitHub');
      }

      // Pick the newest release that contains a Windows desktop installer
      const release = releases.find((r) => {
        const rName = String(r.name || '').toLowerCase();
        const rBody = String(r.body || '').toLowerCase();
        const tag = String(r.tag_name || '').toLowerCase();
        const isMobile =
          rName.includes('[mobile]') ||
          rName.includes('mobile edition') ||
          rName.includes('apk') ||
          rBody.includes('<!-- target: mobile -->') ||
          rBody.includes('تطبيق الهاتف') ||
          tag.startsWith('v1.0.');
        if (isMobile) return false;
        const assets = r.assets || [];
        return assets.some((a) => /\.exe$/i.test(a.name));
      }) || releases[0];

      const latestTag = release.tag_name || release.name || '';
      const cleanLatest = latestTag.replace(/^v/i, '').trim();
      const current = (this.currentVersion || (app ? app.getVersion() : '1.7.77')).replace(/^v/i, '').trim();

      const releaseName = String(release.name || '').toLowerCase();
      const releaseBody = String(release.body || '').toLowerCase();
      const isMobileRelease =
        releaseName.includes('[mobile]') ||
        releaseName.includes('mobile edition') ||
        releaseName.includes('apk') ||
        releaseBody.includes('<!-- target: mobile -->') ||
        releaseBody.includes('تطبيق الهاتف') ||
        latestTag.startsWith('v1.0.');

      // Find installer executable asset for desktop
      const assets = release.assets || [];
      let installerAsset = assets.find((a) =>
        /setup.*\.exe$/i.test(a.name) || /AuraSync.*\.exe$/i.test(a.name)
      );
      if (!installerAsset && assets.length > 0) {
        installerAsset = assets.find((a) => /\.exe$/i.test(a.name));
      }

      let updateAvailable = this.compareVersions(cleanLatest, current) > 0;
      if (isMobileRelease || !installerAsset) {
        updateAvailable = false;
      }

      this.lastCheckResult = {
        success: true,
        updateAvailable,
        isMobileRelease: Boolean(isMobileRelease),
        currentVersion: current,
        latestVersion: cleanLatest,
        releaseName: release.name || latestTag,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
        htmlUrl: release.html_url || '',
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
        currentVersion: this.currentVersion,
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

      const downloadFile = (fileUrl) => {
        const client = fileUrl.startsWith('https') ? https : http;
        client.get(fileUrl, {
          headers: {
            'User-Agent': 'AuraSync-Desktop-App'
          }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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
                // Launch installer with --setup
                const child = spawn(targetPath, ['--setup'], {
                  detached: true,
                  stdio: 'ignore'
                });
                child.unref();

                // Cleanly quit app after 600ms
                setTimeout(() => {
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
