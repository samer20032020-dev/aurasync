import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

export default function MobileCloudExplorer({
  theme = 'dark',
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState(() => mobileEngine.uploadedFiles || []);
  const [accounts, setAccounts] = useState(() => mobileEngine.accounts || []);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Local phone media state & selection mode
  const [localMediaNames, setLocalMediaNames] = useState(() => mobileEngine.getLocalMediaNames());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [deleteTargetMode, setDeleteTargetMode] = useState('both'); // 'cloud' | 'phone' | 'both'

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  const refreshLocalMedia = useCallback(() => {
    try {
      const names = mobileEngine.getLocalMediaNames();
      setLocalMediaNames(names);
    } catch (_) {}
  }, []);

  // Sync cloud files on mount and subscribe to updates
  useEffect(() => {
    refreshLocalMedia();
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'files_updated') {
        setFiles(data || []);
      }
      if (event === 'accounts_updated') {
        setAccounts(data || []);
      }
    });

    mobileEngine.syncCloudFiles().then(fresh => {
      if (fresh && Array.isArray(fresh)) setFiles(fresh);
    }).catch(() => {});

    const handleFocus = () => refreshLocalMedia();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshLocalMedia();
    });

    if (typeof window !== 'undefined') {
      window.onAuraSyncPermissionsResult = (granted) => {
        if (granted) refreshLocalMedia();
      };
      window.onAuraSyncMediaDeleted = () => {
        refreshLocalMedia();
        mobileEngine.syncCloudFiles().then(fresh => {
          if (fresh) setFiles(fresh);
        }).catch(() => {});
      };
    }

    return () => {
      unsub();
      window.removeEventListener('focus', handleFocus);
      if (typeof window !== 'undefined') {
        delete window.onAuraSyncPermissionsResult;
        delete window.onAuraSyncMediaDeleted;
      }
    };
  }, [refreshLocalMedia]);

  // Fast helper to verify if file exists on phone
  const isItemOnPhone = useCallback((fileName) => {
    if (!fileName) return false;
    const clean = fileName.trim();
    if (localMediaNames && (localMediaNames.has(clean) || localMediaNames.has(clean.toLowerCase()))) {
      return true;
    }
    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.isMediaFileOnPhone) {
      try {
        return window.AuraSyncAndroid.isMediaFileOnPhone(clean);
      } catch (_) {}
    }
    return false;
  }, [localMediaNames]);

  // Manual Trigger to re-sync across all devices
  const handleSyncCloud = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    triggerHaptic(20);
    try {
      refreshLocalMedia();
      const updated = await mobileEngine.syncCloudFiles();
      if (updated) setFiles(updated);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم تحديث المزامنة مع كافة الهواتف والحاسوب (${(updated || []).length} ملف)`
            : `✓ Synced with all devices & PC (${(updated || []).length} files)`,
          'success'
        );
      }
    } catch (err) {
      if (onShowToast) {
        onShowToast(isRtl ? `تعذر تحديث المزامنة: ${err.message}` : `Sync failed: ${err.message}`, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isRtl, isSyncing, onShowToast, triggerHaptic, refreshLocalMedia]);

  // Handle file selection from phone
  const handleSelectFiles = (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    if (accounts.length === 0) {
      triggerHaptic(25);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ يرجى ربط حساب سحابي أولاً من الشاشة الرئيسية قبل رفع الملفات للسحابة!'
            : '⚠️ Please connect a cloud account first from the Home tab before uploading files!',
          'warn'
        );
      }
      return;
    }

    const currentAcc = accounts[0];
    const isUnauthenticated = !currentAcc.isOffline && !currentAcc.accessToken && !currentAcc.refreshToken;

    if (isUnauthenticated) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(currentAcc.provider || 'google');
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `🔑 يلزم تسجيل الدخول الفعلي إلى ${currentAcc.label || 'السحابة'} أولاً لرفع الملفات! جاري فتح المتصفح...`
              : `🔑 Sign in to ${currentAcc.label || 'Cloud'} required! Opening browser...`,
            'warn'
          );
        }
      } else {
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `🔑 حساب ${currentAcc.label || 'السحابة'} غير مصادق برمز وصول نشط. يرجى تسجيل الدخول أولاً من الشاشة الرئيسية.`
              : `🔑 Please sign in to ${currentAcc.label || 'Cloud'} first from the Home tab.`,
            'warn'
          );
        }
      }
      return;
    }

    triggerHaptic(25);
    setIsUploading(true);
    setUploadProgress(5);
    const fileArray = Array.from(selected);

    mobileEngine.uploadBatch(fileArray, {
      account: currentAcc,
      onProgress: ({ overallPercent }) => {
        setUploadProgress(overallPercent);
      }
    }).then((result) => {
      setUploadProgress(100);
      mobileEngine.syncCloudFiles().catch(() => {});
      refreshLocalMedia();
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        const successCount = result.successful ? result.successful.length : 0;
        const failedCount = result.failed ? result.failed.length : 0;
        const targetCloudName = currentAcc?.label || 'السحابة';

        if (successCount === 0 && failedCount > 0) {
          const firstError = result.failed[0]?.error || (isRtl ? 'حدث خطأ أثناء نقل الملفات للسحابة' : 'Failed to transfer files to cloud');
          if (onShowToast) {
            onShowToast(
              isRtl ? `⚠️ فشل الرفع: ${firstError}` : `⚠️ Upload failed: ${firstError}`,
              'error'
            );
          }
        } else if (failedCount > 0) {
          if (onShowToast) {
            onShowToast(
              isRtl
                ? `⚠️ تم رفع ${successCount} ملف وفشل ${failedCount} في ${targetCloudName}`
                : `⚠️ Uploaded ${successCount} file(s), ${failedCount} failed in ${targetCloudName}`,
              'warn'
            );
          }
        } else if (successCount > 0) {
          if (onShowToast) {
            onShowToast(
              isRtl
                ? `✓ تم رفع ${successCount} ملف بنجاح في مجلد ${AURASYNC_MOBILE_FOLDER} في ${targetCloudName}`
                : `✓ Uploaded ${successCount} file(s) to ${AURASYNC_MOBILE_FOLDER} in ${targetCloudName}`,
              'success'
            );
          }
        }
      }, 350);
    }).catch((err) => {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onShowToast) {
        onShowToast(isRtl ? `فشل الرفع: ${err.message}` : `Upload failed: ${err.message}`, 'error');
      }
    });
  };

  const handleDownloadFile = async (file) => {
    triggerHaptic(20);
    try {
      await mobileEngine.downloadFileToPhone(file);
      setTimeout(() => {
        refreshLocalMedia();
        setSelectedFile(prev => prev ? { ...prev } : null);
      }, 350);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `تم تنزيل "${file.name}" إلى استوديو وذاكرة الهاتف بنجاح ✓`
            : `Saved "${file.name}" to phone gallery ✓`,
          'success'
        );
      }
    } catch (err) {
      if (onShowToast) {
        onShowToast(isRtl ? `تعذر تنزيل الملف: ${err.message}` : `Download failed: ${err.message}`, 'error');
      }
    }
  };

  const handleShareFile = (file) => {
    triggerHaptic(20);
    if (window.AuraSyncAndroid?.triggerNativeShare) {
      window.AuraSyncAndroid.triggerNativeShare(file.name, `https://aurasync.local/vault/AuraSync_Mobile/${file.name}`);
    }
    if (onShowToast) {
      onShowToast(isRtl ? 'تم فتح خيارات مشاركة الرابط' : 'Share sheet opened', 'info');
    }
  };

  // Delete single file from cloud only (preserves local phone storage)
  const handleDeleteFile = async (fileId) => {
    triggerHaptic(30);
    try {
      const fileObj = files.find(f => f.id === fileId);
      await mobileEngine.deleteUploadedFiles([fileId], {
        fromCloud: true,
        fromPhone: false,
        files: fileObj ? [fileObj] : []
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFile(null);
      refreshLocalMedia();
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '✓ تم حذف الملف من السحابة فقط (لا يزال محفوظاً على هاتفك)'
            : '✓ File deleted from cloud only (kept on your phone)',
          'info'
        );
      }
      setTimeout(() => {
        mobileEngine.syncCloudFiles().then(fresh => {
          if (fresh) setFiles(fresh);
        }).catch(() => {});
      }, 500);
    } catch (err) {
      if (onShowToast) {
        onShowToast(isRtl ? `تعذر الحذف: ${err.message}` : `Delete failed: ${err.message}`, 'error');
      }
    }
  };

  // Selection mode helpers
  const handleToggleSelectMode = useCallback(() => {
    triggerHaptic(15);
    setIsSelectionMode(prev => {
      if (prev) {
        setSelectedFileIds(new Set());
        return false;
      }
      return true;
    });
  }, [triggerHaptic]);

  const handleExitSelectMode = useCallback(() => {
    triggerHaptic(15);
    setIsSelectionMode(false);
    setSelectedFileIds(new Set());
  }, [triggerHaptic]);

  const handleToggleFileSelection = useCallback((fileId) => {
    triggerHaptic(10);
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, [triggerHaptic]);

  // Filtered files
  const filteredFiles = files.filter(f => {
    const nameMatch = (f.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch) return false;
    if (activeFilter === 'photos') return f.type === 'image';
    if (activeFilter === 'videos') return f.type === 'video';
    if (activeFilter === 'audio') return f.type === 'audio';
    if (activeFilter === 'docs') return f.type === 'doc';
    if (activeFilter === 'both') return isItemOnPhone(f.name);
    if (activeFilter === 'cloud_only') return !isItemOnPhone(f.name);
    return true;
  });

  const handleSelectAll = useCallback(() => {
    triggerHaptic(15);
    if (selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
    }
  }, [filteredFiles, selectedFileIds.size, triggerHaptic]);

  // Confirm and execute batch deletion (Cloud, Phone, or Both)
  const handleConfirmBatchDelete = async () => {
    if (selectedFileIds.size === 0 || isBatchDeleting) return;
    setIsBatchDeleting(true);
    triggerHaptic(30);
    const idsToDelete = Array.from(selectedFileIds);
    const count = idsToDelete.length;

    const fromCloud = deleteTargetMode === 'cloud' || deleteTargetMode === 'both';
    const fromPhone = deleteTargetMode === 'phone' || deleteTargetMode === 'both';

    try {
      const filesMap = new Map((files || []).map(f => [f.id, f]));
      const selectedFilesList = idsToDelete.map(id => filesMap.get(id)).filter(Boolean);
      await mobileEngine.deleteUploadedFiles(idsToDelete, { 
        fromCloud, 
        fromPhone, 
        files: selectedFilesList 
      });

      // Immediate UI synchronization:
      if (fromCloud) {
        setFiles(prev => prev.filter(f => !selectedFileIds.has(f.id)));
      }
      if (fromPhone) {
        setLocalMediaNames(prev => {
          const next = new Set(prev);
          for (const id of idsToDelete) {
            const f = filesMap.get(id);
            if (f && f.name) {
              next.delete(f.name);
              next.delete(f.name.toLowerCase());
            }
          }
          return next;
        });
      }

      setSelectedFileIds(new Set());
      setIsSelectionMode(false);
      setShowBatchDeleteModal(false);
      setTimeout(() => refreshLocalMedia(), 300);

      let msg = '';
      if (deleteTargetMode === 'both') {
        msg = isRtl
          ? `✓ تم حذف ${count} ملف نهائياً من الهاتف والسحابة معاً`
          : `✓ Deleted ${count} file(s) from phone & cloud`;
      } else if (deleteTargetMode === 'phone') {
        msg = isRtl
          ? `✓ تم حذف ${count} ملف من الهاتف فقط (تظل محفوظة بالسحابة)`
          : `✓ Deleted ${count} file(s) from phone only (kept safe in cloud)`;
      } else {
        msg = isRtl
          ? `✓ تم حذف ${count} ملف من السحابة فقط (تظل محفوظة بهاتفك)`
          : `✓ Deleted ${count} file(s) from cloud only (kept on phone)`;
      }

      if (onShowToast) {
        onShowToast(msg, 'success');
      }

      // Re-sync with cloud in background to guarantee 100% exact parity with remote storage
      setTimeout(() => {
        mobileEngine.syncCloudFiles().then(fresh => {
          if (fresh) setFiles(fresh);
        }).catch(() => {});
      }, 500);
    } catch (err) {
      if (onShowToast) {
        onShowToast(
          isRtl ? `تعذر حذف الملفات: ${err.message}` : `Delete failed: ${err.message}`,
          'error'
        );
      }
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const colors = {
    card: isDark ? '#111726' : '#ffffff',
    border: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    cardGlow: isDark ? '0 4px 24px rgba(0, 0, 0, 0.25)' : '0 2px 12px rgba(0, 0, 0, 0.03)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#2563eb',
    accentLight: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
    tileBg: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9',
  };

  const bothCount = files.filter(f => isItemOnPhone(f.name)).length;
  const cloudOnlyCount = files.filter(f => !isItemOnPhone(f.name)).length;

  const filterChips = [
    { id: 'all',        ar: 'الكل',               en: 'All',           count: files.length },
    { id: 'both',       ar: '🟢 الهاتف والسحابة',  en: '🟢 Phone & Cloud', count: bothCount },
    { id: 'cloud_only', ar: '🟡 في السحابة فقط',  en: '🟡 Cloud Only', count: cloudOnlyCount },
    { id: 'photos',     ar: 'الصور',              en: 'Photos',        count: files.filter(f => f.type === 'image').length },
    { id: 'videos',     ar: 'الفيديوهات',        en: 'Videos',        count: files.filter(f => f.type === 'video').length },
    { id: 'docs',       ar: 'المستندات',         en: 'Docs',          count: files.filter(f => f.type === 'doc').length },
  ];

  return (
    <div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInHeader {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
        style={{ display: 'none' }}
        onChange={handleSelectFiles}
      />

      {/* ── Top Bar: Selection Mode Active vs Normal Mode ── */}
      {isSelectionMode ? (
        /* Selection Management Header */
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 16, marginBottom: 16,
          background: isDark ? 'rgba(37,99,235,0.16)' : '#eff6ff',
          border: '1px solid rgba(59,130,246,0.35)',
          boxShadow: '0 4px 18px rgba(37,99,235,0.12)',
          animation: 'fadeInHeader 0.2s ease',
        }}>
          {/* Close/Cancel (X) Button + Selected Counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleExitSelectMode}
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: isDark ? 'rgba(255,255,255,0.12)' : '#ffffff',
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontSize: 15, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.15s',
              }}
              title={isRtl ? 'إلغاء التحديد والخروج (✕)' : 'Cancel selection (✕)'}
            >
              ✕
            </button>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
                {selectedFileIds.size > 0
                  ? (isRtl ? `تم تحديد ${selectedFileIds.size} ملف` : `${selectedFileIds.size} selected`)
                  : (isRtl ? 'اضغط لتحديد الصور...' : 'Select photos...')}
              </div>
              <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>
                {isRtl ? 'اختر الحذف من الهاتف، السحابة، أو كليهما' : 'Choose to delete from phone, cloud, or both'}
              </div>
            </div>
          </div>

          {/* Actions: Select All + Delete from Cloud */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '6px 11px', borderRadius: 10,
                background: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0
                ? (isRtl ? 'إلغاء الكل' : 'Deselect')
                : (isRtl ? 'تحديد الكل' : 'Select All')}
            </button>

            <button
              onClick={() => {
                if (selectedFileIds.size > 0) {
                  triggerHaptic(20);
                  setShowBatchDeleteModal(true);
                }
              }}
              disabled={selectedFileIds.size === 0}
              style={{
                padding: '7px 13px', borderRadius: 10,
                background: selectedFileIds.size > 0 ? '#ef4444' : (isDark ? 'rgba(239,68,68,0.2)' : '#fca5a5'),
                border: 'none',
                color: '#ffffff', fontSize: 11, fontWeight: 800,
                cursor: selectedFileIds.size > 0 ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: selectedFileIds.size > 0 ? 1 : 0.45,
                boxShadow: selectedFileIds.size > 0 ? '0 3px 12px rgba(239,68,68,0.35)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <span>🗑️</span>
              <span>{isRtl ? `حذف (${selectedFileIds.size})` : `Delete (${selectedFileIds.size})`}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Header: Title + Select + Sync + Upload */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 3px', color: colors.text }}>
              {isRtl ? 'معرض الصور والملفات' : 'Cloud Gallery & Media'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.textMuted }}>
              {accounts.length > 0 && !accounts[0].isOffline && !accounts[0].accessToken && !accounts[0].refreshToken ? (
                <div
                  onClick={() => {
                    triggerHaptic(20);
                    if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
                      window.AuraSyncAndroid.startRealOAuth(accounts[0].provider || 'google');
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.7)' }} />
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                    {isRtl ? `تسجيل الدخول مطلوب في ${accounts[0].label || 'السحابة'}` : `Sign-in required for ${accounts[0].label || 'Cloud'}`}
                  </span>
                </div>
              ) : (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.7)' }} />
                  <span>
                    {files.length > 0
                      ? (isRtl ? `${files.length} ملف متزامن مع كافة الأجهزة` : `${files.length} files synced with all devices`)
                      : (isRtl ? `متصل مع ${accounts[0]?.label || 'السحابة'} • متزامن` : `Connected to ${accounts[0]?.label || 'Cloud'} • Synced`)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Multi-select toggle button */}
            {files.length > 0 && (
              <button
                onClick={handleToggleSelectMode}
                style={{
                  height: 38, padding: '0 12px', borderRadius: 12,
                  background: isSelectionMode
                    ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe')
                    : (isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'),
                  border: isSelectionMode
                    ? '1px solid #3b82f6'
                    : `1px solid ${colors.border}`,
                  color: isSelectionMode ? '#3b82f6' : colors.text,
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
                title={isRtl ? 'تحديد صور' : 'Select items'}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span>{isRtl ? 'تحديد' : 'Select'}</span>
              </button>
            )}

            {/* Modern Vector Sync Button */}
            <button
              onClick={handleSyncCloud}
              disabled={isSyncing}
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                border: `1px solid ${colors.border}`,
                color: isSyncing ? '#3b82f6' : colors.text,
                cursor: isSyncing ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              title={isRtl ? 'مزامنة وتحديث الملفات' : 'Sync & refresh files'}
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  display: 'inline-block',
                  animation: isSyncing ? 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' : 'none',
                  transition: 'transform 0.3s ease',
                }}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                <path d="M2.5 11.5a9 9 0 0 1 15.36-5.86L21.5 8M21.5 12.5a9 9 0 0 1-15.36 5.86L2.5 16" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Uploading Progress Indicator */}
      {isUploading && (
        <div style={{
          padding: '12px 16px', borderRadius: 16, marginBottom: 14,
          background: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
          border: '1px solid rgba(59,130,246,0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>
            <span>{isRtl ? `جاري الرفع المشفر إلى مجلد ${AURASYNC_MOBILE_FOLDER}...` : `Uploading to ${AURASYNC_MOBILE_FOLDER}...`}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div style={{ width: '100%', height: 4, borderRadius: 99, background: 'rgba(59,130,246,0.2)', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.2s ease' }}/>
          </div>
        </div>
      )}

      {/* ── Search Input & Filter Chips: Only shown when files exist ── */}
      {files.length > 0 && (
        <>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: isRtl ? undefined : 14, right: isRtl ? 14 : undefined, pointerEvents: 'none' }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={colors.textMuted} strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <input
              type="text"
              placeholder={isRtl ? 'بحث في المعرض...' : 'Search media...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: isRtl ? '10px 38px 10px 14px' : '10px 14px 10px 38px',
                borderRadius: 14,
                background: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 13, outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
            {filterChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => {
                  triggerHaptic(10);
                  setActiveFilter(chip.id);
                }}
                style={{
                  padding: '5px 12px', borderRadius: 999,
                  background: activeFilter === chip.id ? colors.accent : (isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                  border: `1px solid ${activeFilter === chip.id ? colors.accent : colors.border}`,
                  color: activeFilter === chip.id ? '#fff' : colors.textMuted,
                  fontSize: 11, fontWeight: activeFilter === chip.id ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span>{isRtl ? chip.ar : chip.en}</span>
                {chip.count > 0 && (
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 999,
                    background: activeFilter === chip.id ? 'rgba(255,255,255,0.25)' : colors.tileBg,
                  }}>
                    {chip.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Content View: High-Utility Empty State OR Media Grid ───── */}
      {files.length === 0 ? (
        /* Soft, Minimalist Empty State */
        <div style={{
          borderRadius: 24,
          padding: '36px 20px',
          textAlign: 'center',
          background: colors.card,
          border: `1px solid ${colors.border}`,
          boxShadow: colors.cardGlow,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {/* Soft Icon */}
          <div style={{
            width: 60, height: 60, borderRadius: 20,
            background: colors.accentLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3b82f6', marginBottom: 16,
          }}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>

          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px', color: colors.text }}>
            {isRtl ? 'معرضك السحابي جاهز للمزامنة' : 'Your Cloud Gallery is Ready'}
          </h3>

          <p style={{ fontSize: 12, color: colors.textMuted, maxWidth: 300, margin: '0 0 18px', lineHeight: 1.6 }}>
            {isRtl
              ? 'ارفع صورك وفيديوهاتك لتكون محفوظة بجودتها الأصلية ومتاحة فوراً للمزامنة والتنزيل عبر كافة هواتفك وحاسوبك.'
              : 'Upload photos & videos to keep them safe in original quality and synced across all your phones and PC.'}
          </p>

          {/* Re-auth alert if active account is not yet signed in */}
          {accounts.length > 0 && !accounts[0].isOffline && !accounts[0].accessToken && !accounts[0].refreshToken && (
            <div
              onClick={() => {
                triggerHaptic(25);
                if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
                  window.AuraSyncAndroid.startRealOAuth(accounts[0].provider || 'google');
                }
              }}
              style={{
                width: '100%', maxWidth: 310,
                padding: '11px 14px', borderRadius: 14,
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 14, cursor: 'pointer', textAlign: isRtl ? 'right' : 'left',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b' }}>
                    {isRtl ? 'تسجيل الدخول الفعلي مطلوب للمزامنة' : 'Sign-in required for sync'}
                  </div>
                  <div style={{ fontSize: 10, color: colors.textMuted }}>
                    {isRtl ? 'اضغط للمصادقة مع Google Drive والرفع المباشر' : 'Tap to sign in with Google Drive'}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: '#f59e0b', color: '#000' }}>
                {isRtl ? 'تسجيل' : 'Sign In'}
              </span>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            onClick={() => {
              triggerHaptic(20);
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            style={{
              width: '100%', maxWidth: 310,
              padding: '13px 20px', borderRadius: 14,
              background: '#2563eb',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 18px rgba(37, 99, 235, 0.35)',
              marginBottom: 10,
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{isRtl ? 'رفع صور أو فيديوهات الآن' : 'Upload Photos & Videos Now'}</span>
          </button>

          {/* Secondary Action Button */}
          <button
            onClick={handleSyncCloud}
            disabled={isSyncing}
            style={{
              width: '100%', maxWidth: 310,
              padding: '11px 18px', borderRadius: 14,
              background: 'transparent',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              color: colors.text, fontSize: 12, fontWeight: 600,
              cursor: isSyncing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginBottom: 20,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                display: 'inline-block',
                animation: isSyncing ? 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' : 'none',
              }}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6" />
              <path d="M2.5 11.5a9 9 0 0 1 15.36-5.86L21.5 8M21.5 12.5a9 9 0 0 1-15.36 5.86L2.5 16" />
            </svg>
            <span>
              {isSyncing
                ? (isRtl ? 'جاري الفحص والمزامنة...' : 'Syncing with devices…')
                : (isRtl ? 'جلب الصور المرفوعة من هواتفك وحاسوبك' : 'Fetch media from your other devices')}
            </span>
          </button>

          {/* 3 Highlights */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, fontSize: 10, color: colors.textMuted,
            paddingTop: 16, borderTop: `1px solid ${colors.border}`, width: '100%',
          }}>
            <span>✨ {isRtl ? 'جودة أصلية 100%' : 'Original Quality'}</span>
            <span>•</span>
            <span>📱 {isRtl ? 'مزامنة لكافة الهواتف' : 'Multi-Device Sync'}</span>
            <span>•</span>
            <span>🔒 {isRtl ? 'حفظ دائم' : 'Permanent Save'}</span>
          </div>
        </div>
      ) : filteredFiles.length === 0 ? (
        /* Search returned 0 results */
        <div style={{
          borderRadius: 20, padding: '32px 16px', textAlign: 'center',
          background: colors.card, border: `1px solid ${colors.border}`,
        }}>
          <span style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>🔍</span>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: colors.text }}>
            {isRtl ? 'لا توجد نتائج مطابقة' : 'No matching items'}
          </h4>
          <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>
            {isRtl ? 'جرب البحث بكلمة أخرى' : 'Try searching with another keyword'}
          </p>
        </div>
      ) : (
        /* Files Grid with Status Dots & Selection */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
        }}>
          {filteredFiles.map(file => {
            const isImage = file.type === 'image';
            const isVideo = file.type === 'video';
            const onPhone = isItemOnPhone(file.name);
            const isSelected = selectedFileIds.has(file.id);

            return (
              <div
                key={file.id}
                onClick={() => {
                  if (isSelectionMode) {
                    handleToggleFileSelection(file.id);
                  } else {
                    triggerHaptic(12);
                    setSelectedFile(file);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isSelectionMode) {
                    setIsSelectionMode(true);
                    handleToggleFileSelection(file.id);
                  }
                }}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: 12,
                  background: colors.tileBg,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #2563eb' : `1px solid ${colors.border}`,
                  boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.35)' : 'none',
                  transform: isSelected ? 'scale(0.97)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Image / Thumbnail Preview */}
                {isImage && file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: 8, textAlign: 'center',
                  }}>
                    {isImage && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#3b82f6" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                      </svg>
                    )}
                    {isVideo && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                      </svg>
                    )}
                    {!isImage && !isVideo && (
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                    <span style={{
                      fontSize: 10, color: colors.text, fontWeight: 700,
                      marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%'
                    }}>
                      {file.name}
                    </span>
                  </div>
                )}

                {/* Status Indicator Dot / Badge (Top-Left): 🟢 Phone+Cloud vs 🟡 Cloud Only */}
                <div
                  title={
                    onPhone
                      ? (isRtl ? '🟢 محفوظ على الهاتف والسحابة معاً' : '🟢 Saved on Phone & Cloud')
                      : (isRtl ? '🟡 في السحابة فقط (غير موجود بالهاتف - وفر مساحة)' : '🟡 In Cloud only (Freed from phone)')
                  }
                  style={{
                    position: 'absolute', top: 5, left: 5,
                    padding: '2px 5px', borderRadius: 99,
                    background: onPhone ? 'rgba(16, 185, 129, 0.92)' : 'rgba(245, 158, 11, 0.95)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', gap: 3,
                    color: '#ffffff', fontSize: 8, fontWeight: 800,
                    boxShadow: onPhone ? '0 2px 6px rgba(16,185,129,0.4)' : '0 2px 6px rgba(245,158,11,0.4)',
                    zIndex: 3,
                  }}
                >
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#ffffff', display: 'inline-block',
                  }} />
                  <span>{onPhone ? (isRtl ? 'هاتف+سحابة' : 'Phone') : (isRtl ? 'سحابة فقط' : 'Cloud')}</span>
                </div>

                {/* Selection Checkbox (Top-Right) OR Cloud Icon */}
                {isSelectionMode ? (
                  <div
                    style={{
                      position: 'absolute', top: 5, right: 5,
                      width: 22, height: 22, borderRadius: '50%',
                      background: isSelected ? '#2563eb' : 'rgba(0,0,0,0.5)',
                      border: isSelected ? '2px solid #ffffff' : '2px solid rgba(255,255,255,0.7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ffffff', fontSize: 11, fontWeight: 900,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                      zIndex: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected && '✓'}
                  </div>
                ) : (
                  <div style={{
                    position: 'absolute', top: 5, right: 5,
                    width: 17, height: 17, borderRadius: '50%',
                    background: 'rgba(37,99,235,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 9, zIndex: 3,
                  }}>
                    ☁️
                  </div>
                )}

                {/* Video Play Badge */}
                {isVideo && (
                  <div style={{
                    position: 'absolute', bottom: 5, left: 5,
                    padding: '2px 5px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    ▶
                  </div>
                )}

                {/* Size tag */}
                <div style={{
                  position: 'absolute', bottom: 5, right: 5,
                  padding: '1px 5px', borderRadius: 4,
                  background: 'rgba(0,0,0,0.65)', color: '#fff',
                  fontSize: 8, fontWeight: 700,
                }}>
                  {file.sizeMB} MB
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Single File Preview Modal / Sheet ───────────────────────────────── */}
      {selectedFile && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 85,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            background: colors.card,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: '24px 20px',
            border: `1px solid ${colors.border}`,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
            animation: 'slideUpSheet 0.28s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ overflow: 'hidden', paddingRight: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: colors.text, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {selectedFile.name}
                </h3>
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {selectedFile.sizeMB} MB • مجلد {AURASYNC_MOBILE_FOLDER}
                </span>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: colors.textMuted, fontSize: 18, padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Storage Location Status Banner */}
            {(() => {
              const onPhone = isItemOnPhone(selectedFile.name);
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 12, marginBottom: 14,
                  background: onPhone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${onPhone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  fontSize: 11, fontWeight: 700,
                  color: onPhone ? '#10b981' : '#f59e0b',
                }}>
                  <span style={{ fontSize: 14 }}>{onPhone ? '🟢' : '🟡'}</span>
                  <span>
                    {onPhone
                      ? (isRtl ? 'محفوظ على الهاتف والسحابة معاً' : 'Available on Phone & Cloud')
                      : (isRtl ? 'في السحابة فقط (غير موجود بذاكرة الهاتف - تم توفير مساحته)' : 'In Cloud only (Freed from phone storage)')}
                  </span>
                </div>
              );
            })()}

            {/* Media Image Preview */}
            {selectedFile.preview && (
              <div style={{
                width: '100%', maxHeight: 220, borderRadius: 16,
                overflow: 'hidden', marginBottom: 16, background: colors.tileBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img
                  src={selectedFile.preview}
                  alt={selectedFile.name}
                  style={{ width: '100%', height: '100%', maxHeight: 220, objectFit: 'contain' }}
                />
              </div>
            )}

            {/* Actions: Download to phone / Share */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <button
                onClick={() => handleDownloadFile(selectedFile)}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: colors.accentLight,
                  border: `1px solid ${colors.accent}40`,
                  color: colors.accent, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>{isRtl ? 'تنزيل إلى الهاتف' : 'Save to Phone'}</span>
              </button>

              <button
                onClick={() => handleShareFile(selectedFile)}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: colors.tileBg,
                  border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                <span>{isRtl ? 'مشاركة' : 'Share'}</span>
              </button>
            </div>

            {/* Delete button: Opens destination selection modal */}
            <button
              onClick={() => {
                triggerHaptic(20);
                setSelectedFileIds(new Set([selectedFile.id]));
                setSelectedFile(null);
                setShowBatchDeleteModal(true);
              }}
              style={{
                width: '100%', padding: '12px', borderRadius: 14,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#ef4444', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              <span>{isRtl ? 'خيارات حذف الملف...' : 'Delete File Options...'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Batch Delete Confirmation Modal ────────────────────────────── */}
      {showBatchDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: colors.card,
            borderRadius: 24, padding: '22px 18px',
            border: `1px solid ${colors.border}`,
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: 'rgba(239,68,68,0.12)',
              color: '#ef4444', fontSize: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: colors.text }}>
              {isRtl ? `حذف ${selectedFileIds.size} ملف` : `Delete ${selectedFileIds.size} files`}
            </h3>
            <p style={{ fontSize: 11, color: colors.textMuted, lineHeight: 1.5, margin: '0 0 14px' }}>
              {isRtl ? 'اختر أين تريد حذف الملفات المحددة بدقة:' : 'Select where you want to delete the files from:'}
            </p>

            {/* 3 Interactive Destination Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 18px', textAlign: isRtl ? 'right' : 'left' }}>
              {/* Option 1: Both Phone & Cloud */}
              <div
                onClick={() => { triggerHaptic(10); setDeleteTargetMode('both'); }}
                style={{
                  padding: '10px 12px', borderRadius: 14,
                  background: deleteTargetMode === 'both' ? (isDark ? 'rgba(239,68,68,0.16)' : '#fee2e2') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                  border: `1.5px solid ${deleteTargetMode === 'both' ? '#ef4444' : colors.border}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: deleteTargetMode === 'both' ? 'rgba(239,68,68,0.2)' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'),
                    color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: colors.text }}>
                      {isRtl ? 'حذف من الهاتف والسحابة معاً' : 'Delete from Both'}
                    </div>
                    <div style={{ fontSize: 10, color: colors.textMuted }}>
                      {isRtl ? 'حذف شامل ونهائي من كل مكان' : 'Remove from phone and cloud'}
                    </div>
                  </div>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${deleteTargetMode === 'both' ? '#ef4444' : colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: deleteTargetMode === 'both' ? '#ef4444' : 'transparent',
                }}>
                  {deleteTargetMode === 'both' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </div>

              {/* Option 2: Phone Only */}
              <div
                onClick={() => { triggerHaptic(10); setDeleteTargetMode('phone'); }}
                style={{
                  padding: '10px 12px', borderRadius: 14,
                  background: deleteTargetMode === 'phone' ? (isDark ? 'rgba(245,158,11,0.16)' : '#fef3c7') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                  border: `1.5px solid ${deleteTargetMode === 'phone' ? '#f59e0b' : colors.border}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: deleteTargetMode === 'phone' ? 'rgba(245,158,11,0.2)' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'),
                    color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                      <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: colors.text }}>
                      {isRtl ? 'حذف من الهاتف فقط (تفريغ مساحة)' : 'Delete from Phone Only'}
                    </div>
                    <div style={{ fontSize: 10, color: colors.textMuted }}>
                      {isRtl ? 'تفريغ الذاكرة مع بقاء النسخة بالسحابة' : 'Free up phone space, keep in cloud'}
                    </div>
                  </div>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${deleteTargetMode === 'phone' ? '#f59e0b' : colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: deleteTargetMode === 'phone' ? '#f59e0b' : 'transparent',
                }}>
                  {deleteTargetMode === 'phone' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </div>

              {/* Option 3: Cloud Only */}
              <div
                onClick={() => { triggerHaptic(10); setDeleteTargetMode('cloud'); }}
                style={{
                  padding: '10px 12px', borderRadius: 14,
                  background: deleteTargetMode === 'cloud' ? (isDark ? 'rgba(59,130,246,0.16)' : '#dbeafe') : (isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'),
                  border: `1.5px solid ${deleteTargetMode === 'cloud' ? '#3b82f6' : colors.border}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: deleteTargetMode === 'cloud' ? 'rgba(59,130,246,0.2)' : (isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'),
                    color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: colors.text }}>
                      {isRtl ? 'حذف من السحابة فقط' : 'Delete from Cloud Only'}
                    </div>
                    <div style={{ fontSize: 10, color: colors.textMuted }}>
                      {isRtl ? 'توفير سعة السحابة وتبقى في هاتفك' : 'Free cloud space, keep on phone'}
                    </div>
                  </div>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${deleteTargetMode === 'cloud' ? '#3b82f6' : colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: deleteTargetMode === 'cloud' ? '#3b82f6' : 'transparent',
                }}>
                  {deleteTargetMode === 'cloud' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </div>
            </div>

            {/* Android All-Files Permission Notice if deleting from phone */}
            {(deleteTargetMode === 'phone' || deleteTargetMode === 'both') &&
             typeof window !== 'undefined' &&
             window.AuraSyncAndroid?.hasAllFilesPermission &&
             !window.AuraSyncAndroid.hasAllFilesPermission() && (
              <div style={{
                marginBottom: 12, padding: '9px 12px', borderRadius: 12,
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
              }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                  {isRtl ? '⚠️ يتطلب أندرويد تفعيل إذن (إدارة الملفات) لحذفها من الهاتف' : '⚠️ Android requires All Files Access to delete from phone'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    window.AuraSyncAndroid.requestAllFilesPermission();
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 8, border: 'none',
                    background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  {isRtl ? 'تفعيل الآن' : 'Enable Now'}
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={isBatchDeleting}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmBatchDelete}
                disabled={isBatchDeleting}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: deleteTargetMode === 'phone' ? '#f59e0b' : (deleteTargetMode === 'cloud' ? '#3b82f6' : '#ef4444'),
                  border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: isBatchDeleting ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                }}
              >
                {isBatchDeleting
                  ? (isRtl ? 'جاري التنفيذ...' : 'Deleting...')
                  : (isRtl
                      ? (deleteTargetMode === 'both' ? 'حذف من الاثنين' : (deleteTargetMode === 'phone' ? 'حذف من الهاتف' : 'حذف من السحابة'))
                      : (deleteTargetMode === 'both' ? 'Delete Both' : (deleteTargetMode === 'phone' ? 'Delete from Phone' : 'Delete from Cloud'))
                    )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
