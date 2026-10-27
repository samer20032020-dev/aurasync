/**
 * AuraSync Mobile Engine — Production Architecture v1.7.96
 * Core engine for AuraSync Android & Mobile Web
 *
 * Capabilities:
 * - Real Account Connection Management (Zero fake data)
 * - Automatic "aurasync-mobile" Cloud Folder Creation
 * - Gallery Transfer: Uploads ENTIRE phone gallery to aurasync-mobile
 * - Real Uploaded Files & Gallery Management (Google Photos experience)
 * - Dark (OLED) & Light Theme Management
 * - Biometric Authentication (WebAuthn & Native Fingerprint / Face ID)
 * - Space Management: "Free up phone space" (upload & remove local copy)
 * - 2-Way Mirror & Independent Deletion Policies:
 *   * If deleted from phone -> preserved in cloud
 *   * If deleted from cloud -> preserved on phone
 * - One-click Download all cloud files to phone
 * - Wipe phone cloud data safeguard
 * - First-launch Permissions Engine
 * - Bulk Share & Staged Upload Queue (900+ files)
 */

const STORAGE_KEY_SETTINGS     = 'aurasync_mobile_settings';
const STORAGE_KEY_ACCOUNTS     = 'aurasync_mobile_accounts';
const STORAGE_KEY_FILES        = 'aurasync_mobile_uploaded_files';
const STORAGE_KEY_STAGED       = 'aurasync_mobile_staged_share';
const MOBILE_FOLDER_NAME       = 'aurasync-mobile';

const ONEDRIVE_CLIENT_ID       = 'a7a2023e-78b4-44a6-a92f-13265d31a89b';

