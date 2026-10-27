import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// Provider Icons
const GoogleDriveIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

const OneDriveIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#0078D4">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
  </svg>
);

const DropboxIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#0061FF">
    <path d="M6 2l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM0 14l6 4 6-4-6-4-6 4zm18-4l-6 4 6 4 6-4-6-4zm-6 5l-6 4 6 4 6-4-6-4z"/>
  </svg>
);

const MegaIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22">
    <circle cx="12" cy="12" r="11" fill="#D9272E" />
    <path
      fill="#FFFFFF"
      d="M6.5 8h2.2l3.3 4 3.3-4h2.2v8h-2.1v-4.8l-2.6 3.2h-1.6l-2.6-3.2V16H6.5V8z"
    />
  </svg>
);

const OfflineVaultIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export default function MobileHome({
  version = '1.0.44',
  theme = 'dark',
  onNavigateTab,
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';
  const galleryInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const freeSpaceInputRef = useRef(null);
  const [transferMode, setTransferMode] = useState('gallery'); // 'files' | 'gallery'

  const [accounts, setAccounts] = useState(() => mobileEngine.accounts || []);
  const [uploadedFiles, setUploadedFiles] = useState(() => mobileEngine.uploadedFiles || []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState(null);
  const [userEmailInput, setUserEmailInput] = useState('');

  // Gallery transfer & sync state
  const [isBackingUpGallery, setIsBackingUpGallery] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [gallerySpeed, setGallerySpeed] = useState(0);
  const [galleryCurrentFile, setGalleryCurrentFile] = useState('');
  const [galleryDone, setGalleryDone] = useState(false);
  const [galleryStats, setGalleryStats] = useState({ photos: 0, videos: 0, total: 0 });
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  // Execute real backup to cloud and sync across devices (Defined before useEffect to avoid TDZ)
  const executeTransfer = useCallback(async (fileArray, subFolder = '') => {
    if (!fileArray || fileArray.length === 0) return;

    if (accounts.length === 0) {
      triggerHaptic(30);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ يرجى تسجيل الدخول إلى سحابتك أولاً لنقل الملفات إلى مجلد السحابة!'
            : '⚠️ Please connect a cloud account first to transfer files to cloud!',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }

    const activeAcc = accounts[0];
    if (!activeAcc.isOffline && !activeAcc.accessToken) {
      triggerHaptic(30);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ حسابك غير مصادق برمز وصول سحابي نشط! اضغط لتسجيل الدخول في Google Drive أولاً'
            : '⚠️ Access token missing! Please authenticate with Google Drive first',
          'warn'
        );
      }
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(activeAcc.provider || 'google');
      }
      return;
    }

    const photos = fileArray.filter(f => f.type && f.type.startsWith('image/')).length;
    const videos = fileArray.filter(f => f.type && f.type.startsWith('video/')).length;
    const totalCount = fileArray.length;

    // Acquire WakeLock so background execution continues even with screen off
    mobileEngine.acquireWakeLock(3600000);

    triggerHaptic(30);
    setIsBackingUpGallery(true);
    setGalleryDone(false);
    setGalleryProgress(5);
    setGalleryStats({ photos, videos, total: totalCount });

    const cleanSub = subFolder ? String(subFolder).trim().replace(/^\/+|\/+$/g, '') : '';
    const targetFolderDisplay = cleanSub ? `${AURASYNC_MOBILE_FOLDER}/${cleanSub}` : AURASYNC_MOBILE_FOLDER;

    try {
      const result = await mobileEngine.uploadBatch(fileArray, {
        account: accounts[0],
        subFolder: cleanSub,
        onProgress: ({ overallPercent, currentFileName, speedMBps }) => {
          setGalleryProgress(overallPercent);
          setGalleryCurrentFile(currentFileName);
          setGallerySpeed(speedMBps);
        }
      });

      setGalleryProgress(100);
      setGalleryCurrentFile(isRtl ? '✓ اكتمل النقل المشفر بنجاح!' : '✓ Encrypted transfer completed!');
      mobileEngine.releaseWakeLock();
      triggerHaptic(60);

      const targetCloudName = accounts[0].label || 'السحابة';
      const successCount = result.successful ? result.successful.length : 0;
      const failedCount = result.failed ? result.failed.length : 0;

      // Automatically sync remote files so other devices have immediate access
      mobileEngine.syncCloudFiles().catch(() => {});

      setTimeout(() => {
        setIsBackingUpGallery(false);
        setGalleryDone(true);
        if (successCount > 0 && onShowToast) {
          onShowToast(
            isRtl
              ? `✓ تم نقل ${successCount.toLocaleString()} ملف إلى مجلد ${targetFolderDisplay} في ${targetCloudName} بنجاح ومزامنته فوراً!`
              : `✓ Transferred ${successCount.toLocaleString()} files to ${targetFolderDisplay} in ${targetCloudName} and synced!`,
            'success'
          );
        } else if (failedCount > 0 && onShowToast) {
          const detail = result.failed[0]?.error || (isRtl ? 'تعذر نقل الملفات' : 'Transfer failed');
          onShowToast(
            isRtl ? `تعذر النقل: ${detail}` : `Transfer failed: ${detail}`,
            'error'
          );
        }
      }, 500);
    } catch (err) {
      mobileEngine.releaseWakeLock();
      setGalleryCurrentFile(isRtl ? `حدث خطأ: ${err.message}` : `Error: ${err.message}`);
      if (onShowToast) {
        onShowToast(isRtl ? `فشل النقل: ${err.message}` : `Transfer failed: ${err.message}`, 'error');
      }
      setIsBackingUpGallery(false);
    }
  }, [accounts, isRtl, onShowToast, triggerHaptic]);

  // Manual Cross-Device Sync Trigger
  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    triggerHaptic(20);
    try {
      const files = await mobileEngine.syncCloudFiles();
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم تحديث المزامنة مع كافة الأجهزة (${(files || []).length} ملف متزامن)`
            : `✓ Synced with all devices (${(files || []).length} files)`,
          'success'
        );
      }
    } catch (err) {
      if (onShowToast) {
        onShowToast(isRtl ? `خطأ أثناء المزامنة: ${err.message}` : `Sync error: ${err.message}`, 'error');
      }
    } finally {
      setIsManualSyncing(false);
    }
  }, [isManualSyncing, isRtl, onShowToast, triggerHaptic]);

  // Automatic initial and periodic cross-device cloud sync
  useEffect(() => {
    mobileEngine.syncCloudFiles().catch(() => {});
    const unsub = mobileEngine.subscribe(async (event, data) => {
      if (event === 'accounts_updated') setAccounts(data || []);
      if (event === 'files_updated') setUploadedFiles(data || []);
      if (event === 'auth_success' && data) {
        setAccounts([data]);
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `✓ تم تسجيل الدخول وتفعيل الربط المباشر مع ${data.label}: ${data.email}`
              : `✓ Live cloud connection active: ${data.email}`,
            'success'
          );
        }
      }
      if (event === 'native_files_selected' && Array.isArray(data) && data.length > 0) {
        const sub = transferMode === 'gallery' ? 'galary' : '';
        const filesToUpload = [];
        for (const item of data) {
          try {
            let res = null;
            if (item.stagedFileName) {
              res = await fetch('/api/staged/' + encodeURIComponent(item.stagedFileName));
            } else if (item.uri) {
              res = await fetch('/api/contenturi/' + encodeURIComponent(item.uri));
            }
            if (res && res.ok) {
              const blob = await res.blob();
              const file = new File([blob], item.name, { type: item.mimeType || blob.type });
              filesToUpload.push(file);
            }
          } catch (e) {
            console.warn('Failed to resolve staged/content uri:', item, e);
          }
        }
        if (filesToUpload.length > 0) {
          executeTransfer(filesToUpload, sub);
        }
      }
    });
    return unsub;
  }, [executeTransfer, isRtl, onShowToast, transferMode]);

  // Option 1: مزامنة ملفات (حفظ أي ملفات في aurasync-mobile مباشرة)
  const handleStartFilesSync = useCallback(() => {
    triggerHaptic(25);
    if (accounts.length === 0) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ اختر سحابتك أولاً (Google Drive / OneDrive / Dropbox) لمزامنة الملفات فيها'
            : '⚠️ Connect a cloud account first to sync files',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }

    const currentAcc = accounts[0];
    if (!currentAcc.isOffline && !currentAcc.accessToken) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `⚠️ يجب تسجيل الدخول إلى ${currentAcc.label || 'Google Drive'} أولاً لرفع الملفات إلى حسابك الفعلي`
            : `⚠️ Please sign in to ${currentAcc.label || 'Google Drive'} first to upload files`,
          'warn'
        );
      }
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(currentAcc.provider || 'google');
      }
      return;
    }

    setTransferMode('files');
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.launchNativeMediaPicker) {
      window.AuraSyncAndroid.launchNativeMediaPicker('all');
    } else if (filesInputRef.current) {
      filesInputRef.current.click();
    }
  }, [accounts, isRtl, onShowToast, triggerHaptic]);

  const handleGeneralFilesSelected = useCallback((e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const fileArray = Array.from(selected);
    if (e.target) e.target.value = '';
    setTransferMode('files');
    executeTransfer(fileArray, '');
  }, [executeTransfer]);

  // Option 2: سحب المعرض كامل (سحب كل الصور والفيديوهات تلقائياً إلى aurasync-mobile/galary)
  const handleStartGalleryTransfer = useCallback(async () => {
    triggerHaptic(25);
    if (accounts.length === 0) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ اختر سحابتك أولاً (Google Drive / OneDrive / Dropbox) لسحب المعرض إليها'
            : '⚠️ Connect a cloud account first to transfer your gallery',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }

    const currentAcc = accounts[0];
    if (!currentAcc.isOffline && !currentAcc.accessToken) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `⚠️ يجب تسجيل الدخول إلى ${currentAcc.label || 'Google Drive'} أولاً لرفع المعرض إلى حسابك الفعلي`
            : `⚠️ Please sign in to ${currentAcc.label || 'Google Drive'} first to upload gallery`,
          'warn'
        );
      }
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(currentAcc.provider || 'google');
      }
      return;
    }

    setTransferMode('gallery');

    // 1. Android Native automatic media pull (fetches all photos & videos from MediaStore)
    if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
      // Permission verification
      if (window.AuraSyncAndroid.hasStoragePermissions && !window.AuraSyncAndroid.hasStoragePermissions()) {
        if (onShowToast) {
          onShowToast(
            isRtl
              ? '📸 يرجى السماح للتطبيق بالوصول إلى المعرض (الصور والفيديوهات) لسحبها بالكامل'
              : '📸 Please grant gallery permission to transfer your media',
            'info'
          );
        }
        window.AuraSyncAndroid.requestStoragePermissions();
        return;
      }

      let nativeCount = 0;
      try {
        nativeCount = window.AuraSyncAndroid.getGalleryMediaTotalCount();
      } catch (_) {}

      // If permissions were just requested, nativeCount will be 0.
      // The onAuraSyncPermissionsResult callback will retry handleStartGalleryTransfer.
      if (nativeCount <= 0 && window.AuraSyncAndroid.hasStoragePermissions && !window.AuraSyncAndroid.hasStoragePermissions()) {
        // Permissions dialog just opened — wait for callback
        return;
      }

      if (nativeCount > 0) {
        setIsBackingUpGallery(true);
        setGalleryDone(false);
        setGalleryProgress(1);
        setGalleryStats({ photos: nativeCount, videos: 0, total: nativeCount });
        setGalleryCurrentFile(isRtl ? `جاري فحص وسحب ${nativeCount.toLocaleString()} ملف من المعرض...` : `Scanning ${nativeCount.toLocaleString()} gallery items…`);

        try {
          const res = await mobileEngine.pullEntireGalleryNative({
            account: currentAcc,
            onStatus: (st) => setGalleryCurrentFile(st),
            onProgress: ({ overallPercent, currentFileName, speedMBps, fileIndex, totalFiles }) => {
              setGalleryProgress(overallPercent);
              setGalleryCurrentFile(currentFileName);
              setGallerySpeed(speedMBps);
              setGalleryStats({ photos: fileIndex, videos: 0, total: totalFiles });
            }
          });

          if (res.successful && res.successful.length > 0) {
            setGalleryProgress(100);
            triggerHaptic(60);
            setTimeout(() => {
              setIsBackingUpGallery(false);
              setGalleryDone(true);
              if (onShowToast) {
                onShowToast(
                  isRtl
                    ? `✓ تم سحب ونقل المعرض بالكامل (${res.successful.length.toLocaleString()} ملف) إلى مجلد ${AURASYNC_MOBILE_FOLDER}/galary في ${currentAcc.label || 'السحابة'} بنجاح ومزامنته!`
                    : `✓ Pulled and synced ${res.successful.length.toLocaleString()} items to ${AURASYNC_MOBILE_FOLDER}/galary!`,
                  'success'
                );
              }
            }, 600);
          } else {
            setIsBackingUpGallery(false);
            setGalleryDone(false);
            const errDetail = res.failed && res.failed.length > 0 ? res.failed[0].error : '';
            if (onShowToast) {
              onShowToast(
                isRtl
                  ? `⚠️ لم يتم نقل ملفات المعرض${errDetail ? ' (' + errDetail + ')' : ''}. يرجى التحقق من اتصال الإنترنت وصلاحيات المعرض`
                  : `⚠️ No gallery files transferred${errDetail ? ': ' + errDetail : ''}`,
                'error'
              );
            }
          }
          return;
        } catch (err) {
          setIsBackingUpGallery(false);
          if (onShowToast) {
            onShowToast(isRtl ? `خطأ أثناء سحب المعرض: ${err.message}` : `Gallery pull error: ${err.message}`, 'error');
          }
          return;
        }
      } else {
        // nativeCount === 0: Fallback to direct native picker launcher
        if (onShowToast) {
          onShowToast(
            isRtl
              ? 'ℹ️ لم يتم العثور على صور بالمعرض أو جاري فتح منتقي الوسائط...'
              : 'ℹ️ No media in scan, opening media picker…',
            'info'
          );
        }
        if (window.AuraSyncAndroid.launchNativeMediaPicker) {
          window.AuraSyncAndroid.launchNativeMediaPicker('gallery');
          return;
        }
      }
    }

    // 2. Web browser / Simulator fallback to gallery picker
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
    }
  }, [accounts, isRtl, onShowToast, triggerHaptic]);

  // Hook into native permissions result callback
  useEffect(() => {
    window.onAuraSyncPermissionsResult = (granted) => {
      if (granted) {
        if (onShowToast) {
          onShowToast(
            isRtl
              ? '✓ تم تفعيل إذن المعرض بنجاح! جاري سحب المعرض الآن...'
              : '✓ Gallery permission granted! Starting transfer…',
            'success'
          );
        }
        handleStartGalleryTransfer();
      } else {
        if (onShowToast) {
          onShowToast(
            isRtl
              ? '⚠️ لم يتم منح إذن الوصول إلى الصور والفيديوهات من إعدادات الهاتف'
              : '⚠️ Media permission was not granted',
            'warn'
          );
        }
      }
    };
    return () => {
      delete window.onAuraSyncPermissionsResult;
    };
  }, [handleStartGalleryTransfer, isRtl, onShowToast]);

  const handleGalleryFilesSelected = useCallback((e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const fileArray = Array.from(selected);
    if (e.target) e.target.value = '';
    setTransferMode('gallery');
    executeTransfer(fileArray, 'galary');
  }, [executeTransfer]);

  const handleStartGalleryBackup = handleStartGalleryTransfer;

  // One-click Free Up Device Space (128GB)
  const handleStartFreeUpSpace = useCallback(() => {
    triggerHaptic(25);
    if (accounts.length === 0) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ اربط سحابتك أولاً لنقل الملفات وتفريغ ذاكرة الجهاز بأمان'
            : '⚠️ Connect cloud storage first to safely free device space',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }
    if (freeSpaceInputRef.current) {
      freeSpaceInputRef.current.click();
    }
  }, [accounts.length, isRtl, onShowToast, triggerHaptic]);

  // Connect cloud provider with real OAuth
  const handleConnectCloud = (providerId) => {
    triggerHaptic(30);
    setShowAddModal(false);

    const provNames = {
      google: 'Google Drive',
      onedrive: 'Microsoft OneDrive',
      dropbox: 'Dropbox',
      offline: 'الخزنة المحلية',
    };
    const provName = provNames[providerId] || 'Cloud Storage';

    if (providerId === 'offline') {
      const acc = mobileEngine.enableOfflineMode();
      setAccounts([acc]);
      if (onShowToast) onShowToast(isRtl ? '✓ تم تفعيل الخزنة المحلية' : '✓ Offline Vault enabled', 'success');
      return;
    }

    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
      window.AuraSyncAndroid.startRealOAuth(providerId);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `جاري فتح متصفح الهاتف لتسجيل الدخول الفعلي في ${provName}...`
            : `Opening browser for real ${provName} sign-in…`,
          'info'
        );
      }
      return;
    }

    // Browser fallback
    let savedEmail = 'asa266397@gmail.com';
    try {
      savedEmail = localStorage.getItem('aurasync_last_login_email') || 'asa266397@gmail.com';
    } catch (_) {}
    const acc = mobileEngine.addAccount(providerId, savedEmail, provName);
    setAccounts([acc]);
  };

  const handleDisconnect = (providerId, label) => {
    triggerHaptic(20);
    mobileEngine.removeAccount(providerId);
    if (onShowToast) {
      onShowToast(
        isRtl ? `تم فصل حساب ${label}` : `Disconnected ${label}`,
        'info'
      );
    }
  };

  const colors = {
    card: isDark ? '#111726' : '#ffffff',
    cardBorder: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    cardGlow: isDark ? '0 4px 24px rgba(0, 0, 0, 0.25)' : '0 2px 12px rgba(0, 0, 0, 0.03)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    primary: '#2563eb',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hidden file input for general files sync (Option 1: مزامنة ملفات -> aurasync-mobile) */}
      <input
        ref={filesInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleGeneralFilesSelected}
      />

      {/* Hidden file input for gallery picker fallback (Option 2: سحب المعرض -> aurasync-mobile/galary) */}
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleGalleryFilesSelected}
      />

      {/* Hidden file input for free space backup */}
      <input
        ref={freeSpaceInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleGeneralFilesSelected}
      />

      {/* ── 1. Connected Cloud Capsule (هادئة وناعمة) ───────────────────────── */}
      {accounts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            background: colors.card,
            borderRadius: 20,
            padding: '12px 16px',
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: colors.cardGlow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {accounts[0].isOffline || accounts[0].id === 'offline' ? (
                  <OfflineVaultIcon />
                ) : accounts[0].id === 'google' ? (
                  <GoogleDriveIcon />
                ) : accounts[0].id === 'onedrive' ? (
                  <OneDriveIcon />
                ) : accounts[0].id === 'mega' ? (
                  <MegaIcon />
                ) : (
                  <DropboxIcon />
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                    {accounts[0].label}
                  </span>
                  <span
                    title={
                      accounts[0].isOffline
                        ? 'الخزنة المحلية (أوفلاين)'
                        : accounts[0].accessToken
                          ? 'متصل بالسحابة (نشط)'
                          : 'غير مسجل الدخول'
                    }
                    style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: accounts[0].isOffline
                        ? '#64748b'
                        : accounts[0].accessToken
                          ? '#10b981'
                          : '#f59e0b',
                      boxShadow: accounts[0].accessToken
                        ? '0 0 8px rgba(16, 185, 129, 0.7)'
                        : '0 0 8px rgba(245, 158, 11, 0.7)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>
                  {accounts[0].email}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleDisconnect(accounts[0].id, accounts[0].label)}
              style={{
                background: 'transparent',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '5px 10px',
                borderRadius: 10,
              }}
            >
              {isRtl ? 'تبديل' : 'Change'}
            </button>
          </div>

          {/* Re-authentication banner if token is missing */}
          {!accounts[0].isOffline && !accounts[0].accessToken && (
            <div
              onClick={() => {
                triggerHaptic(25);
                if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
                  window.AuraSyncAndroid.startRealOAuth(accounts[0].provider || 'google');
                }
              }}
              style={{
                padding: '11px 14px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.12))',
                border: '1.5px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <div style={{ textAlign: isRtl ? 'right' : 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#f59e0b' }}>
                    {isRtl ? 'تسجيل الدخول الفعلي مطلوب للرفع إلى السحابة' : 'Sign-in required for cloud upload'}
                  </div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>
                    {isRtl ? 'اضغط هنا للربط مع Google Drive وتفعيل ظهور الملفات بسحابتك' : 'Tap to sign in with Google Drive'}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 900, padding: '5px 11px', borderRadius: 8,
                background: '#f59e0b', color: '#000',
              }}>
                {isRtl ? 'تسجيل الآن' : 'Sign In'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => { triggerHaptic(20); setShowAddModal(true); }}
          style={{
            background: isDark ? 'rgba(37, 99, 235, 0.08)' : '#eff6ff',
            borderRadius: 20,
            padding: '14px 18px',
            border: '1px dashed rgba(37, 99, 235, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>☁️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>
                {isRtl ? 'ربط السحابة (Google Drive / OneDrive)' : 'Connect Cloud Storage'}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>
                {isRtl ? 'اضغط للربط وحفظ ملفاتك في سحابتك بأمان' : 'Tap to connect and start syncing'}
              </div>
            </div>
          </div>
          <span style={{ color: '#3b82f6', fontSize: 18, fontWeight: 700 }}>+</span>
        </div>
      )}

      {/* ── 2. Unified Cloud Transfer & Sync Hub (الخيارين: 1- مزامنة ملفات | 2- سحب المعرض كامل) ── */}
      <div style={{
        background: colors.card,
        borderRadius: 24,
        padding: '24px 18px',
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: colors.cardGlow,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Top Header & Multi-Device Sync Pill */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52, height: 52, borderRadius: 18,
            background: isDark ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(124, 58, 237, 0.2))' : 'linear-gradient(135deg, #dbeafe, #ede9fe)',
            color: '#3b82f6', marginBottom: 12,
            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.15)',
          }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
              <polyline points="12 13 12 9 10 11"/>
            </svg>
          </div>

          <h2 style={{ fontSize: 17, fontWeight: 900, color: colors.text, margin: '0 0 4px' }}>
            {isRtl ? 'مركز النقل والمزامنة السحابية' : 'Cloud Sync & Media Transfer'}
          </h2>
          <p style={{ fontSize: 11, color: colors.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>
            {isRtl
              ? 'اختر نوع العملية لحفظ بياناتك في سحابتك ومزامنتها بين أجهزتك فوراً'
              : 'Select transfer mode to backup and sync your data with other devices'}
          </p>

          {/* Device Sync Status Pill */}
          <div
            onClick={handleManualSync}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 999,
              background: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}
            title={isRtl ? 'اضغط لتحديث المزامنة مع كافة الهواتف' : 'Tap to sync with all phones now'}
          >
            <span style={{
              fontSize: 11,
              display: 'inline-block',
              animation: isManualSyncing ? 'spin 1s linear infinite' : 'none',
            }}>
              🔄
            </span>
            <span>
              {isManualSyncing
                ? (isRtl ? 'جاري المزامنة مع الأجهزة...' : 'Syncing with devices…')
                : (uploadedFiles.length > 0
                    ? (isRtl ? `مزامنة الأجهزة نشطة (${uploadedFiles.length} ملف)` : `Device Sync Active (${uploadedFiles.length} files)`)
                    : (isRtl ? 'مزامنة الأجهزة نشطة عبر نفس الحساب' : 'Device Sync Active via Same Account'))
              }
            </span>
          </div>
        </div>

        {/* ── Option 1: مزامنة ملفات ── */}
        <div style={{
          background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
          borderRadius: 18,
          padding: '16px',
          border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          transition: 'all 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3b82f6', fontSize: 18,
              }}>
                📁
              </div>
              <div style={{ textAlign: isRtl ? 'right' : 'left' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: colors.text }}>
                  {isRtl ? '1. مزامنة ملفات' : '1. Sync Files'}
                </h3>
                <span style={{ fontSize: 10, color: colors.textMuted }}>
                  {isRtl ? 'مستندات، أرشيف، ملفات عامة، أو وسائط' : 'Documents, archives, media or any files'}
                </span>
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
              background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
              color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.25)',
              fontFamily: 'monospace',
            }}>
              /{AURASYNC_MOBILE_FOLDER}
            </span>
          </div>

          <p style={{ fontSize: 11, color: colors.textMuted, margin: 0, lineHeight: 1.4, textAlign: isRtl ? 'right' : 'left' }}>
            {isRtl
              ? 'مزامنة واختيار أي ملفات أو وسائط وحفظها مباشرة داخل مجلد السحابة الرئيسي.'
              : 'Choose any files and sync them directly to your root cloud folder.'}
          </p>

          <button
            onClick={handleStartFilesSync}
            disabled={isBackingUpGallery}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 12,
              border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.3)'}`,
              background: isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff',
              color: '#3b82f6',
              fontSize: 12,
              fontWeight: 800,
              cursor: isBackingUpGallery ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            <span>📂</span>
            <span>{isRtl ? 'اختيار ومزامنة ملفات الآن' : 'Select & Sync Files Now'}</span>
          </button>
        </div>

        {/* ── Option 2: سحب المعرض كامل (PRO Highlighted) ── */}
        <div style={{
          background: isDark
            ? 'linear-gradient(145deg, rgba(37, 99, 235, 0.1) 0%, rgba(124, 58, 237, 0.12) 100%)'
            : 'linear-gradient(145deg, #f0fdf4 0%, #ede9fe 100%)',
          borderRadius: 18,
          padding: '16px',
          border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.35)' : 'rgba(124, 58, 237, 0.25)'}`,
          boxShadow: isDark ? '0 6px 20px rgba(124, 58, 237, 0.12)' : '0 4px 14px rgba(124, 58, 237, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Top Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: '#ffffff', boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
            }}>
              {isRtl ? '⚡ نقل شامل وتلقائي' : '⚡ Full Auto-Transfer'}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
              background: isDark ? 'rgba(124, 58, 237, 0.18)' : '#f5f3ff',
              color: '#a855f7', border: '1px solid rgba(124, 58, 237, 0.3)',
              fontFamily: 'monospace',
            }}>
              /{AURASYNC_MOBILE_FOLDER}/galary
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#ffffff', fontSize: 18,
              boxShadow: '0 3px 12px rgba(37, 99, 235, 0.3)',
            }}>
              📸
            </div>
            <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, margin: 0, color: colors.text }}>
                {isRtl ? '2. سحب المعرض كامل' : '2. Pull Entire Gallery'}
              </h3>
              <span style={{ fontSize: 10, color: colors.textMuted }}>
                {isRtl ? 'سحب كل الصور والفيديوهات تلقائياً (حتى 40,000+ ملف)' : 'Automatic transfer for all photos & videos (40,000+ files)'}
              </span>
            </div>
          </div>

          <p style={{ fontSize: 11, color: colors.textMuted, margin: 0, lineHeight: 1.4, textAlign: isRtl ? 'right' : 'left' }}>
            {isRtl
              ? 'يسحب كل محتويات المعرض تلقائياً وينشئ مجلد galary مخصص داخل aurasync-mobile لنقل وحفظ الألبوم كاملاً.'
              : 'Pulls your complete gallery and creates a dedicated galary folder inside aurasync-mobile.'}
          </p>

          <button
            onClick={handleStartGalleryTransfer}
            disabled={isBackingUpGallery}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
              cursor: isBackingUpGallery ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 18px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            {isBackingUpGallery && transferMode === 'gallery' ? (
              <>
                <svg className="animate-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                <span>{isRtl ? `جاري سحب المعرض (${galleryProgress}%)...` : `Pulling Gallery (${galleryProgress}%)…`}</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>{isRtl ? 'سحب المعرض كامل إلى السحابة الآن' : 'Pull Entire Gallery to Cloud Now'}</span>
              </>
            )}
          </button>
        </div>

        {/* Feature Badges Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingTop: 4,
          fontSize: 10,
          fontWeight: 700,
          color: colors.textMuted,
        }}>
          <span>✨ {isRtl ? 'جودة أصلية 100%' : '100% Original Quality'}</span>
          <span>•</span>
          <span>⚡ {isRtl ? 'سرعة فائقة' : 'Ultra Fast'}</span>
          <span>•</span>
          <span>🔒 {isRtl ? 'حفظ مشفر' : 'Encrypted Safe'}</span>
        </div>
      </div>

      {/* ── 5. Transfer Progress Overlay ─────────────────────────────────────── */}
      {isBackingUpGallery && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 380,
            background: colors.card, borderRadius: 28, padding: 26,
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)', textAlign: 'center',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 20,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
            }}>
              <svg className="animate-spin" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              </svg>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 900, color: colors.text, margin: '0 0 6px' }}>
              {transferMode === 'gallery'
                ? (isRtl ? 'جاري سحب المعرض كامل إلى مجلد galary' : 'Pulling entire gallery to galary folder')
                : (isRtl ? 'جاري مزامنة الملفات إلى مجلد السحابة' : 'Syncing files to cloud folder')}
            </h3>

            <p style={{ fontSize: 11, color: colors.textMuted, margin: '0 0 16px', fontFamily: 'monospace' }}>
              📁 {AURASYNC_MOBILE_FOLDER}{transferMode === 'gallery' ? '/galary' : ''} • ⚡ {gallerySpeed} MB/s
            </p>

            {/* Progress Bar */}
            <div style={{
              width: '100%', height: 10, borderRadius: 99,
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              overflow: 'hidden', margin: '0 0 12px',
            }}>
              <div style={{
                width: `${galleryProgress}%`, height: '100%', borderRadius: 99,
                background: 'linear-gradient(90deg, #2563eb, #7c3aed, #10b981)',
                boxShadow: '0 0 12px rgba(37, 99, 235, 0.6)',
                transition: 'width 0.2s ease',
              }}/>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 14 }}>
              <span>{galleryProgress}%</span>
              <span>{galleryStats.total > 0 ? `${galleryStats.total} ملف` : ''}</span>
            </div>

            <div style={{
              padding: '10px', borderRadius: 14,
              background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
              fontSize: 11, color: colors.textMuted,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {galleryCurrentFile}
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10, color: '#10b981', fontWeight: 700 }}>
              <span>🔒 {isRtl ? 'تشفير AES-256 تام' : 'AES-256 Encrypted'}</span>
              <span>•</span>
              <span>⚡ {isRtl ? 'مستمر بالخلفية حتى مع إغلاق الشاشة' : 'Keeps running in background'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Cloud Connect Modal ────────────────────────────────────────── */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: colors.card, borderRadius: 28, padding: 24,
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: colors.text, margin: 0 }}>
                {isRtl ? 'اختر سحابتك للربط' : 'Select Cloud to Connect'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  width: 28, height: 28, borderRadius: 10,
                  background: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                  border: 'none', color: colors.textMuted, cursor: 'pointer',
                  fontSize: 14, fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
              {isRtl
                ? `بمجرد تسجيل الدخول في أي سحابة، سيقوم AuraSync تلقائياً بإنشاء مجلد "${AURASYNC_MOBILE_FOLDER}" وتوجيه كافة النسخ الاحتياطية إليه.`
                : `Connecting any cloud automatically creates "${AURASYNC_MOBILE_FOLDER}" as your safe destination.`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => handleConnectCloud('google')}
                disabled={Boolean(connectingProvider)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 16,
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                  border: `1px solid ${colors.cardBorder}`,
                  color: colors.text, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}
              >
                <GoogleDriveIcon />
                <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
                  <div>Google Drive</div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>15 GB مجاناً • إنشاء {AURASYNC_MOBILE_FOLDER}</div>
                </div>
                <span>→</span>
              </button>

              <button
                onClick={() => handleConnectCloud('onedrive')}
                disabled={Boolean(connectingProvider)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 16,
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                  border: `1px solid ${colors.cardBorder}`,
                  color: colors.text, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}
              >
                <OneDriveIcon />
                <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
                  <div>Microsoft OneDrive</div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>5 GB مجاناً • إنشاء {AURASYNC_MOBILE_FOLDER}</div>
                </div>
                <span>→</span>
              </button>

              <button
                onClick={() => handleConnectCloud('dropbox')}
                disabled={Boolean(connectingProvider)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 16,
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                  border: `1px solid ${colors.cardBorder}`,
                  color: colors.text, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}
              >
                <DropboxIcon />
                <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
                  <div>Dropbox</div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>2 GB مجاناً • إنشاء {AURASYNC_MOBILE_FOLDER}</div>
                </div>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
