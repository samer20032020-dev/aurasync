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
  version = '1.0.64',
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
  const [showGalleryConfirmModal, setShowGalleryConfirmModal] = useState(false);
  const [detectedGalleryCount, setDetectedGalleryCount] = useState(0);
  const [pendingResumeSession, setPendingResumeSession] = useState(null);
  const [showResumeModal, setShowResumeModal] = useState(false);

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
        setGalleryDone(successCount > 0);
        if (onShowToast) {
          if (successCount === 0 && failedCount > 0) {
            const firstError = result.failed[0]?.error || (isRtl ? 'حدث خطأ أثناء نقل الملفات' : 'Transfer failed');
            onShowToast(isRtl ? `⚠️ فشل النقل: ${firstError}` : `⚠️ Transfer failed: ${firstError}`, 'error');
          } else if (failedCount > 0) {
            onShowToast(
              isRtl
                ? `⚠️ تم نقل ${successCount.toLocaleString()} ملف (وفشل ${failedCount}) في ${targetCloudName}`
                : `⚠️ Transferred ${successCount.toLocaleString()} (${failedCount} failed) to ${targetCloudName}`,
              'warn'
            );
          } else if (successCount > 0) {
            const skippedDups = result.successful ? result.successful.filter(s => s.skipped).length : 0;
            const uploadedNew = successCount - skippedDups;
            let msg = '';
            if (skippedDups > 0 && uploadedNew > 0) {
              msg = isRtl
                ? `✓ تم رفع ${uploadedNew.toLocaleString()} جديد وتخطي ${skippedDups.toLocaleString()} مكرر! الملفات محفوظة بالسحابة.`
                : `✓ Uploaded ${uploadedNew.toLocaleString()} and skipped ${skippedDups.toLocaleString()} duplicates!`;
            } else if (skippedDups > 0 && uploadedNew === 0) {
              msg = isRtl
                ? `✓ جميع الملفات (${skippedDups.toLocaleString()}) محفوظة مسبقاً بالسحابة بأمان ولم يتم استهلاك سعة إضافية!`
                : `✓ All files (${skippedDups.toLocaleString()}) already safely in cloud!`;
            } else {
              msg = isRtl
                ? `✓ تم نقل ${successCount.toLocaleString()} ملف إلى مجلد ${targetFolderDisplay} في ${targetCloudName} بنجاح ومزامنته!`
                : `✓ Transferred ${successCount.toLocaleString()} files to ${targetFolderDisplay} in ${targetCloudName} and synced!`;
            }
            onShowToast(msg, 'success');

            if (mobileEngine.settings.smartCleanAlert !== false) {
              setTimeout(() => {
                onShowToast(
                  isRtl
                    ? '🧹 اقتراح تفريغ المساحة: ملفاتك أصبحت بأمان في السحابة! يمكنك الآن تفريغ مساحة الهاتف من المعرض.'
                    : '🧹 Free up space tip: Files backed up to cloud! You can now free up phone space.',
                  'info'
                );
              }, 3000);
            }
          }
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

  // Detect interrupted session when app is launched / reopened
  useEffect(() => {
    const saved = mobileEngine.getPendingGallerySession();
    if (saved && saved.inProgress && (saved.totalCount - saved.processed > 0)) {
      setPendingResumeSession(saved);
      setShowResumeModal(true);
    }
  }, []);

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

  // Option 2: سحب المعرض كامل — يطلب التأكيد أولاً ثم ينسخ كافة الصور والفيديوهات إلى aurasync-mobile/galary
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

    // Permission verification
    if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
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
      setDetectedGalleryCount(nativeCount);
    }

    // Open confirmation modal so the user confirms full gallery copying
    setShowGalleryConfirmModal(true);
  }, [accounts, isRtl, onShowToast, triggerHaptic]);

  const handleConfirmGalleryTransfer = useCallback(async () => {
    setShowGalleryConfirmModal(false);
    triggerHaptic(30);

    const currentAcc = accounts[0];
    if (!currentAcc) return;

    setTransferMode('gallery');

    // 1. Android Native automatic media pull (fetches all photos & videos from MediaStore)
    if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
      let nativeCount = detectedGalleryCount;
      if (nativeCount <= 0) {
        try {
          nativeCount = window.AuraSyncAndroid.getGalleryMediaTotalCount();
        } catch (_) {}
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

          if (res.cancelled) {
            setIsBackingUpGallery(false);
            setGalleryDone(false);
            return;
          }

          if (res.successful && res.successful.length > 0) {
            setGalleryProgress(100);
            triggerHaptic(60);
            setTimeout(() => {
              setIsBackingUpGallery(false);
              setGalleryDone(true);
              if (onShowToast) {
                onShowToast(
                  isRtl
                    ? `✓ تم نسخ ونقل المعرض بالكامل (${res.successful.length.toLocaleString()} ملف) إلى مجلد ${AURASYNC_MOBILE_FOLDER}/galary في ${currentAcc.label || 'السحابة'} بنجاح!`
                    : `✓ Copied full gallery (${res.successful.length.toLocaleString()} items) to ${AURASYNC_MOBILE_FOLDER}/galary!`,
                  'success'
                );

                if (mobileEngine.settings.smartCleanAlert !== false) {
                  setTimeout(() => {
                    onShowToast(
                      isRtl
                        ? '🧹 اقتراح تفريغ المساحة: تم حفظ كامل المعرض بالسحابة بأمان! يمكنك تفريغ مساحة الهاتف من المعرض.'
                        : '🧹 Free up space tip: Full gallery backed up! You can now free up phone storage.',
                      'info'
                    );
                  }, 3500);
                }
              }
            }, 600);
          } else if (res.alreadySyncedCount && res.alreadySyncedCount > 0 && (!res.failed || res.failed.length === 0)) {
            setGalleryProgress(100);
            triggerHaptic(40);
            setTimeout(() => {
              setIsBackingUpGallery(false);
              setGalleryDone(true);
              if (onShowToast) {
                onShowToast(
                  isRtl
                    ? `✓ كافة ملفات المعرض (${res.alreadySyncedCount.toLocaleString()} ملف) منسوخة ومحفوظة مسبقاً في السحابة بأمان!`
                    : `✓ All gallery media (${res.alreadySyncedCount.toLocaleString()} items) already synced and safe in cloud!`,
                  'success'
                );
              }
            }, 400);
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
            onShowToast(isRtl ? `خطأ أثناء نسخ المعرض: ${err.message}` : `Gallery copy error: ${err.message}`, 'error');
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
  }, [accounts, detectedGalleryCount, isRtl, onShowToast, triggerHaptic]);

  const handleCancelGalleryTransfer = useCallback(() => {
    triggerHaptic(30);
    mobileEngine.cancelGalleryPull();
    setIsBackingUpGallery(false);
    if (onShowToast) {
      onShowToast(
        isRtl
          ? '⏸️ تم إيقاف عملية نسخ المعرض. تم حفظ تقدمك ويمكنك الاستئناف في أي وقت'
          : '⏸️ Gallery copy paused. Progress saved and can be resumed anytime',
        'info'
      );
    }
  }, [isRtl, onShowToast, triggerHaptic]);

  const handleResumeSession = useCallback(() => {
    setShowResumeModal(false);
    triggerHaptic(30);
    handleConfirmGalleryTransfer();
  }, [handleConfirmGalleryTransfer, triggerHaptic]);

  const handleDismissResumeSession = useCallback(() => {
    setShowResumeModal(false);
    setPendingResumeSession(null);
    mobileEngine.clearPendingGallerySession();
    triggerHaptic(15);
    if (onShowToast) {
      onShowToast(isRtl ? 'تم إلغاء واستبعاد الجلسة السابقة' : 'Previous session discarded', 'info');
    }
  }, [isRtl, onShowToast, triggerHaptic]);

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
                touchAction: 'manipulation',
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

      {/* ── 2. Unified Cloud Transfer & Sync Hub (تصميم أنعم، أبسط، كلمات أقل واحترافي) ── */}
      <div style={{
        background: colors.card,
        borderRadius: 24,
        padding: '20px 16px',
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: colors.cardGlow,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {/* Header: Clean & Minimalist */}
        <div style={{ textAlign: 'center', marginBottom: 2 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 46, height: 46, borderRadius: 16,
            background: isDark ? 'rgba(59, 130, 246, 0.12)' : '#eff6ff',
            color: '#3b82f6', marginBottom: 8,
          }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
              <polyline points="12 13 12 9 10 11"/>
            </svg>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 800, color: colors.text, margin: '0 0 3px' }}>
            {isRtl ? 'المزامنة السحابية' : 'Cloud Sync'}
          </h2>
          <p style={{ fontSize: 11, color: colors.textMuted, margin: '0 0 10px' }}>
            {isRtl ? 'نسخ احتياطي فوري ومزامنة مشفرة لكافة أجهزتك' : 'Instant encrypted backup and multi-device sync'}
          </p>

          {/* Device Sync Status Badge */}
          <div
            onClick={handleManualSync}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              background: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#10b981',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
            title={isRtl ? 'تحديث المزامنة' : 'Sync now'}
          >
            <span style={{
              fontSize: 10,
              display: 'inline-block',
              animation: isManualSyncing ? 'spin 1s linear infinite' : 'none',
            }}>
              🔄
            </span>
            <span>
              {isManualSyncing
                ? (isRtl ? 'جاري المزامنة...' : 'Syncing…')
                : (uploadedFiles.length > 0
                    ? (isRtl ? `متزامن (${uploadedFiles.length} ملف)` : `Synced (${uploadedFiles.length} files)`)
                    : (isRtl ? 'المزامنة نشطة' : 'Sync Active'))
              }
            </span>
          </div>
        </div>

        {/* ── Card 1: نسخ المعرض كامل (Primary / Clean & Soft) ── */}
        <div style={{
          background: isDark
            ? 'linear-gradient(145deg, rgba(37, 99, 235, 0.08), rgba(124, 58, 237, 0.1))'
            : '#f8fafc',
          borderRadius: 20,
          padding: '16px',
          border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.25)' : 'rgba(124, 58, 237, 0.15)'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 14,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#ffffff', fontSize: 18,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              flexShrink: 0,
            }}>
              📸
            </div>
            <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: colors.text }}>
                  {isRtl ? 'نسخ المعرض كامل' : 'Gallery Backup'}
                </h3>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                  background: isDark ? 'rgba(124, 58, 237, 0.2)' : '#ede9fe',
                  color: isDark ? '#c084fc' : '#7c3aed',
                }}>
                  {isRtl ? 'تلقائي' : 'Auto'}
                </span>
              </div>
              <span style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginTop: 2 }}>
                {isRtl ? 'نسخ كافة الصور والفيديوهات وحفظها بجودتها الأصلية' : 'Backup all photos & videos in original quality'}
              </span>
            </div>
          </div>

          <button
            onClick={handleStartGalleryTransfer}
            disabled={isBackingUpGallery}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 800,
              cursor: isBackingUpGallery ? 'wait' : 'pointer',
              touchAction: 'manipulation',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            {isBackingUpGallery && transferMode === 'gallery' ? (
              <>
                <svg className="animate-spin" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                <span>{isRtl ? `جاري النسخ (${galleryProgress}%)...` : `Backing up (${galleryProgress}%)…`}</span>
              </>
            ) : (
              <span>{isRtl ? 'سحب المعرض إلى السحابة' : 'Backup Gallery Now'}</span>
            )}
          </button>
        </div>

        {/* ── Card 2: مزامنة ملفات ومستندات (Secondary / Minimalist) ── */}
        <div style={{
          background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
          borderRadius: 20,
          padding: '16px',
          border: `1px solid ${colors.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 14,
              background: isDark ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#3b82f6', fontSize: 18,
              flexShrink: 0,
            }}>
              📁
            </div>
            <div style={{ textAlign: isRtl ? 'right' : 'left', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: colors.text }}>
                  {isRtl ? 'مزامنة ملفات محددة' : 'Sync Specific Files'}
                </h3>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                  background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                  color: colors.textMuted,
                }}>
                  {isRtl ? 'مخصص' : 'Custom'}
                </span>
              </div>
              <span style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginTop: 2 }}>
                {isRtl ? 'اختيار مستندات أو وسائط معينة لحفظها' : 'Select documents or media files to sync'}
              </span>
            </div>
          </div>

          <button
            onClick={handleStartFilesSync}
            disabled={isBackingUpGallery}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 14,
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`,
              background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
              color: colors.text,
              fontSize: 12,
              fontWeight: 700,
              cursor: isBackingUpGallery ? 'wait' : 'pointer',
              touchAction: 'manipulation',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            <span>{isRtl ? 'اختيار ملفات ومزامنتها' : 'Choose Files to Sync'}</span>
          </button>
        </div>

        {/* Feature Badges Footer: Crisp & Elegant */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingTop: 4,
          fontSize: 10,
          color: colors.textMuted,
        }}>
          <span>🔒 {isRtl ? 'تشفير تام' : 'Encrypted'}</span>
          <span>•</span>
          <span>✨ {isRtl ? 'جودة أصلية' : 'Original Quality'}</span>
          <span>•</span>
          <span>⚡ {isRtl ? 'خلفية ذكية' : 'Background Sync'}</span>
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
            position: 'relative',
          }}>
            {/* Cancel (X) Button */}
            <button
              onClick={handleCancelGalleryTransfer}
              title={isRtl ? 'إيقاف النسخ مؤقتاً' : 'Cancel copy'}
              style={{
                position: 'absolute',
                top: 16,
                [isRtl ? 'left' : 'right']: 16,
                width: 32, height: 32,
                borderRadius: '50%',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}`,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                color: colors.textMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 900,
                cursor: 'pointer',
                zIndex: 10,
                transition: 'all 0.2s ease',
              }}
            >
              ✕
            </button>
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

      {/* ── 7. Gallery Full Copy Confirmation Modal ───────────────────────── */}
      {showGalleryConfirmModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 95,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: colors.card, borderRadius: 28, padding: 24,
            border: `1.5px solid ${isDark ? 'rgba(124, 58, 237, 0.4)' : 'rgba(124, 58, 237, 0.25)'}`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: 18,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(124, 58, 237, 0.4)',
            }}>
              📸
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 900, color: colors.text, margin: '0 0 10px' }}>
              {isRtl ? 'نسخ نسخة كاملة من المعرض إلى السحابة؟' : 'Copy Full Gallery to Cloud?'}
            </h3>

            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
              {isRtl
                ? `هل تريد بدء فحص ونسخ جميع الصور والفيديوهات الموجودة في معرض هاتفك${detectedGalleryCount > 0 ? ` (${detectedGalleryCount.toLocaleString()} ملف)` : ''}، وحفظها بجودتها الأصلية الكاملة في مجلد galary بالسحابة؟`
                : `Do you want to copy all photos & videos${detectedGalleryCount > 0 ? ` (${detectedGalleryCount.toLocaleString()} items)` : ''} from your gallery to the cloud galary folder?`}
            </p>

            {/* Destination Pill */}
            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: isDark ? 'rgba(124, 58, 237, 0.12)' : '#f5f3ff',
              border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.2)'}`,
              marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, color: '#a855f7',
            }}>
              <span>📁 {isRtl ? 'مجلد الوجهة:' : 'Target:'}</span>
              <span style={{ direction: 'ltr', fontFamily: 'monospace' }}>
                {AURASYNC_MOBILE_FOLDER}/galary
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleConfirmGalleryTransfer}
                style={{
                  width: '100%', padding: '14px', borderRadius: 16,
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  color: '#ffffff', fontSize: 13, fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)',
                }}
              >
                {isRtl ? '✓ نعم، ابدأ النسخ الآن' : '✓ Yes, Start Copy Now'}
              </button>

              <button
                onClick={() => setShowGalleryConfirmModal(false)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 16,
                  border: `1px solid ${colors.cardBorder}`,
                  background: 'transparent',
                  color: colors.textMuted, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. Resume Gallery Backup Prompt Modal (when reopened after app kill) ── */}
      {showResumeModal && pendingResumeSession && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 96,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: colors.card, borderRadius: 28, padding: 24,
            border: `1.5px solid ${isDark ? 'rgba(59, 130, 246, 0.4)' : 'rgba(37, 99, 235, 0.25)'}`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: 18,
              background: 'linear-gradient(135deg, #10b981, #2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
            }}>
              🔄
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 900, color: colors.text, margin: '0 0 10px' }}>
              {isRtl ? 'استئناف نسخ المعرض إلى السحابة؟' : 'Resume Gallery Cloud Backup?'}
            </h3>

            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
              {isRtl
                ? `عثر التطبيق على عملية نسخ سابقة لم تكتمل، تبقى منها ${(pendingResumeSession.totalCount - pendingResumeSession.processed).toLocaleString()} ملف من أصل ${pendingResumeSession.totalCount.toLocaleString()}. هل ترغب في متابعة النسخ من حيث توقفت؟`
                : `A previous gallery backup was paused with ${(pendingResumeSession.totalCount - pendingResumeSession.processed).toLocaleString()} items remaining out of ${pendingResumeSession.totalCount.toLocaleString()}. Do you want to resume now?`}
            </p>

            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: isDark ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff',
              border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.3)' : 'rgba(37, 99, 235, 0.2)'}`,
              marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, color: '#3b82f6',
            }}>
              <span>📁 {isRtl ? 'المجلد:' : 'Target:'}</span>
              <span style={{ direction: 'ltr', fontFamily: 'monospace' }}>
                {AURASYNC_MOBILE_FOLDER}/galary
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleResumeSession}
                style={{
                  width: '100%', padding: '14px', borderRadius: 16,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #2563eb)',
                  color: '#ffffff', fontSize: 13, fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                }}
              >
                {isRtl ? '⚡ نعم، استئناف النسخ الآن' : '⚡ Yes, Resume Copy Now'}
              </button>

              <button
                onClick={handleDismissResumeSession}
                style={{
                  width: '100%', padding: '12px', borderRadius: 16,
                  border: `1px solid ${colors.cardBorder}`,
                  background: 'transparent',
                  color: colors.textMuted, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? '✕ إلغاء وحذف الجلسة' : '✕ Discard Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