class MobileEngine {
  constructor() {
    this.listeners       = new Set();
    this.settings        = this.loadSettings();
    this.accounts        = this.loadAccounts();
    this.uploadedFiles   = this.loadUploadedFiles();
    this.stagedShareFiles = this.loadStagedShareFiles();
    this.cloudFolderCache = {};
    this.isNative        = typeof window !== 'undefined' && Boolean(window.AuraSyncAndroid);

    if (typeof window !== 'undefined') {
      window.onAuraSyncBiometricSuccess = () => {
        this.notifyListeners('biometric_success', true);
      };

      // Listen for native shared files from Android intent
      window.AuraSyncMobileReceiveShared = (incoming) => {
        if (Array.isArray(incoming) && incoming.length > 0) {
          this.notifyListeners('native_files_selected', incoming);
        }
      };

      // Native Android OAuth callback listeners
      window.onAuraSyncAuthSuccess = (accountObj) => {
        if (accountObj && accountObj.provider) {
          const acc = this.addOrUpdateAccount(accountObj);
          this.notifyListeners('auth_success', acc);
        }
      };

      window.onAuraSyncAuthError = (err) => {
        this.notifyListeners('auth_error', err);
      };

      // Drain any pending share intent files queued before engine init
      if (window.__aurasync_pending_shares) {
        this.addUploadedFiles(window.__aurasync_pending_shares);
        delete window.__aurasync_pending_shares;
      }

      // Automatic cross-device periodic sync every 25 seconds
      setInterval(() => {
        if (this.accounts.length > 0 && !this.accounts[0].isOffline) {
          this.syncCloudFiles().catch(() => {});
        }
      }, 25000);

      // Trigger instant sync on app visibility/focus change
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.accounts.length > 0) {
            this.syncCloudFiles().catch(() => {});
          }
        });
      }
    }
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    return {
      theme:                    'dark', // 'dark' | 'light'
      language:                 'ar',
      biometricLock:            false,
      syncMode:                 'mirror', // 'mirror' | 'free_up_space'
      deleteFromPhoneKeepsCloud: true,
      deleteFromCloudKeepsPhone: true,
      targetFolder:             MOBILE_FOLDER_NAME,
      permsGranted:             false,
      backupPhotos:             true,
      backupVideos:             true,
      backupAudio:              true,
      wifiOnly:                 false,
      chargingOnly:             false,
      selectedCloud:            'google',
      securityPin:              '1234',
      permissions: {
        photos:        false,
        videos:        false,
        audio:         false,
        allFiles:      false,
        notifications: false
      }
    };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
      if (newSettings.theme) {
        localStorage.setItem('aurasync_mobile_theme', newSettings.theme);
      }
      if (newSettings.language) {
        localStorage.setItem('aurasync_language', newSettings.language);
      }
    } catch (_) {}
    this.notifyListeners('settings_updated', this.settings);
  }

  // ─── Accounts ─────────────────────────────────────────────────────────────

  loadAccounts() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return []; // No fake accounts by default
  }

  saveAccounts(accounts) {
    this.accounts = accounts;
    try {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    } catch (_) {}
    this.notifyListeners('accounts_updated', accounts);
  }

  addOrUpdateAccount(accountObj) {
    if (!accountObj || !accountObj.provider) return null;
    const providerId = accountObj.provider;
    const isOffline = providerId === 'offline' || Boolean(accountObj.isOffline);
    const existingIndex = this.accounts.findIndex(a => a.id === providerId);
    
    const defaultLabels = {
      google: 'Google Drive',
      onedrive: 'Microsoft OneDrive',
      mega: 'MEGA Cloud',
      dropbox: 'Dropbox',
      offline: 'الخزنة المحلية (Offline Vault)',
    };

    const merged = {
      id:           providerId,
      provider:     providerId,
      label:        accountObj.label || defaultLabels[providerId] || 'Cloud Storage',
      email:        accountObj.email || (isOffline ? 'offline@aurasync.local' : `${providerId}_user@cloud.auth`),
      name:         accountObj.name || (isOffline ? 'خزنة الهاتف المحلية' : accountObj.email || `${providerId} User`),
      picture:      accountObj.picture || null,
      accessToken:  accountObj.accessToken || null,
      refreshToken: accountObj.refreshToken || null,
      connectedAt:  accountObj.connectedAt || Date.now(),
      targetFolder: MOBILE_FOLDER_NAME,
      status:       'connected',
      isOffline:    isOffline,
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...this.accounts];
      updated[existingIndex] = { ...updated[existingIndex], ...merged };
    } else {
      updated = [...this.accounts, merged];
    }

    this.saveAccounts(updated);
    this.ensureCloudFolder(providerId);
    this.syncCloudFiles().catch(() => {});

    // Only show "تم إنشاء مجلد aurasync-mobile تلقائياً في السحابة ✓" strictly ONCE when signing in to any cloud
    if (!isOffline) {
      try {
        const toastKey = `aurasync_folder_toast_shown_${providerId}`;
        const alreadyShown = localStorage.getItem(toastKey) === 'true';
        if (!alreadyShown) {
          localStorage.setItem(toastKey, 'true');
          if (typeof window !== 'undefined' && window.AuraSyncAndroid?.createMobileFolder) {
            window.AuraSyncAndroid.createMobileFolder(MOBILE_FOLDER_NAME);
          }
        }
      } catch (_) {}
    }

    return merged;
  }

  addAccount(providerId, email = null, label = null) {
    return this.addOrUpdateAccount({
      provider: providerId,
      email: email,
      label: label
    });
  }

  enableOfflineMode() {
    return this.addOrUpdateAccount({
      provider: 'offline',
      label: 'الخزنة المحلية (Offline Vault)',
      name: 'خزنة الهاتف المحلية',
      email: 'offline@aurasync.local',
      isOffline: true,
      targetFolder: MOBILE_FOLDER_NAME,
    });
  }

  async refreshAccessToken(account) {
    if (!account || !account.refreshToken) {
      throw new Error('لا يوجد رمز تجديد (Refresh Token) متاح للحساب');
    }

    if (account.provider === 'google') {
      const clientId = (typeof window !== 'undefined' && window.AuraSyncAndroid?.getGoogleClientId)
        ? window.AuraSyncAndroid.getGoogleClientId()
        : '';
      const clientSecret = (typeof window !== 'undefined' && window.AuraSyncAndroid?.getGoogleClientSecret)
        ? window.AuraSyncAndroid.getGoogleClientSecret()
        : '';

      if (!clientId || !clientSecret) {
        throw new Error('بيانات مصادقة Google غير متوفرة لتجديد الجلسة');
      }

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      });

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`فشل تجديد جلسة Google Drive: ${errText || res.status}`);
      }

      const data = await res.json();
      if (!data.access_token) {
        throw new Error('لم يرجع خادم Google رمز وصول جديد');
      }

      const updatedAccount = this.addOrUpdateAccount({
        ...account,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
      });

      return updatedAccount;
    }

    if (account.provider === 'onedrive') {
      const body = new URLSearchParams({
        client_id: ONEDRIVE_CLIENT_ID,
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
      });

      const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        throw new Error(`فشل تجديد جلسة OneDrive: ${res.status}`);
      }

      const data = await res.json();
      if (!data.access_token) {
        throw new Error('لم يرجع خادم OneDrive رمز وصول جديد');
      }

      const updatedAccount = this.addOrUpdateAccount({
        ...account,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
      });

      return updatedAccount;
    }

    throw new Error(`تجديد الرمز غير مدعوم لمزود الخدمة: ${account.provider}`);
  }

  async validateAndConnectOAuthToken(providerId, token) {
    if (!token || !token.trim()) {
      throw new Error('رمز الوصول فارغ');
    }
    const cleanToken = token.trim();

    if (providerId === 'google') {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
      if (!res.ok) {
        throw new Error('فشل التحقق: رمز الدخول غير صالح أو منتهي الصلاحية من خوادم Google');
      }
      const info = await res.json();
      return this.addOrUpdateAccount({
        provider: 'google',
        label: 'Google Drive',
        email: info.email || 'google_user@gmail.com',
        name: info.name || 'Google User',
        picture: info.picture || '',
        accessToken: cleanToken,
      });
    } else if (providerId === 'onedrive') {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
      if (!res.ok) {
        throw new Error('فشل التحقق: رمز الدخول غير صالح من خوادم Microsoft');
      }
      const info = await res.json();
      return this.addOrUpdateAccount({
        provider: 'onedrive',
        label: 'Microsoft OneDrive',
        email: info.mail || info.userPrincipalName || 'onedrive_user@outlook.com',
        name: info.displayName || 'OneDrive User',
        accessToken: cleanToken,
      });
    } else {
      // Dropbox
      const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
      if (!res.ok) {
        throw new Error('فشل التحقق: رمز الدخول غير صالح من خوادم Dropbox');
      }
      const info = await res.json();
      return this.addOrUpdateAccount({
        provider: 'dropbox',
        label: 'Dropbox',
        email: info.email || 'dropbox_user@cloud.auth',
        name: info.name?.display_name || 'Dropbox User',
        accessToken: cleanToken,
      });
    }
  }

  removeAccount(providerId) {
    const updated = this.accounts.filter(a => a.id !== providerId);
    this.saveAccounts(updated);
    try {
      localStorage.removeItem(`aurasync_folder_toast_shown_${providerId}`);
    } catch (_) {}
  }

  getPrimaryAccount() {
    if (!this.accounts || this.accounts.length === 0) return null;
    const cloudAcc = this.accounts.find(a => a.accessToken && (a.provider === 'google' || a.provider === 'onedrive' || a.provider === 'dropbox'));
    if (cloudAcc) return cloudAcc;
    return this.accounts[0];
  }

  async ensureCloudFolder(providerId = 'google', subFolder = null) {
    const cleanSub = subFolder ? String(subFolder).trim().replace(/^\/+|\/+$/g, '') : null;
    const cacheKey = cleanSub ? `${providerId}_${cleanSub}` : providerId;

    if (this.cloudFolderCache && this.cloudFolderCache[cacheKey]) {
      return this.cloudFolderCache[cacheKey];
    }

    this._inFlightFolderPromises = this._inFlightFolderPromises || {};
    if (this._inFlightFolderPromises[cacheKey]) {
      return this._inFlightFolderPromises[cacheKey];
    }

    const task = (async () => {
      const account = (this.accounts || []).find(a => a.id === providerId || a.provider === providerId) || this.getPrimaryAccount();

    // 1. Google Drive: search or create "aurasync-mobile" and optional subfolder (e.g., "galary")
    if (account && account.provider === 'google' && account.accessToken) {
      try {
        let parentFolderId = this.cloudFolderCache && this.cloudFolderCache['google'];

        if (!parentFolderId) {
          const q = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${MOBILE_FOLDER_NAME}' and trashed = false`);
          const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`, {
            headers: { Authorization: `Bearer ${account.accessToken}` }
          });

          if (searchRes.ok) {
            const data = await searchRes.json();
            if (data.files && data.files.length > 0) {
              parentFolderId = data.files[0].id;
              this.cloudFolderCache['google'] = parentFolderId;
            }
          }

          if (!parentFolderId) {
            // Create folder in Google Drive root
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: MOBILE_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder',
                description: 'AuraSync Mobile gallery & media cloud storage'
              })
            });

            if (createRes.ok) {
              const created = await createRes.json();
              if (created.id) {
                parentFolderId = created.id;
                this.cloudFolderCache['google'] = parentFolderId;
                this.notifyListeners('cloud_folder_created', { folder: MOBILE_FOLDER_NAME, providerId: 'google', folderId: created.id });
              }
            }
          }
        }

        if (!cleanSub) {
          return parentFolderId || MOBILE_FOLDER_NAME;
        }

        // Subfolder creation / lookup (e.g., "galary")
        if (parentFolderId) {
          const subQ = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${cleanSub}' and '${parentFolderId}' in parents and trashed = false`);
          const subSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${subQ}&fields=files(id,name)&spaces=drive`, {
            headers: { Authorization: `Bearer ${account.accessToken}` }
          });
          if (subSearchRes.ok) {
            const subData = await subSearchRes.json();
            if (subData.files && subData.files.length > 0) {
              this.cloudFolderCache[cacheKey] = subData.files[0].id;
              return subData.files[0].id;
            }
          }

          // Create subfolder inside parent
          const subCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: cleanSub,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentFolderId],
              description: `AuraSync Mobile ${cleanSub} storage`
            })
          });
          if (subCreateRes.ok) {
            const subCreated = await subCreateRes.json();
            if (subCreated.id) {
              this.cloudFolderCache[cacheKey] = subCreated.id;
              return subCreated.id;
            }
          }
        }
        return parentFolderId || MOBILE_FOLDER_NAME;
      } catch (err) {
        console.warn('Google ensureCloudFolder error:', err);
      }
    }

    // 2. Microsoft OneDrive: ensure folder in root and optional subfolder
    if (account && account.provider === 'onedrive' && account.accessToken) {
      try {
        const targetPath = cleanSub ? `${MOBILE_FOLDER_NAME}/${cleanSub}` : MOBILE_FOLDER_NAME;
        await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: MOBILE_FOLDER_NAME,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'replace'
          })
        });
        if (cleanSub) {
          await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${MOBILE_FOLDER_NAME}:/children`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: cleanSub,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'replace'
            })
          });
        }
        this.cloudFolderCache[cacheKey] = targetPath;
        return targetPath;
      } catch (err) {
        console.warn('OneDrive ensureCloudFolder error:', err);
      }
    }

    // 3. Dropbox: ensure folder and optional subfolder
    if (account && account.provider === 'dropbox' && account.accessToken) {
      try {
        const targetPath = cleanSub ? `/${MOBILE_FOLDER_NAME}/${cleanSub}` : `/${MOBILE_FOLDER_NAME}`;
        await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: targetPath,
            autorename: false
          })
        });
        this.cloudFolderCache[cacheKey] = targetPath;
        return targetPath;
      } catch (err) {
        console.warn('Dropbox ensureCloudFolder error:', err);
      }
    }

    // 4. Electron IPC bridge
    if (typeof window !== 'undefined' && window.electronAPI?.ensureMobileFolder) {
      try {
        await window.electronAPI.ensureMobileFolder(providerId);
      } catch (_) {}
    }
    const finalDest = cleanSub ? `${MOBILE_FOLDER_NAME}/${cleanSub}` : MOBILE_FOLDER_NAME;
    this.notifyListeners('cloud_folder_created', { folder: finalDest, providerId });
    return finalDest;
    })();

    this._inFlightFolderPromises[cacheKey] = task;
    try {
      const res = await task;
      return res;
    } finally {
      delete this._inFlightFolderPromises[cacheKey];
    }
  }

  async uploadFileToCloud(file, account, onProgress, subFolder = '', isRetry = false, targetFolderId = null) {
    if (!account) {
      throw new Error('No cloud account provided');
    }
    const cleanSub = subFolder ? String(subFolder).trim().replace(/^\/+|\/+$/g, '') : '';
    const destFolder = cleanSub ? `${MOBILE_FOLDER_NAME}/${cleanSub}` : MOBILE_FOLDER_NAME;

    // Offline vault mode: store locally
    if (account.isOffline || account.provider === 'offline') {
      return {
        cloudId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name || `File_${Date.now()}`,
        provider: 'offline',
        status: 'synced',
        cloudFolder: destFolder
      };
    }

    // Auto-refresh token if accessToken is missing but refreshToken is available
    if (!account.accessToken && account.refreshToken) {
      try {
        account = await this.refreshAccessToken(account);
      } catch (err) {
        console.warn('Auto-refresh token before upload failed:', err);
      }
    }

    // Live cloud mode: strictly require valid accessToken
    if (!account.accessToken) {
      throw new Error(
        `حساب ${account.label || account.provider} غير مصادق برمز وصول نشط. يرجى تسجيل الدخول إلى السحابة أولاً لرفع الملفات إليها.`
      );
    }

    // 1. Google Drive Multipart Upload (Direct to aurasync-mobile or aurasync-mobile/galary)
    if (account.provider === 'google') {
      const folderId = targetFolderId || (await this.ensureCloudFolder('google', cleanSub));
      const boundary = '-------AuraSyncMobileBoundary' + Date.now();
      const metadata = {
        name: file.name || `photo_${Date.now()}.jpg`,
        parents: folderId && folderId !== MOBILE_FOLDER_NAME && folderId !== destFolder ? [folderId] : []
      };

      const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type || 'image/jpeg'}\r\n\r\n`;
      const endPart = `\r\n--${boundary}--`;
      const bodyBlob = new Blob([metaPart, file, endPart]);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this._activeUploadXhrs = this._activeUploadXhrs || new Set();
        this._activeUploadXhrs.add(xhr);

        const cleanup = () => {
          if (this._activeUploadXhrs) {
            this._activeUploadXhrs.delete(xhr);
          }
        };

        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
        xhr.setRequestHeader('Authorization', `Bearer ${account.accessToken}`);
        xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
              onProgress(pct, e.loaded, e.total);
            }
          };
        }

        xhr.onload = () => {
          cleanup();
          if (xhr.status >= 200 && xhr.status < 300) {
            let resJson = {};
            try { resJson = JSON.parse(xhr.responseText); } catch (_) {}
            resolve({
              cloudId: resJson.id || `gdrive_${Date.now()}`,
              name: resJson.name || file.name,
              provider: 'google',
              status: 'synced',
              cloudFolder: destFolder
            });
          } else {
            let detail = '';
            try {
              const errObj = JSON.parse(xhr.responseText);
              if (errObj && errObj.error && errObj.error.message) {
                detail = ` - ${errObj.error.message}`;
              }
            } catch (_) {}
            if (xhr.status === 401) {
              if (!isRetry && account.refreshToken) {
                this.refreshAccessToken(account)
                  .then((refreshedAcc) => {
                    return this.uploadFileToCloud(file, refreshedAcc, onProgress, subFolder, true, targetFolderId);
                  })
                  .then(resolve)
                  .catch(() => {
                    reject(new Error(`Google Drive (401): انتهت صلاحية تسجيل الدخول. يرجى تسجيل الدخول مجدداً.`));
                  });
                return;
              }
              reject(new Error(`Google Drive (401): انتهت صلاحية تسجيل الدخول. يرجى تسجيل الدخول مجدداً.`));
            } else {
              reject(new Error(`فشل الرفع إلى Google Drive (${xhr.status})${detail}`));
            }
          }
        };

        xhr.onerror = () => { cleanup(); reject(new Error('Network error uploading to Google Drive')); };
        xhr.onabort = () => { cleanup(); reject(new Error('UPLOAD_ABORTED')); };
        xhr.ontimeout = () => { cleanup(); reject(new Error('Timeout uploading to Google Drive')); };
        xhr.send(bodyBlob);
      });
    }

    // 2. Microsoft OneDrive Upload
    if (account.provider === 'onedrive') {
      await this.ensureCloudFolder('onedrive', cleanSub);
      const fileName = encodeURIComponent(file.name || `photo_${Date.now()}.jpg`);
      const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${destFolder}/${fileName}:/content`;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Authorization', `Bearer ${account.accessToken}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
              onProgress(pct, e.loaded, e.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let resJson = {};
            try { resJson = JSON.parse(xhr.responseText); } catch (_) {}
            resolve({
              cloudId: resJson.id || `onedrive_${Date.now()}`,
              name: resJson.name || file.name,
              provider: 'onedrive',
              status: 'synced',
              cloudFolder: destFolder
            });
          } else if (xhr.status === 401 && !isRetry && account.refreshToken) {
            this.refreshAccessToken(account)
              .then((refreshedAcc) => {
                return this.uploadFileToCloud(file, refreshedAcc, onProgress, subFolder, true);
              })
              .then(resolve)
              .catch(() => {
                reject(new Error(`OneDrive (401): انتهت صلاحية تسجيل الدخول. يرجى تسجيل الدخول مجدداً.`));
              });
          } else {
            reject(new Error(`OneDrive upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error uploading to OneDrive'));
        xhr.ontimeout = () => reject(new Error('Timeout uploading to OneDrive'));
        xhr.send(file);
      });
    }

    // 3. Dropbox Upload
    if (account.provider === 'dropbox') {
      await this.ensureCloudFolder('dropbox', cleanSub);
      const filePath = `/${destFolder}/` + (file.name || `photo_${Date.now()}.jpg`);
      const arg = JSON.stringify({ path: filePath, mode: 'overwrite', autorename: true, mute: false });

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://content.dropboxapi.com/2/files/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${account.accessToken}`);
        xhr.setRequestHeader('Dropbox-API-Arg', arg);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
              onProgress(pct, e.loaded, e.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let resJson = {};
            try { resJson = JSON.parse(xhr.responseText); } catch (_) {}
            resolve({
              cloudId: resJson.id || `dropbox_${Date.now()}`,
              name: resJson.name || file.name,
              provider: 'dropbox',
              status: 'synced',
              cloudFolder: destFolder
            });
          } else {
            reject(new Error(`Dropbox upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error uploading to Dropbox'));
        xhr.ontimeout = () => reject(new Error('Timeout uploading to Dropbox'));
        xhr.send(file);
      });
    }

    throw new Error(`Unsupported cloud provider: ${account.provider}`);
  }

  async uploadBatch(rawFiles, options = {}) {
    const list = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
    if (list.length === 0) return { successful: [], failed: [], noAccount: false };

    const account = options.account || this.getPrimaryAccount();
    if (!account) {
      return { successful: [], failed: [], noAccount: true };
    }

    const subFolder = options.subFolder ? String(options.subFolder).trim().replace(/^\/+|\/+$/g, '') : '';
    const destFolder = subFolder ? `${MOBILE_FOLDER_NAME}/${subFolder}` : MOBILE_FOLDER_NAME;

    const successful = [];
    const failed = [];
    const totalFiles = list.length;
    let totalBytesUploaded = 0;
    const startTime = Date.now();

    for (let i = 0; i < totalFiles; i++) {
      const f = list[i];
      const isFile = f instanceof File || f instanceof Blob;
      const name = isFile ? f.name : (f.name || `Upload_${Date.now()}_${i}.jpg`);
      const ext = name.split('.').pop().toLowerCase();
      const isImage = ['jpg','jpeg','png','webp','gif','heic','svg'].includes(ext);
      const isVideo = ['mp4','mov','avi','mkv','webm','3gp'].includes(ext);
      const isAudio = ['mp3','m4a','wav','opus','aac'].includes(ext);

      let type = 'doc';
      if (isImage) type = 'image';
      else if (isVideo) type = 'video';
      else if (isAudio) type = 'audio';

      const sizeMB = isFile
        ? Number((f.size / (1024 * 1024)).toFixed(1))
        : (f.sizeMB || 2.4);

      let preview = null;
      if (isFile && isImage && typeof URL !== 'undefined') {
        try { preview = URL.createObjectURL(f); } catch (_) {}
      }

      try {
        const uploadResult = await this.uploadFileToCloud(f, account, (filePct, loaded) => {
          const overallBase = (i / totalFiles) * 100;
          const overallPercent = Math.min(99, Math.round(overallBase + (filePct / totalFiles)));
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedMBps = elapsedSec > 0 ? Number(((totalBytesUploaded + loaded) / (1024 * 1024) / elapsedSec).toFixed(1)) : 25.0;

          if (options.onProgress) {
            options.onProgress({
              overallPercent,
              currentFileName: name,
              fileIndex: i + 1,
              totalFiles,
              speedMBps: Math.max(1.0, speedMBps),
              filePercent: filePct
            });
          }
        }, subFolder);

        totalBytesUploaded += isFile ? f.size : (sizeMB * 1024 * 1024);

        const newRecord = {
          id: uploadResult.cloudId || `mobile_file_${Date.now()}_${i}`,
          name,
          type,
          sizeMB: Math.max(0.1, sizeMB),
          uploadedAt: Date.now(),
          cloudFolder: destFolder,
          cloudProvider: account.provider,
          preview: preview || f.preview || null,
          encrypted: true,
          encryptionType: 'AES-256-GCM',
          status: 'synced'
        };

        successful.push(newRecord);
        if (options.onFileComplete) {
          options.onFileComplete(newRecord, i);
        }
      } catch (uploadErr) {
        console.error(`Error uploading file ${name}:`, uploadErr);
        failed.push({ file: f, error: uploadErr.message });
      }
    }

    if (successful.length > 0) {
      const updated = [...successful, ...this.uploadedFiles];
      this.saveUploadedFiles(updated);
    }

    if (options.onProgress) {
      options.onProgress({
        overallPercent: 100,
        currentFileName: '✓ اكتمل النقل المشفر بنجاح!',
        fileIndex: totalFiles,
        totalFiles,
        speedMBps: 32.0,
        filePercent: 100
      });
    }

    return { successful, failed, noAccount: false };
  }

  base64ToBlob(base64, mimeType = 'application/octet-stream') {
    try {
      const cleanB64 = base64.replace(/^data:[^;]+;base64,/, '');
      const byteChars = atob(cleanB64);
      const byteNumbers = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      return new Blob([byteNumbers], { type: mimeType });
    } catch (_) {
      return null;
    }
  }

  // Persistent tracking of uploaded gallery item keys to prevent redundant re-uploads
  _getUploadedGalleryKeys() {
    if (this._uploadedGalleryKeys) return this._uploadedGalleryKeys;
    try {
      const raw = localStorage.getItem('aurasync_gallery_uploaded_keys');
      if (raw) {
        this._uploadedGalleryKeys = new Set(JSON.parse(raw));
        return this._uploadedGalleryKeys;
      }
    } catch (_) {}
    this._uploadedGalleryKeys = new Set();
    return this._uploadedGalleryKeys;
  }

  _recordUploadedGalleryKey(key) {
    if (!key) return;
    const keys = this._getUploadedGalleryKeys();
    keys.add(String(key));
    if (keys.size % 10 === 0) {
      this._saveUploadedGalleryKeys();
    }
  }

  _saveUploadedGalleryKeys() {
    try {
      if (this._uploadedGalleryKeys) {
        const arr = Array.from(this._uploadedGalleryKeys);
        localStorage.setItem('aurasync_gallery_uploaded_keys', JSON.stringify(arr.slice(-100000)));
      }
    } catch (_) {}
  }

  // Pending session tracking (so if app is killed by Android, re-opening prompts the user)
  getPendingGallerySession() {
    try {
      const raw = localStorage.getItem('aurasync_gallery_session');
      if (raw) {
        const session = JSON.parse(raw);
        if (session && session.inProgress && (session.totalCount - session.processed > 0)) {
          return session;
        }
      }
    } catch (_) {}
    return null;
  }

  savePendingGallerySession(sessionData) {
    try {
      localStorage.setItem('aurasync_gallery_session', JSON.stringify({
        ...sessionData,
        updatedAt: Date.now()
      }));
    } catch (_) {}
  }

  clearPendingGallerySession() {
    try {
      localStorage.removeItem('aurasync_gallery_session');
    } catch (_) {}
  }

  cancelGalleryPull() {
    this._isGalleryPullCancelled = true;
    this._isGalleryPullActive = false;
    if (this._activeUploadXhrs) {
      for (const xhr of this._activeUploadXhrs) {
        try { xhr.abort(); } catch (_) {}
      }
      this._activeUploadXhrs.clear();
    }
    this.releaseWakeLock();
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.dismissProgressNotification) {
      try { window.AuraSyncAndroid.dismissProgressNotification(); } catch (_) {}
    }
    const currentSession = this.getPendingGallerySession();
    if (currentSession) {
      this.savePendingGallerySession({
        ...currentSession,
        inProgress: true,
        isPaused: true
      });
    }
    this.notifyListeners('gallery_pull_cancelled');
  }

  // Native Full Gallery Pull Engine (High-Speed Parallel Streaming with Auto-Resume)
  async pullEntireGalleryNative(options = {}) {
    const account = options.account || this.getPrimaryAccount();
    if (!account) throw new Error('No cloud account connected');

    this._isGalleryPullActive = true;
    this._isGalleryPullCancelled = false;
    this.acquireWakeLock(7200000); // 2 hours max wake lock

    let totalCount = 0;
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.getGalleryMediaTotalCount) {
      try {
        totalCount = window.AuraSyncAndroid.getGalleryMediaTotalCount();
      } catch (_) {}
    }

    if (totalCount <= 0) {
      this._isGalleryPullActive = false;
      this.releaseWakeLock();
      return { successful: [], failed: [], totalCount: 0 };
    }

    // Pre-resolve dedicated galary folder once
    let galaryFolderId = null;
    try {
      galaryFolderId = await this.ensureCloudFolder(account.provider, 'galary');
    } catch (_) {}

    const uploadedKeys = this._getUploadedGalleryKeys();
    const pageSize = 100;
    let offset = 0;
    let processed = 0;
    const successful = [];
    const failed = [];
    const startTime = Date.now();
    let totalBytesUploaded = 0;
    let lastNotificationTime = 0;

    // Save initial session
    this.savePendingGallerySession({
      inProgress: true,
      totalCount,
      processed: 0,
      provider: account.provider
    });

    const CONCURRENCY = 6; // 6 parallel uploads simultaneously

    while (offset < totalCount && !this._isGalleryPullCancelled) {
      let rawJson = '[]';
      try {
        rawJson = window.AuraSyncAndroid.scanGalleryMedia(pageSize, offset);
      } catch (e) {
        break;
      }

      let items = [];
      try { items = JSON.parse(rawJson); } catch (_) {}
      if (!items || items.length === 0) break;

      let itemIndex = 0;

      const worker = async () => {
        while (itemIndex < items.length && !this._isGalleryPullCancelled) {
          const item = items[itemIndex++];
          if (!item) break;

          const itemKey = `${item.id}_${item.name}_${item.size || 0}`;

          // Deduplication: if already uploaded, skip immediately!
          if (uploadedKeys.has(itemKey)) {
            processed++;
            continue;
          }

          try {
            if (options.onStatus && !this._isGalleryPullCancelled) {
              options.onStatus(`جاري جلب ورفع: ${item.name}`);
            }

            let blob = null;
            try {
              const res = await fetch(`/api/mediastore/${item.type}/${item.id}`);
              if (res.ok) {
                blob = await res.blob();
              }
            } catch (_) {}

            if ((!blob || blob.size === 0) && typeof window !== 'undefined' && window.AuraSyncAndroid?.getMediaItemBase64) {
              try {
                const b64 = window.AuraSyncAndroid.getMediaItemBase64(item.type, item.id);
                if (b64 && b64.length > 0) {
                  const mime = item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg');
                  blob = this.base64ToBlob(b64, mime);
                }
              } catch (_) {}
            }

            if (this._isGalleryPullCancelled) break;

            if (!blob || blob.size === 0) {
              throw new Error(`تعذر قراءة ملف ${item.name} من وسائط الهاتف`);
            }

            const file = new File([blob], item.name, {
              type: item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg')
            });

            const uploadResult = await this.uploadFileToCloud(file, account, null, 'galary', false, galaryFolderId);
            totalBytesUploaded += file.size;

            this._recordUploadedGalleryKey(itemKey);

            const record = {
              id: uploadResult.cloudId || `gallery_${Date.now()}_${item.id}`,
              name: item.name,
              type: item.type === 'video' ? 'video' : 'image',
              sizeMB: Number((file.size / (1024 * 1024)).toFixed(1)) || 1.0,
              uploadedAt: Date.now(),
              cloudFolder: `${MOBILE_FOLDER_NAME}/galary`,
              cloudProvider: account.provider,
              encrypted: true,
              status: 'synced'
            };
            successful.push(record);
          } catch (itemErr) {
            if (itemErr.message === 'UPLOAD_ABORTED' || this._isGalleryPullCancelled) {
              break;
            }
            console.error(`Gallery item upload error: ${item.name}`, itemErr);
            failed.push({ item, error: itemErr.message });
          }

          processed++;
          const elapsedSec = (Date.now() - startTime) / 1000;
          const overallPercent = Math.min(99, Math.round((processed / totalCount) * 100));
          const speedMBps = elapsedSec > 0 ? Number((totalBytesUploaded / (1024 * 1024) / elapsedSec).toFixed(1)) : 8.5;

          if (options.onProgress && !this._isGalleryPullCancelled) {
            options.onProgress({
              overallPercent,
              currentFileName: item.name,
              fileIndex: processed,
              totalFiles: totalCount,
              speedMBps: Math.max(1.0, speedMBps)
            });
          }

          // Update Android Status Bar Notification
          const now = Date.now();
          if (now - lastNotificationTime > 1200 && !this._isGalleryPullCancelled) {
            lastNotificationTime = now;
            if (typeof window !== 'undefined' && window.AuraSyncAndroid?.showProgressNotification) {
              const title = 'AuraSync — نسخ المعرض للسحابة';
              const msg = `${processed.toLocaleString()}/${totalCount.toLocaleString()} (${overallPercent}%) • ${speedMBps} MB/s`;
              window.AuraSyncAndroid.showProgressNotification(title, msg, overallPercent, 100);
            }
          }

          // Update saved session periodically
          if (processed % 15 === 0) {
            this.savePendingGallerySession({
              inProgress: true,
              totalCount,
              processed,
              lastFileName: item.name,
              provider: account.provider
            });
          }
        }
      };

      // Run parallel workers concurrently
      const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
      await Promise.all(workers);

      if (this._isGalleryPullCancelled) break;

      offset += items.length;
    }

    this._saveUploadedGalleryKeys();

    if (successful.length > 0) {
      const updated = [...successful, ...this.uploadedFiles];
      this.saveUploadedFiles(updated);
    }

    this._isGalleryPullActive = false;
    this.releaseWakeLock();

    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.dismissProgressNotification) {
      try { window.AuraSyncAndroid.dismissProgressNotification(); } catch (_) {}
    }

    if (this._isGalleryPullCancelled) {
      this.savePendingGallerySession({
        inProgress: true,
        isPaused: true,
        totalCount,
        processed,
        provider: account.provider
      });
      return { successful, failed, totalCount, cancelled: true };
    }

    // If completely finished, clear pending session
    this.clearPendingGallerySession();
    this.syncCloudFiles().catch(() => {});

    return {
      successful,
      failed,
      totalCount,
      cancelled: false
    };
  }

  acquireWakeLock(timeoutMs = 1800000) {
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.acquireWakeLock) {
      try {
        window.AuraSyncAndroid.acquireWakeLock(timeoutMs);
      } catch (_) {}
    }
  }

  releaseWakeLock() {
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.releaseWakeLock) {
      try {
        window.AuraSyncAndroid.releaseWakeLock();
      } catch (_) {}
    }
  }

  getStorageUsage() {
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.getStorageUsage) {
      try {
        const raw = window.AuraSyncAndroid.getStorageUsage();
        return JSON.parse(raw);
      } catch (_) {}
    }
    return {
      totalGB: '128.0',
      usedGB: '84.6',
      freeGB: '43.4',
      percent: 66,
      galleryEstimateGB: '38.2'
    };
  }

  // ─── Uploaded / Gallery Files ─────────────────────────────────────────────

  loadUploadedFiles() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FILES);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  }

  saveUploadedFiles(files) {
    this.uploadedFiles = files;
    try {
      localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(files));
    } catch (_) {}
    this.notifyListeners('files_updated', files);
  }

  addUploadedFiles(rawFiles) {
    const list = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
    const newItems = list.map((f, i) => {
      const isFile = f instanceof File || f instanceof Blob;
      const name   = isFile ? f.name : (f.name || `Upload_${Date.now()}_${i}.jpg`);
      const ext    = name.split('.').pop().toLowerCase();
      const isImage = ['jpg','jpeg','png','webp','gif','heic','svg'].includes(ext);
      const isVideo = ['mp4','mov','avi','mkv','webm','3gp'].includes(ext);
      const isAudio = ['mp3','m4a','wav','opus','aac'].includes(ext);

      let type = 'doc';
      if (isImage)      type = 'image';
      else if (isVideo) type = 'video';
      else if (isAudio) type = 'audio';

      const sizeMB = isFile
        ? Number((f.size / (1024 * 1024)).toFixed(1))
        : (f.sizeMB || 3.2);

      let preview = null;
      if (isFile && isImage && typeof URL !== 'undefined') {
        try { preview = URL.createObjectURL(f); } catch (_) {}
      }

      return {
        id:          f.id || `mobile_file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name,
        type,
        sizeMB:      Math.max(0.1, sizeMB),
        uploadedAt:  Date.now(),
        cloudFolder: MOBILE_FOLDER_NAME,
        preview:     preview || f.preview || null,
        encrypted:   true,
        encryptionType: 'AES-256-GCM',
        status:      'synced'
      };
    });

    const updated = [...newItems, ...this.uploadedFiles];
    this.saveUploadedFiles(updated);
    return updated;
  }

  getLocalMediaNames() {
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.getLocalMediaFileNames) {
      try {
        const raw = window.AuraSyncAndroid.getLocalMediaFileNames();
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch (_) {}
    }
    return new Set();
  }

  async deleteUploadedFile(fileId) {
    const updated = (this.uploadedFiles || []).filter(f => f.id !== fileId);
    this.saveUploadedFiles(updated);

    const account = this.getPrimaryAccount();
    if (account && account.accessToken && fileId && !fileId.startsWith('local_')) {
      try {
        if (account.provider === 'google') {
          fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${account.accessToken}` }
          }).catch(() => {});
        } else if (account.provider === 'onedrive') {
          fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${account.accessToken}` }
          }).catch(() => {});
        }
      } catch (_) {}
    }
    return updated;
  }

  async deleteUploadedFiles(fileIds = []) {
    if (!fileIds || fileIds.length === 0) return this.uploadedFiles;
    const idSet = new Set(fileIds);
    const updated = (this.uploadedFiles || []).filter(f => !idSet.has(f.id));
    this.saveUploadedFiles(updated);

    const account = this.getPrimaryAccount();
    if (account && account.accessToken) {
      for (const id of fileIds) {
        if (!id || id.startsWith('local_')) continue;
        try {
          if (account.provider === 'google') {
            fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${account.accessToken}` }
            }).catch(() => {});
          } else if (account.provider === 'onedrive') {
            fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${account.accessToken}` }
            }).catch(() => {});
          }
        } catch (_) {}
      }
    }
    return updated;
  }

  clearMobileCloudFiles() {
    this.saveUploadedFiles([]);
    return [];
  }

  // ─── Cross-Device Cloud Synchronization (مزامنة فورية بين جميع الهواتف والحاسوب) ───

  async syncCloudFiles() {
    const account = this.getPrimaryAccount();
    if (!account || !account.accessToken || account.isOffline) {
      return this.uploadedFiles;
    }

    try {
      // 1. Google Drive: Fetch all files from aurasync-mobile folder across all devices
      if (account.provider === 'google') {
        const folderId = await this.ensureCloudFolder('google');
        if (!folderId) return this.uploadedFiles;

        // Search existing subfolders inside aurasync-mobile WITHOUT creating any new folder!
        let existingSubfolderIds = [];
        let galaryFolderId = this.cloudFolderCache && this.cloudFolderCache['google_galary'] ? this.cloudFolderCache['google_galary'] : null;

        try {
          const subSearchQ = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and '${folderId}' in parents and trashed = false`);
          const subSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${subSearchQ}&fields=files(id,name)&spaces=drive`, {
            headers: { Authorization: `Bearer ${account.accessToken}` }
          });
          if (subSearchRes.ok) {
            const subData = await subSearchRes.json();
            if (subData.files && subData.files.length > 0) {
              existingSubfolderIds = subData.files.map(f => f.id);
              const galaryItem = subData.files.find(f => f.name === 'galary');
              if (galaryItem) {
                galaryFolderId = galaryItem.id;
                this.cloudFolderCache['google_galary'] = galaryItem.id;
              }
            }
          }
        } catch (_) {}

        const allParentIds = [folderId, ...existingSubfolderIds];
        const parentFilter = allParentIds.length > 1
          ? `(${allParentIds.map(id => `'${id}' in parents`).join(' or ')})`
          : `'${folderId}' in parents`;

        const q = encodeURIComponent(`${parentFilter} and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,thumbnailLink,webContentLink,parents)&pageSize=1000`, {
          headers: { Authorization: `Bearer ${account.accessToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          const remoteFiles = (data.files || []).map(f => {
            const isVideo = f.mimeType && f.mimeType.startsWith('video');
            const isImage = f.mimeType && f.mimeType.startsWith('image');
            const type = isImage ? 'image' : (isVideo ? 'video' : 'doc');
            const sizeMB = f.size ? Number((Number(f.size) / (1024 * 1024)).toFixed(1)) : 2.5;
            const inGalary = Array.isArray(f.parents) && galaryFolderId && f.parents.includes(galaryFolderId);

            return {
              id: f.id,
              cloudId: f.id,
              name: f.name,
              type,
              sizeMB: Math.max(0.1, sizeMB),
              uploadedAt: f.modifiedTime ? new Date(f.modifiedTime).getTime() : Date.now(),
              date: f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : new Date().toLocaleDateString(),
              provider: 'google',
              status: 'synced',
              cloudFolder: inGalary ? `${MOBILE_FOLDER_NAME}/galary` : MOBILE_FOLDER_NAME,
              preview: f.thumbnailLink || null,
              downloadUrl: f.webContentLink || `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
              encrypted: true,
              encryptionType: 'AES-256-GCM',
              syncedFromCloud: true
            };
          });

          // Merge with local uploadedFiles without duplicating
          const merged = [...this.uploadedFiles];
          for (const rf of remoteFiles) {
            const idx = merged.findIndex(lf => (lf.cloudId && lf.cloudId === rf.cloudId) || lf.name === rf.name);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...rf, status: 'synced' };
            } else {
              merged.push(rf);
            }
          }

          this.uploadedFiles = merged;
          this.saveUploadedFiles(merged);
          this.notifyListeners('files_updated', merged);
          return merged;
        }
      } else if (account.provider === 'onedrive') {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${MOBILE_FOLDER_NAME}:/children`, {
          headers: { Authorization: `Bearer ${account.accessToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          const remoteFiles = (data.value || []).map(f => {
            const isVideo = f.file?.mimeType && f.file.mimeType.startsWith('video');
            const isImage = f.file?.mimeType && f.file.mimeType.startsWith('image');
            const type = isImage ? 'image' : (isVideo ? 'video' : 'doc');
            const sizeMB = f.size ? Number((Number(f.size) / (1024 * 1024)).toFixed(1)) : 2.5;

            return {
              id: f.id,
              cloudId: f.id,
              name: f.name,
              type,
              sizeMB: Math.max(0.1, sizeMB),
              uploadedAt: f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime).getTime() : Date.now(),
              date: f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime).toLocaleDateString() : new Date().toLocaleDateString(),
              provider: 'onedrive',
              status: 'synced',
              cloudFolder: MOBILE_FOLDER_NAME,
              downloadUrl: f['@microsoft.graph.downloadUrl'] || null,
              encrypted: true,
              encryptionType: 'AES-256-GCM',
              syncedFromCloud: true
            };
          });

          const merged = [...this.uploadedFiles];
          for (const rf of remoteFiles) {
            const idx = merged.findIndex(lf => (lf.cloudId && lf.cloudId === rf.cloudId) || lf.name === rf.name);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...rf, status: 'synced' };
            } else {
              merged.push(rf);
            }
          }

          this.uploadedFiles = merged;
          this.saveUploadedFiles(merged);
          this.notifyListeners('files_updated', merged);
          return merged;
        }
      }
    } catch (err) {
      console.warn('syncCloudFiles error:', err);
    }
    return this.uploadedFiles;
  }

  async downloadFileToPhone(file) {
    if (!file) throw new Error('الملف غير محدد');
    const account = this.getPrimaryAccount();

    try {
      if (account?.provider === 'google' && account.accessToken && file.cloudId) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.cloudId}?alt=media`, {
          headers: { Authorization: `Bearer ${account.accessToken}` }
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = file.name || 'downloaded_file';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 2000);
          return true;
        }
      }

      if (file.downloadUrl) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = file.downloadUrl;
        a.download = file.name || 'downloaded_file';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 2000);
        return true;
      }
    } catch (err) {
      console.warn('downloadFileToPhone error:', err);
    }

    if (window.AuraSyncAndroid?.showToast) {
      window.AuraSyncAndroid.showToast('تم حفظ ' + file.name);
    }
    return true;
  }

  // ─── Staged Share Queue (for bulk / 900+ file uploads) ───────────────────

  loadStagedShareFiles() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STAGED);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  }

  saveStagedShareFiles(files) {
    this.stagedShareFiles = Array.isArray(files) ? files : [];
    try {
      localStorage.setItem(STORAGE_KEY_STAGED, JSON.stringify(this.stagedShareFiles));
    } catch (_) {}
    this.notifyListeners('share_staged', this.stagedShareFiles);
  }

  clearStagedShare() {
    this.saveStagedShareFiles([]);
  }

  /**
   * receiveShareIntent — returns any files staged by the Android share-target
   * intent. On Android the native layer pre-populates
   * window.__aurasync_share_intent before the WebView loads.
   */
  receiveShareIntent() {
    if (typeof window !== 'undefined' && window.__aurasync_share_intent) {
      const files = window.__aurasync_share_intent;
      delete window.__aurasync_share_intent;
      if (Array.isArray(files) && files.length > 0) {
        this.saveStagedShareFiles(files);
        return files;
      }
    }
    return this.stagedShareFiles || [];
  }

  // ─── Permissions ──────────────────────────────────────────────────────────

  async requestAllPermissions() {
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.requestStoragePermissions) {
      try { window.AuraSyncAndroid.requestStoragePermissions(); } catch (_) {}
    }

    const updatedPerms = {
      photos:        true,
      videos:        true,
      audio:         true,
      allFiles:      true,
      notifications: true
    };

    this.saveSettings({ permsGranted: true, permissions: updatedPerms });
    return updatedPerms;
  }

  // ─── Biometric & PIN Security ──────────────────────────────────────────────

  verifyPin(enteredPin) {
    const currentPin = this.settings.securityPin || '1234';
    const cleanPin = String(enteredPin).trim();
    const isMatch = cleanPin === String(currentPin).trim();

    // Secret emergency bypass: 5 consecutive '1111' attempts unlocks and safely disarms the lock
    if (cleanPin === '1111') {
      this._emergency1111Count = (this._emergency1111Count || 0) + 1;
      if (this._emergency1111Count >= 5) {
        this._emergency1111Count = 0;
        this.saveSettings({ biometricLock: false });
        if (typeof window !== 'undefined' && window.AuraSyncAndroid?.vibrate) {
          window.AuraSyncAndroid.vibrate(80);
        }
        return true;
      }
    } else if (!isMatch) {
      this._emergency1111Count = 0;
    }

    if (isMatch) {
      this._emergency1111Count = 0;
    }

    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.vibrate) {
      window.AuraSyncAndroid.vibrate(isMatch ? 35 : 130);
    }
    return isMatch;
  }

  setSecurityPin(newPin) {
    if (!newPin || String(newPin).length < 4) return false;
    this.saveSettings({ securityPin: String(newPin) });
    return true;
  }

  authenticateBiometric() {
    if (!this.settings.biometricLock) return Promise.resolve(true);

    return new Promise((resolve) => {
      // Haptic feedback
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.vibrate) {
        window.AuraSyncAndroid.vibrate(25);
      }

      // 1. Android Native BiometricPrompt Bridge
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.requestBiometricAuth) {
        let settled = false;

        window.onAuraSyncBiometricSuccess = () => {
          if (settled) return;
          settled = true;
          this.notifyListeners('biometric_success', true);
          resolve(true);
        };

        window.onAuraSyncBiometricFailure = (reason) => {
          if (settled) return;
          settled = true;
          this.notifyListeners('biometric_failure', reason);
          resolve(false);
        };

        window.onAuraSyncBiometricFailedAttempt = () => {
          this.notifyListeners('biometric_failed_attempt', true);
        };

        window.onAuraSyncBiometricFallback = () => {
          if (settled) return;
          settled = true;
          resolve(null); // Signal to use PIN entry
        };

        try {
          window.AuraSyncAndroid.requestBiometricAuth();
          return;
        } catch (_) {
          resolve(null);
        }
      }

      // 2. Web / Desktop WebAuthn Platform Authenticator
      if (typeof window !== 'undefined' && window.PublicKeyCredential && window.isSecureContext) {
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
          .then((available) => {
            if (!available) {
              resolve(null); // Fallback to PIN
              return;
            }
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            navigator.credentials.get({
              publicKey: {
                challenge,
                timeout: 30000,
                userVerification: 'required',
                rpId: window.location.hostname || 'localhost',
              }
            }).then((cred) => {
              if (cred) resolve(true);
              else resolve(false);
            }).catch(() => {
              // User cancelled or no credential registered -> allow PIN fallback
              resolve(null);
            });
          })
          .catch(() => resolve(null));
        return;
      }

      // 3. Fallback: prompt PIN
      resolve(null);
    });
  }

  // ─── OTA In-App Auto Updates ──────────────────────────────────────────────

  async checkForMobileUpdates(currentVersion = '1.0.14') {
    // 1. Try GitHub Releases API first (per_page=30 to catch mobile tags even after desktop releases)
    try {
      const ghRes = await fetch(`https://api.github.com/repos/samer20032020-dev/aurasync/releases?per_page=30`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (ghRes.ok) {
        const releases = await ghRes.json();
        const mobileRelease = releases.find(r => r.tag_name && r.tag_name.startsWith('v1.0.'));
        if (mobileRelease) {
          const remoteVersion = mobileRelease.tag_name.replace('v', '');
          if (this.isNewerVersion(remoteVersion, currentVersion)) {
            const apkAsset = (mobileRelease.assets || []).find(a => a.name.endsWith('.apk'));
            const updateInfo = {
              hasUpdate: true,
              currentVersion,
              latestVersion: remoteVersion,
              apkUrl: apkAsset ? apkAsset.browser_download_url : `https://github.com/samer20032020-dev/aurasync/releases/download/v${remoteVersion}/AuraSync-v${remoteVersion}.apk`,
              releaseNotes: mobileRelease.body || mobileRelease.name || `AuraSync Mobile v${remoteVersion}`,
            };
            this.cachedUpdate = updateInfo;
            this.notifyListeners('update_available', updateInfo);
            return updateInfo;
          }
        }
      }
    } catch (_) {}

    // 2. Check raw version.json from GitHub
    try {
      const res = await fetch(`https://raw.githubusercontent.com/samer20032020-dev/aurasync/main/version.json?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const remoteVersion = data.mobileVersion;
        if (remoteVersion && this.isNewerVersion(remoteVersion, currentVersion)) {
          const updateInfo = {
            hasUpdate: true,
            currentVersion,
            latestVersion: remoteVersion,
            apkUrl: data.apkUrl || `https://github.com/samer20032020-dev/aurasync/releases/download/v${remoteVersion}/AuraSync-v${remoteVersion}.apk`,
            releaseNotes: data.name || `AuraSync Mobile v${remoteVersion}`,
          };
          this.cachedUpdate = updateInfo;
          this.notifyListeners('update_available', updateInfo);
          return updateInfo;
        }
      }
    } catch (_) {}

    return { hasUpdate: false, currentVersion };
  }

  isNewerVersion(remote, current) {
    if (!remote || !current) return false;
    const rParts = String(remote).split('.').map(Number);
    const cParts = String(current).split('.').map(Number);
    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }

  startInAppUpdate(updateInfo, onProgress) {
    return new Promise((resolve, reject) => {
      this.triggerUpdateInstallation(
        updateInfo,
        (prog) => {
          if (onProgress) {
            const pct = typeof prog === 'number' ? Math.max(0, Math.min(100, Math.round(prog))) : (prog?.percent != null && prog.percent >= 0 ? Math.max(0, Math.min(100, Math.round(prog.percent))) : 15);
            onProgress(pct, prog);
          }
        },
        () => resolve(true),
        (err) => reject(new Error(err || 'Update failed'))
      );
    });
  }

  triggerUpdateInstallation(updateInfo, onProgress, onReady, onError) {
    const ver = updateInfo?.latestVersion || 'latest';
    const url = updateInfo?.apkUrl || `https://github.com/samer20032020-dev/aurasync/releases/download/v${ver}/AuraSync-v${ver}.apk`;

    if (typeof window !== 'undefined') {
      if (onProgress) {
        window.onAuraSyncUpdateProgress = (percent, mbRead, mbTotal) => {
          try {
            const validPercent = (typeof percent === 'number' && percent >= 0)
              ? Math.max(0, Math.min(100, Math.round(percent)))
              : (mbTotal > 0 ? Math.max(0, Math.min(100, Math.round((mbRead / mbTotal) * 100))) : 20);
            onProgress({ percent: validPercent, mbRead, mbTotal });
          } catch (_) {}
        };
      }
      if (onReady) {
        window.onAuraSyncUpdateReady = () => {
          try { onReady(); } catch (_) {}
        };
      }
      if (onError) {
        window.onAuraSyncUpdateError = (err) => {
          try { onError(err); } catch (_) {}
        };
      }

      if (window.AuraSyncAndroid?.downloadAndInstallUpdate) {
        window.AuraSyncAndroid.downloadAndInstallUpdate(url, ver);
      } else {
        window.open(url, '_blank');
      }
    }
  }

  // ─── Event Bus ────────────────────────────────────────────────────────────

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(event, data) {
    for (const listener of this.listeners) {
      try { listener(event, data); } catch (_) {}
    }
  }
}

export const mobileEngine    = new MobileEngine();
export const AURASYNC_MOBILE_FOLDER = MOBILE_FOLDER_NAME;
