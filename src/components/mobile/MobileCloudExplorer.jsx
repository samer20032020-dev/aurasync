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

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  // Sync cloud files on mount and subscribe to updates
  useEffect(() => {
    mobileEngine.syncCloudFiles().catch(() => {});
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'files_updated') {
        setFiles(data || []);
      }
      if (event === 'accounts_updated') {
        setAccounts(data || []);
      }
    });
    return unsub;
  }, []);

  // Manual Trigger to re-sync across all devices
  const handleSyncCloud = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    triggerHaptic(20);
    try {
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
  }, [isRtl, isSyncing, onShowToast, triggerHaptic]);

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

    triggerHaptic(25);
    setIsUploading(true);
    setUploadProgress(5);
    const fileArray = Array.from(selected);

    mobileEngine.uploadBatch(fileArray, {
      account: accounts[0],
      onProgress: ({ overallPercent }) => {
        setUploadProgress(overallPercent);
      }
    }).then((result) => {
      setUploadProgress(100);
      mobileEngine.syncCloudFiles().catch(() => {});
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        const successCount = result.successful.length;
        const targetCloudName = accounts[0]?.label || 'السحابة';
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `✓ تم رفع ${successCount} ملف بنجاح في مجلد ${AURASYNC_MOBILE_FOLDER} في ${targetCloudName}`
              : `✓ Uploaded ${successCount} file(s) to ${AURASYNC_MOBILE_FOLDER} in ${targetCloudName}`,
            'success'
          );
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
      if (onShowToast) {
        onShowToast(
          isRtl
            ? `تم تنزيل "${file.name}" إلى ذاكرة الهاتف بنجاح ✓`
            : `Saved "${file.name}" to phone storage ✓`,
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

  const handleDeleteFile = (fileId) => {
    triggerHaptic(30);
    mobileEngine.deleteUploadedFile(fileId);
    setSelectedFile(null);
    if (onShowToast) {
      onShowToast(
        isRtl ? 'تم حذف الملف من السحابة' : 'File deleted from cloud',
        'info'
      );
    }
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    const nameMatch = (f.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch) return false;
    if (activeFilter === 'photos') return f.type === 'image';
    if (activeFilter === 'videos') return f.type === 'video';
    if (activeFilter === 'audio') return f.type === 'audio';
    if (activeFilter === 'docs') return f.type === 'doc';
    return true;
  });

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

  const filterChips = [
    { id: 'all',    ar: 'الكل',       en: 'All',    count: files.length },
    { id: 'photos', ar: 'الصور',      en: 'Photos', count: files.filter(f => f.type === 'image').length },
    { id: 'videos', ar: 'الفيديوهات', en: 'Videos', count: files.filter(f => f.type === 'video').length },
    { id: 'docs',   ar: 'المستندات',  en: 'Docs',   count: files.filter(f => f.type === 'doc').length },
  ];

  return (
    <div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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

      {/* ── Top Bar: Clean, Minimalist & Soft Header ─────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 3px', color: colors.text }}>
            {isRtl ? 'معرض الصور والملفات' : 'Cloud Gallery & Media'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.textMuted }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.7)' }} />
            <span>
              {files.length > 0
                ? (isRtl ? `${files.length} ملف متزامن مع كافة الأجهزة` : `${files.length} files synced with all devices`)
                : (isRtl ? `متصل مع ${accounts[0]?.label || 'السحابة'} • متزامن` : `Connected to ${accounts[0]?.label || 'Cloud'} • Synced`)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sync Button */}
          <button
            onClick={handleSyncCloud}
            disabled={isSyncing}
            style={{
              width: 38, height: 38, borderRadius: 12,
              background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
              border: `1px solid ${colors.border}`,
              color: colors.text,
              cursor: isSyncing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            title={isRtl ? 'مزامنة وتحديث الملفات' : 'Sync & refresh files'}
          >
            <span style={{
              display: 'inline-block',
              animation: isSyncing ? 'spin 1s linear infinite' : 'none',
              fontSize: 14,
            }}>
              🔄
            </span>
          </button>

          {/* Upload Button */}
          <button
            onClick={() => {
              triggerHaptic(20);
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            style={{
              padding: '8px 14px', borderRadius: 12,
              background: '#2563eb',
              border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>{isRtl ? 'رفع صور' : 'Upload'}</span>
          </button>
        </div>
      </div>

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
        /* Soft, Minimalist, Truly Useful Empty State */
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

          <p style={{ fontSize: 12, color: colors.textMuted, maxWidth: 300, margin: '0 0 22px', lineHeight: 1.6 }}>
            {isRtl
              ? 'ارفع صورك وفيديوهاتك لتكون محفوظة بجودتها الأصلية ومتاحة فوراً للمزامنة والتنزيل عبر كافة هواتفك وحاسوبك.'
              : 'Upload photos & videos to keep them safe in original quality and synced across all your phones and PC.'}
          </p>

          {/* Primary Action Button: Fast Native Upload */}
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

          {/* Secondary Action Button: Pull from other devices */}
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
            <span style={{ display: 'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none', fontSize: 13 }}>
              🔄
            </span>
            <span>
              {isSyncing
                ? (isRtl ? 'جاري الفحص والمزامنة...' : 'Syncing with devices…')
                : (isRtl ? 'جلب الصور المرفوعة من هواتفك وحاسوبك' : 'Fetch media from your other devices')}
            </span>
          </button>

          {/* 3 Soft Highlights */}
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
        /* Files Grid (Google Photos Experience) */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
        }}>
          {filteredFiles.map(file => {
            const isImage = file.type === 'image';
            const isVideo = file.type === 'video';

            return (
              <div
                key={file.id}
                onClick={() => {
                  triggerHaptic(12);
                  setSelectedFile(file);
                }}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: 12,
                  background: colors.tileBg,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: `1px solid ${colors.border}`,
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

                {/* Cloud Sync badge in top corner */}
                <div style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(16,185,129,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 10,
                }}>
                  ✓
                </div>

                {/* Video Play Badge if video */}
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

      {/* ── File Preview Modal / Sheet ───────────────────────────────── */}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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

            {/* Actions: Download to phone / Share / Delete */}
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

            {/* Delete button */}
            <button
              onClick={() => handleDeleteFile(selectedFile.id)}
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
              <span>{isRtl ? 'حذف من السحابة' : 'Delete from Cloud'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
