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

  // Fetch JSON from a URL with redirect handling and socket timeout
  fetchJson(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'AuraSync-Desktop-App',
          'Accept': 'application/vnd.github.v3+json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      };
      const req = https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.fetchJson(res.headers.location, timeoutMs).then(resolve, reject);
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
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('GitHub API request timed out')));
      req.on('error', reject);
    });
  }

  // Fallback 1: GitHub Web 302 Redirect (Completely free of API rate limits!)
  resolveViaWebRedirect() {
    return new Promise((resolve) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache'
        }
      };
      const req = https.get(`https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const m = res.headers.location.match(/\/tag\/v?([^/?#]+)/i);
          if (m && m[1]) return resolve(m[1].trim());
        }
        resolve(null);
      });
      req.setTimeout(5000, () => req.destroy(new Error('Web redirect timeout')));
      req.on('error', () => resolve(null));
    });
  }

  // Fallback 2: Fastly CDN raw package / version manifest (Zero rate limits!)
  resolveViaRawManifest() {
    return new Promise((resolve) => {
      const options = {
        headers: {
          'User-Agent': 'AuraSync-Desktop-App',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      };
      const req = https.get(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/package.json?t=${Date.now()}`, options, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            resolve(j.version ? String(j.version).trim() : null);
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error('Raw manifest timeout')));
      req.on('error', () => resolve(null));
    });
  }

  // Check for updates from GitHub Releases with 3-tier resilient fallback
  async checkForUpdates() {
    if (this.isChecking) return this.lastCheckResult;
    this.isChecking = true;
    try {
      let release = null;
      let cleanLatest = null;
      let releaseName = '';
      let releaseNotes = '';
      let publishedAt = '';
      let htmlUrl = '';
      let downloadUrl = null;
      let assetName = null;
      let assetSizeMB = '95.6';

      // Tier 1: Try GitHub REST API
      try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest?t=${Date.now()}`;
        release = await this.fetchJson(url, 5000);
      } catch (latestErr) {
        try {
          const releasesListUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=1&t=${Date.now()}`;
          const list = await this.fetchJson(releasesListUrl, 5000);
          if (Array.isArray(list) && list.length > 0) release = list[0];
        } catch (_) {}
      }

      if (release && release.tag_name) {
        const latestTag = release.tag_name || release.name || '';
        cleanLatest = latestTag.replace(/^v/i, '').trim();
        releaseName = release.name || latestTag;
        releaseNotes = release.body || '';
        publishedAt = release.published_at || '';
        htmlUrl = release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${latestTag}`;

        const assets = Array.isArray(release.assets) ? release.assets : [];
        let installerAsset = assets.find((a) => /setup.*\.exe$/i.test(a.name));
        if (!installerAsset) installerAsset = assets.find((a) => /portable.*\.exe$/i.test(a.name));
        if (!installerAsset && assets.length > 0) installerAsset = assets.find((a) => /\.exe$/i.test(a.name));

        if (installerAsset) {
          downloadUrl = installerAsset.browser_download_url;
          assetName = installerAsset.name;
          assetSizeMB = (installerAsset.size / 1024 / 1024).toFixed(1);
        }
      }

      // Tier 2: If GitHub API failed or was rate-limited (HTTP 403), use GitHub Web 302 Redirect
      if (!cleanLatest || !downloadUrl) {
        const webVersion = await this.resolveViaWebRedirect();
        if (webVersion) {
          cleanLatest = webVersion.replace(/^v/i, '').trim();
          releaseName = `AuraSync v${cleanLatest}`;
          htmlUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${cleanLatest}`;
          downloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${cleanLatest}/AuraSync-Setup-v${cleanLatest}.exe`;
          assetName = `AuraSync-Setup-v${cleanLatest}.exe`;
          publishedAt = new Date().toISOString();
        }
      }

      // Tier 3: If Web Redirect also failed, use Fastly Raw Manifest
      if (!cleanLatest || !downloadUrl) {
        const rawVersion = await this.resolveViaRawManifest();
        if (rawVersion) {
          cleanLatest = rawVersion.replace(/^v/i, '').trim();
          releaseName = `AuraSync v${cleanLatest}`;
          htmlUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${cleanLatest}`;
          downloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${cleanLatest}/AuraSync-Setup-v${cleanLatest}.exe`;
          assetName = `AuraSync-Setup-v${cleanLatest}.exe`;
          publishedAt = new Date().toISOString();
        }
      }

      if (!cleanLatest || !downloadUrl) {
        throw new Error('Unable to connect to GitHub release servers across all channels');
      }

      const current = (app ? app.getVersion() : this.currentVersion || '1.7.79').replace(/^v/i, '').trim();
      const isHigher = this.compareVersions(cleanLatest, current) > 0;
      const updateAvailable = isHigher && !!downloadUrl;

      this.lastCheckResult = {
        success: true,
        updateAvailable,
        currentVersion: current,
        latestVersion: cleanLatest,
        releaseName: releaseName || `AuraSync v${cleanLatest}`,
        releaseNotes: releaseNotes || 'تحديث برمجي جديد يتضمن تحسينات فورية واستقرارية عالية للمزامنة والواجهة.',
        publishedAt: publishedAt || '',
        htmlUrl: htmlUrl || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${cleanLatest}`,
        downloadUrl,
        assetName: assetName || `AuraSync-Setup-v${cleanLatest}.exe`,
        assetSizeMB: assetSizeMB || '95.6'
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
            fileStream.on('close', async () => {
              this.isDownloading = false;
              console.log(`[UpdaterEngine] Update downloaded and file descriptor fully closed at: ${targetPath}`);

              // Safety check: verify file size
              try {
                const stat = fs.statSync(targetPath);
                if (stat.size < 1024 * 1024) {
                  throw new Error(`Downloaded installer size too small (${stat.size} bytes)`);
                }
              } catch (statErr) {
                try { fs.unlinkSync(targetPath); } catch (_) {}
                return reject(statErr);
              }

              // Resilient launcher: retries gracefully while antivirus scanner releases its lock
              const launchInstaller = async () => {
                let lastError = null;
                for (let attempt = 1; attempt <= 6; attempt++) {
                  try {
                    // Initial delay of 450ms allows Windows Defender to finish its signature scan on the newly closed .exe
                    await new Promise((r) => setTimeout(r, attempt === 1 ? 450 : 600));

                    // Use Windows Shell via cmd.exe start to handle elevation and sharing locks smoothly
                    const child = spawn('cmd.exe', ['/c', 'start', '""', targetPath, '--setup', '--auto-update'], {
                      detached: true,
                      stdio: 'ignore',
                      windowsHide: true
                    });
                    child.unref();

                    console.log(`[UpdaterEngine] Installer process spawned successfully via Shell on attempt ${attempt}`);
                    return true;
                  } catch (err) {
                    lastError = err;
                    console.warn(`[UpdaterEngine] Launch attempt ${attempt} returned: ${err.message}`);
                  }
                }

                // If cmd.exe start had an issue, fallback to direct spawn
                try {
                  const directChild = spawn(targetPath, ['--setup', '--auto-update'], {
                    detached: true,
                    stdio: 'ignore'
                  });
                  directChild.unref();
                  return true;
                } catch (directErr) {
                  throw lastError || directErr;
                }
              };

              try {
                await launchInstaller();

                // Cleanly quit app after 800ms so the setup installer can update files in place
                setTimeout(() => {
                  try { app.isQuitting = true; } catch (_) {}
                  app.quit();
                }, 800);

                resolve({ success: true, targetPath });
              } catch (launchErr) {
                console.error('[UpdaterEngine] Fatal installer launch error:', launchErr.message);
                reject(launchErr);
              }
            });

            fileStream.end();
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
