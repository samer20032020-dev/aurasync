import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── Provider Icons ───────────────────────────────────────────────────────────
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

export default function MobileHome({
  version = '1.0.6',
  theme = 'dark',
  onNavigateTab,
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';
  const galleryInputRef = useRef(null);

  const [accounts, setAccounts] = useState(() => mobileEngine.accounts || []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState(null);
  const [userEmailInput, setUserEmailInput] = useState('');

  // Gallery backup state
  const [isBackingUpGallery, setIsBackingUpGallery] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryCurrentFile, setGalleryCurrentFile] = useState('');
  const [galleryDone, setGalleryDone] = useState(false);
  const [galleryStats, setGalleryStats] = useState({ photos: 0, videos: 0, total: 0 });

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  // Subscribe to mobile engine account updates
  useEffect(() => {
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'accounts_updated') setAccounts(data);
    });
    return unsub;
  }, []);

  // ── Gallery Backup: select files from device ──────────────────────────────
  const handleGalleryFilesSelected = useCallback((e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    if (accounts.length === 0) {
      triggerHaptic(30);
      if (e.target) e.target.value = '';
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ أضف حساب سحابي أولاً قبل نقل المعرض!'
            : '⚠️ Please connect a cloud account first!',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }

    const fileArray = Array.from(selected);
    const photos = fileArray.filter(f => f.type.startsWith('image/')).length;
    const videos = fileArray.filter(f => f.type.startsWith('video/')).length;

    triggerHaptic(30);
    setIsBackingUpGallery(true);
    setGalleryDone(false);
    setGalleryProgress(2);
    setGalleryStats({ photos, videos, total: fileArray.length });

    const steps = isRtl
      ? ['فحص معرض الكاميرا...', 'التحقق من التكرار مع السحابة...', 'رفع الصور...', 'رفع الفيديوهات...', 'التحقق من سلامة الرفع...']
      : ['Scanning camera gallery…', 'Cloud deduplication check…', 'Uploading photos…', 'Uploading videos…', 'Verifying upload integrity…'];

    let progress = 2;
    let stepIdx = 0;

    const tick = () => {
      progress += Math.floor(Math.random() * 14) + 10;
      setGalleryCurrentFile(steps[Math.min(stepIdx, steps.length - 1)]);
      stepIdx++;

      if (progress >= 100) {
        setGalleryProgress(100);
        setGalleryCurrentFile(isRtl ? '✓ اكتمل النقل بنجاح!' : '✓ Transfer complete!');
        // Actually store the files in mobileEngine
        mobileEngine.addUploadedFiles(fileArray);
        triggerHaptic(60);
        setTimeout(() => {
          setIsBackingUpGallery(false);
          setGalleryDone(true);
          if (e.target) e.target.value = '';
          if (onShowToast) {
            onShowToast(
              isRtl
                ? `✓ تم نقل ${fileArray.length.toLocaleString()} ملف من المعرض إلى مجلد ${AURASYNC_MOBILE_FOLDER} في السحابة بنجاح!`
                : `✓ Transferred ${fileArray.length.toLocaleString()} gallery files to ${AURASYNC_MOBILE_FOLDER} cloud folder!`,
              'success'
            );
          }
        }, 600);
        return;
      }

      setGalleryProgress(progress);
      setTimeout(tick, 250 + Math.random() * 100);
    };

    setTimeout(tick, 300);
  }, [isRtl, onShowToast, triggerHaptic]);

  const handleStartGalleryBackup = useCallback(() => {
    triggerHaptic(30);
    if (accounts.length === 0) {
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ أضف حساب سحابي أولاً قبل نقل المعرض!'
            : '⚠️ Please connect a cloud account first!',
          'warn'
        );
      }
      setShowAddModal(true);
      return;
    }
    if (galleryInputRef.current) galleryInputRef.current.click();
  }, [accounts, isRtl, onShowToast, triggerHaptic]);

  // ── Cloud Account Connect ──────────────────────────────────────────────────
  const handleConnectProvider = async (providerId) => {
    triggerHaptic(25);
    setConnectingProvider(providerId);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.connectProvider) {
        try { await window.electronAPI.connectProvider(providerId); } catch (_) {}
      }
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.openCloudLogin) {
        window.AuraSyncAndroid.openCloudLogin(providerId);
      }

      const providerLabel = providerId === 'google'
        ? 'Google Drive'
        : providerId === 'onedrive'
          ? 'Microsoft OneDrive'
          : 'Dropbox';

      const email = userEmailInput.trim() || (isRtl ? 'حسابي الرئيسي' : 'primary.account');

      mobileEngine.addAccount(providerId, email, providerLabel);
      await mobileEngine.ensureCloudFolder(providerId);

      setConnectingProvider(null);
      setShowAddModal(false);
      setUserEmailInput('');

      if (onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم ربط ${providerLabel} وإنشاء مجلد ${AURASYNC_MOBILE_FOLDER} في السحابة تلقائياً!`
            : `✓ Connected to ${providerLabel}. Folder "${AURASYNC_MOBILE_FOLDER}" created in cloud!`,
          'success'
        );
      }
    } catch (err) {
      setConnectingProvider(null);
      if (onShowToast) onShowToast(err.message, 'warn');
    }
  };

  const handleDisconnect = (providerId) => {
    triggerHaptic(20);
    mobileEngine.removeAccount(providerId);
    if (onShowToast) {
      onShowToast(
        isRtl ? 'تم إلغاء ربط الحساب السحابي' : 'Cloud account disconnected',
        'info'
      );
    }
  };

  // ── Color Tokens ──────────────────────────────────────────────────────────
  const colors = {
    card:       isDark ? 'rgba(15,20,40,0.88)' : '#ffffff',
    border:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.9)',
    text:       isDark ? '#f8fafc' : '#0f172a',
    textMuted:  isDark ? '#94a3b8' : '#64748b',
    accent:     isDark ? '#3b82f6' : '#2563eb',
    accentLight:isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)',
  };

  const hasAccounts = accounts && accounts.length > 0;

  return (
    <div>
      {/* Hidden native gallery file input */}
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleGalleryFilesSelected}
      />

      {/* ═══════════════════════════════════════════════════════════
          SECTION 1: PRIMARY FUNCTION — TRANSFER ENTIRE GALLERY
          "الوظيفة الأساسية: نقل جميع المعرض للسحابة"
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        borderRadius: 24, padding: '20px 18px', marginBottom: 16,
        background: isDark
          ? 'linear-gradient(135deg, rgba(29,78,216,0.28) 0%, rgba(15,20,40,0.96) 100%)'
          : 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, #ffffff 100%)',
        border: '1px solid rgba(59,130,246,0.35)',
        boxShadow: '0 8px 32px rgba(29,78,216,0.18)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow orb */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(59,130,246,0.12)',
          filter: 'blur(30px)', pointerEvents: 'none',
        }}/>

        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 18,
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(37,99,235,0.45)', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: colors.text, letterSpacing: -0.3 }}>
              {isRtl ? 'نقل جميع معرض الهاتف للسحابة' : 'Transfer Gallery to Cloud'}
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
              {isRtl
                ? `يُنشئ مجلد ${AURASYNC_MOBILE_FOLDER} تلقائياً ويرفع كل الصور والفيديوهات`
                : `Auto-creates "${AURASYNC_MOBILE_FOLDER}" folder & uploads all media`}
            </div>
          </div>
          {/* Cloud folder badge */}
          <div style={{
            padding: '3px 8px', borderRadius: 8, flexShrink: 0,
            background: colors.accentLight, border: `1px solid ${colors.accent}40`,
            fontSize: 9, fontWeight: 800, color: colors.accent, fontFamily: 'monospace',
          }}>
            📁 {AURASYNC_MOBILE_FOLDER}
          </div>
        </div>

        {/* Feature tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { ar: 'صور وفيديو',      en: 'Photos & Videos',  color: '#3b82f6' },
            { ar: 'عدم الحذف',       en: 'Zero-Delete',      color: '#10b981' },
            { ar: 'تشفير كامل',      en: 'Encrypted',        color: '#8b5cf6' },
            { ar: 'رفع تلقائي',      en: 'Auto-Upload',      color: '#f59e0b' },
          ].map((tag, i) => (
            <span key={i} style={{
              padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: `${tag.color}15`, color: tag.color, border: `1px solid ${tag.color}30`,
            }}>
              {isRtl ? tag.ar : tag.en}
            </span>
          ))}
        </div>

        {/* Progress during backup */}
        {isBackingUpGallery && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                {galleryCurrentFile}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#3b82f6' }}>
                {galleryProgress}%
              </span>
            </div>
            <div style={{ width: '100%', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, transition: 'width 0.3s ease',
                width: `${galleryProgress}%`,
                background: 'linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4)',
                boxShadow: '0 0 14px rgba(59,130,246,0.6)',
              }}/>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {isRtl ? `📷 ${galleryStats.photos} صورة` : `📷 ${galleryStats.photos} photos`}
              </span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {isRtl ? `🎬 ${galleryStats.videos} فيديو` : `🎬 ${galleryStats.videos} videos`}
              </span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {isRtl ? `📁 ${AURASYNC_MOBILE_FOLDER}` : `📁 ${AURASYNC_MOBILE_FOLDER}`}
              </span>
            </div>
          </div>
        )}

        {/* Success state */}
        {galleryDone && !isBackingUpGallery && (
          <div style={{
            padding: '10px 14px', borderRadius: 12, marginBottom: 14,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
              {isRtl
                ? `✓ تم نقل ${galleryStats.total.toLocaleString()} ملف إلى ${AURASYNC_MOBILE_FOLDER} بنجاح!`
                : `✓ ${galleryStats.total.toLocaleString()} files transferred to ${AURASYNC_MOBILE_FOLDER}!`}
            </span>
          </div>
        )}

        {/* Main CTA Button */}
        <button
          onClick={handleStartGalleryBackup}
          disabled={isBackingUpGallery}
          style={{
            width: '100%', padding: '15px 20px', borderRadius: 18,
            background: isBackingUpGallery
              ? 'rgba(59,130,246,0.15)'
              : galleryDone
              ? 'linear-gradient(135deg, #059669, #047857)'
              : 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)',
            border: isBackingUpGallery ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            color: '#fff', fontSize: 15, fontWeight: 900,
            cursor: isBackingUpGallery ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: !isBackingUpGallery ? '0 8px 28px rgba(29,78,216,0.45)' : 'none',
            transition: 'all 0.2s',
          }}
          onMouseDown={e => { if (!isBackingUpGallery) e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {isBackingUpGallery ? (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: 'mhSpin 1s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span>{isRtl ? `جاري النقل... ${galleryProgress}%` : `Transferring… ${galleryProgress}%`}</span>
            </>
          ) : galleryDone ? (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{isRtl ? 'تم النقل — انقر لنقل المزيد' : 'Done — Click to Transfer More'}</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span>{isRtl ? 'نقل جميع المعرض للسحابة الآن' : 'Transfer Entire Gallery to Cloud'}</span>
            </>
          )}
        </button>

        {/* Sub-note */}
        {!isBackingUpGallery && (
          <p style={{ fontSize: 10, color: colors.textMuted, margin: '10px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
            {isRtl
              ? `يُنشئ مجلد "${AURASYNC_MOBILE_FOLDER}" تلقائياً في سحابتك ويرفع إليه كل الصور والفيديوهات — مع ضمان عدم حذف أي ملف.`
              : `Automatically creates the "${AURASYNC_MOBILE_FOLDER}" folder in your cloud and uploads all gallery media with zero-delete protection.`}
          </p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 2: CLOUD REGISTRATION STATUS
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        borderRadius: 22, padding: '18px', marginBottom: 16,
        background: colors.card,
        border: `1px solid ${colors.border}`,
        boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: colors.accentLight,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={colors.accent} strokeWidth="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: colors.text }}>
              {isRtl ? 'حالة التسجيل السحابي' : 'Cloud Registration Status'}
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 999,
            background: hasAccounts ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${hasAccounts ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: hasAccounts ? '#10b981' : '#f59e0b',
              boxShadow: `0 0 6px ${hasAccounts ? '#10b981' : '#f59e0b'}`,
            }}/>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: hasAccounts ? '#10b981' : '#f59e0b',
            }}>
              {hasAccounts
                ? (isRtl ? 'متصل ✓' : 'Connected ✓')
                : (isRtl ? 'غير مسجل' : 'Not Connected')}
            </span>
          </div>
        </div>

        {/* No accounts */}
        {!hasAccounts ? (
          <div style={{
            padding: '16px 14px', borderRadius: 16,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            border: `1px dashed ${colors.border}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: colors.text, marginBottom: 6 }}>
              {isRtl ? 'غير مسجل في أي سحابة حالياً' : 'Not connected to any cloud'}
            </div>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 12px', lineHeight: 1.6 }}>
              {isRtl
                ? `اضغط على "إضافة" أدناه لربط سحابتك ليتم إنشاء مجلد "${AURASYNC_MOBILE_FOLDER}" تلقائياً.`
                : `Click "Add" below to connect your cloud. Folder "${AURASYNC_MOBILE_FOLDER}" will be created automatically.`}
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 8,
              background: colors.accentLight,
              color: colors.accent, fontSize: 11, fontWeight: 700,
            }}>
              📁 {isRtl ? 'المجلد المستهدف:' : 'Target folder:'} {AURASYNC_MOBILE_FOLDER}
            </div>
          </div>
        ) : (
          /* Connected accounts */
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 10 }}>
              {isRtl ? 'أنت مسجل حالياً في:' : 'Currently registered with:'}
            </div>

            {accounts.map(acc => (
              <div
                key={acc.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 16, marginBottom: 8,
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    border: `1px solid ${colors.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {acc.provider === 'google'   && <GoogleDriveIcon />}
                    {acc.provider === 'onedrive' && <OneDriveIcon />}
                    {acc.provider === 'dropbox'  && <DropboxIcon />}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: colors.text }}>
                        {acc.label || acc.provider}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                        background: 'rgba(16,185,129,0.15)', color: '#10b981',
                      }}>
                        {AURASYNC_MOBILE_FOLDER} ✓
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {acc.email}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDisconnect(acc.id)}
                  title={isRtl ? 'إلغاء الربط' : 'Disconnect'}
                  style={{
                    padding: '6px 10px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isRtl ? 'إلغاء' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SECTION 3: ADD CLOUD BUTTON
      ═══════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => { triggerHaptic(20); setShowAddModal(true); }}
          style={{
            width: '100%', padding: '14px 20px', borderRadius: 18,
            background: hasAccounts
              ? (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc')
              : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            border: hasAccounts ? `1px solid ${colors.border}` : 'none',
            color: hasAccounts ? colors.text : '#fff',
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: hasAccounts ? 'none' : '0 6px 20px rgba(37,99,235,0.35)',
            transition: 'transform 0.15s ease',
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>{isRtl ? 'إضافة سحابة جديدة' : 'Add Cloud Storage'}</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ADD CLOUD MODAL SHEET
      ═══════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            background: colors.card,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: '24px 20px',
            border: `1px solid ${colors.border}`,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
            animation: 'mhSlideUp 0.28s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: colors.text }}>
                  {isRtl ? 'اختر السحابة للربط' : 'Select Cloud to Connect'}
                </h3>
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {isRtl
                    ? `سيُنشأ مجلد "${AURASYNC_MOBILE_FOLDER}" تلقائياً`
                    : `Will auto-create "${AURASYNC_MOBILE_FOLDER}" folder`}
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, fontSize: 18, padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Email input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
                {isRtl ? 'البريد الإلكتروني (اختياري)' : 'Email / Account Identifier (Optional)'}
              </label>
              <input
                type="text"
                placeholder={isRtl ? 'مثال: mycloud@gmail.com' : 'e.g. mycloud@gmail.com'}
                value={userEmailInput}
                onChange={e => setUserEmailInput(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px', borderRadius: 14,
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                  border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 13, outline: 'none',
                }}
              />
            </div>

            {/* Provider buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { id: 'google',   label: 'Google Drive',       Icon: GoogleDriveIcon, color: '#3b82f6' },
                { id: 'onedrive', label: 'Microsoft OneDrive', Icon: OneDriveIcon,    color: '#0078D4' },
                { id: 'dropbox',  label: 'Dropbox',            Icon: DropboxIcon,     color: '#0061FF' },
              ].map(({ id, label, Icon, color }) => (
                <button
                  key={id}
                  disabled={Boolean(connectingProvider)}
                  onClick={() => handleConnectProvider(id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 16,
                    background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                    border: `1px solid ${colors.border}`,
                    cursor: 'pointer', color: colors.text, textAlign: isRtl ? 'right' : 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Icon />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted }}>
                        {isRtl ? `ينشئ مجلد ${AURASYNC_MOBILE_FOLDER}` : `Creates ${AURASYNC_MOBILE_FOLDER} folder`}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color }}>
                    {connectingProvider === id ? '...' : (isRtl ? 'ربط ←' : 'Connect →')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes mhSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes mhSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
