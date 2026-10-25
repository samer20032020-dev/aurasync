import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import BrandLogo from '../BrandLogo';
import MobileHome from './MobileHome';
import MobileCloudExplorer from './MobileCloudExplorer';
import MobileSettings from './MobileSettings';
import MobileAutoBackup from './MobileAutoBackup';
import MobileCloudLogin from './MobileCloudLogin';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── Bottom Nav Icons ────────────────────────────────────────────────────────
const HomeIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const BackupIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const FilesIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const SettingsIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export default function MobileApp({
  version = '1.0.25',
  accounts = [],
  storage = {},
  stats = {},
  files = [],
  onTriggerSync,
  isSyncing = false
}) {
  const { language, setLanguage } = useTranslation();
  const isRtl = language === 'ar';

  // Active Tab: home | backup | files | settings
  const [activeTab, setActiveTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [pressedTab, setPressedTab] = useState(null);

  // Connected accounts & uploaded files in engine
  const [engineAccounts, setEngineAccounts] = useState(() => mobileEngine.accounts || []);
  const [uploadedFiles, setUploadedFiles] = useState(() => mobileEngine.uploadedFiles || []);

  // Theme: 'dark' | 'light'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aurasync_mobile_theme') || mobileEngine.settings.theme || 'dark';
    } catch (_) {
      return 'dark';
    }
  });

  // Biometric lock & PIN state
  const [isLocked, setIsLocked] = useState(() => Boolean(mobileEngine.settings.biometricLock));
  const [bioError, setBioError] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Incoming Share Intent State (when sharing from Android Gallery or Files)
  const [incomingShareFiles, setIncomingShareFiles] = useState(() => {
    return mobileEngine.receiveShareIntent() || [];
  });
  const [isUploadingShare, setIsUploadingShare] = useState(false);

  const isDark = theme === 'dark';

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    triggerHaptic(25);
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, [triggerHaptic]);

  // OTA In-App Auto Updates State
  const [availableUpdate, setAvailableUpdate] = useState(() => mobileEngine.cachedUpdate || null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');

  // Check for updates on app mount
  useEffect(() => {
    mobileEngine.checkForMobileUpdates(version).then(info => {
      if (info && info.hasUpdate) {
        setAvailableUpdate(info);
      }
    });
  }, [version]);

  // Subscribe to engine events
  useEffect(() => {
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'accounts_updated') setEngineAccounts(data || []);
      if (event === 'files_updated') setUploadedFiles(data || []);
      if (event === 'update_available') setAvailableUpdate(data);
      if (event === 'share_staged') {
        if (Array.isArray(data) && data.length > 0) {
          setIncomingShareFiles(data);
          triggerHaptic(40);
        }
      }
    });
    return unsub;
  }, [triggerHaptic]);

  // Handle biometric unlock
  const handleUnlockBiometric = useCallback(async () => {
    triggerHaptic(25);
    setIsAuthenticating(true);
    setBioError(false);
    try {
      const ok = await mobileEngine.authenticateBiometric();
      setIsAuthenticating(false);
      if (ok === true) {
        setPinSuccess(true);
        triggerHaptic(40);
        setTimeout(() => {
          setIsLocked(false);
          setPinSuccess(false);
          setEnteredPin('');
          showToast(isRtl ? '✓ تم التحقق من البصمة بنجاح' : '✓ Unlocked with biometrics', 'success');
        }, 300);
      } else if (ok === false) {
        setBioError(true);
        triggerHaptic(120);
        setTimeout(() => setBioError(false), 2500);
      } else {
        showToast(isRtl ? 'أدخل رمز PIN للفتح' : 'Enter PIN to unlock', 'info');
      }
    } catch (_) {
      setIsAuthenticating(false);
      setBioError(true);
      setTimeout(() => setBioError(false), 2500);
    }
  }, [isRtl, showToast, triggerHaptic]);

  // Biometric prompt on launch if locked
  useEffect(() => {
    if (isLocked) {
      triggerHaptic(30);
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.requestBiometricAuth) {
        const timer = setTimeout(() => {
          handleUnlockBiometric();
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [isLocked, handleUnlockBiometric, triggerHaptic]);

  const handleDigitPress = useCallback((digit) => {
    if (enteredPin.length >= 4 || pinSuccess) return;
    triggerHaptic(12);
    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);
    setBioError(false);

    if (nextPin.length === 4) {
      const valid = mobileEngine.verifyPin(nextPin);
      if (valid) {
        setPinSuccess(true);
        triggerHaptic(40);
        setTimeout(() => {
          setIsLocked(false);
          setEnteredPin('');
          setPinSuccess(false);
          showToast(isRtl ? '✓ تم إلغاء القفل بنجاح' : '✓ Unlocked with PIN', 'success');
        }, 300);
      } else {
        setPinError(true);
        triggerHaptic(120);
        setTimeout(() => {
          setEnteredPin('');
          setPinError(false);
        }, 600);
      }
    }
  }, [enteredPin, pinSuccess, isRtl, showToast, triggerHaptic]);

  const handleBackspace = useCallback(() => {
    if (enteredPin.length === 0 || pinSuccess) return;
    triggerHaptic(10);
    setEnteredPin(prev => prev.slice(0, -1));
  }, [enteredPin, pinSuccess, triggerHaptic]);

  const handleToggleTheme = () => {
    triggerHaptic(20);
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    mobileEngine.saveSettings({ theme: next });
    showToast(
      next === 'dark'
        ? (isRtl ? 'تم تفعيل الوضع الليلي' : 'Dark mode activated')
        : (isRtl ? 'تم تفعيل الوضع الفاتح' : 'Light mode activated'),
      'info'
    );
  };

  const handleTabChange = useCallback((tabId) => {
    if (tabId === activeTab) return;
    triggerHaptic(15);
    setPressedTab(tabId);
    setTimeout(() => setPressedTab(null), 250);
    setActiveTab(tabId);
  }, [activeTab, triggerHaptic]);

  // Upload incoming shared files
  const handleUploadIncomingShare = () => {
    if (incomingShareFiles.length === 0 || isUploadingShare) return;
    triggerHaptic(30);
    mobileEngine.acquireWakeLock(1800000);
    setIsUploadingShare(true);

    setTimeout(() => {
      mobileEngine.addUploadedFiles(incomingShareFiles);
      mobileEngine.clearStagedShare();
      mobileEngine.releaseWakeLock();
      setIsUploadingShare(false);
      const count = incomingShareFiles.length;
      setIncomingShareFiles([]);
      triggerHaptic(50);
      showToast(
        isRtl
          ? `✓ تم رفع ${count} ملف مشاركة إلى مجلد ${AURASYNC_MOBILE_FOLDER} في السحابة بنجاح!`
          : `✓ Successfully uploaded ${count} shared file(s) to ${AURASYNC_MOBILE_FOLDER}!`,
        'success'
      );
    }, 1200);
  };

  const tabs = [
    { id: 'home',     ar: 'الرئيسية', en: 'Home',     Icon: HomeIcon },
    { id: 'files',    ar: 'المعرض',    en: 'Gallery',  Icon: FilesIcon, badge: uploadedFiles.length },
    { id: 'settings', ar: 'الإعدادات', en: 'Settings', Icon: SettingsIcon },
  ];

  const colors = {
    bg: isDark ? '#06080f' : '#f8fafc',
    surface: isDark ? 'rgba(15, 20, 36, 0.95)' : '#ffffff',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.9)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    headerBg: isDark ? 'rgba(6, 8, 15, 0.92)' : 'rgba(255, 255, 255, 0.92)',
    navBg: isDark ? 'rgba(11, 15, 28, 0.96)' : 'rgba(255, 255, 255, 0.98)',
    accent: isDark ? '#3b82f6' : '#2563eb',
    accentLight: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.1)',
  };

  const activeAccount = engineAccounts[0];

  // If no cloud account connected yet, show Cloud Login immediately!
  if (engineAccounts.length === 0) {
    return (
      <MobileCloudLogin
        theme={theme}
        version={version}
        onLoginSuccess={(acc) => {
          setEngineAccounts([acc]);
          setActiveTab('home');
        }}
        onShowToast={showToast}
      />
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%', minHeight: '100vh',
        background: colors.bg,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: colors.text, overflowX: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        paddingTop: 'max(0px, env(safe-area-inset-top))',
      }}
    >
      {/* ── Native Mobile Header (No switch to desktop, No X button) ─────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: colors.headerBg,
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <BrandLogo size={32} />
            <span style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px rgba(16,185,129,0.9)',
              border: `2px solid ${colors.bg}`,
            }}/>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: colors.text, letterSpacing: '-0.3px' }}>
                AuraSync
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
                padding: '2px 7px', borderRadius: 999,
                background: colors.accentLight,
                color: colors.accent,
                border: `1px solid ${colors.accent}40`,
              }}>
                MOBILE
              </span>
            </div>

            {/* Target Folder Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span style={{
                fontSize: 10, color: activeAccount ? '#10b981' : colors.textMuted,
                fontWeight: 700, fontFamily: 'monospace',
              }}>
                {activeAccount
                  ? activeAccount.isOffline
                    ? `📴 ${activeAccount.label} • ${AURASYNC_MOBILE_FOLDER}`
                    : `● ${activeAccount.label} • ${AURASYNC_MOBILE_FOLDER}`
                  : `📁 ${AURASYNC_MOBILE_FOLDER}`}
              </span>
            </div>
          </div>
        </div>

        {/* Header Right: Theme Switcher & Mobile Version Pill / Update Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {availableUpdate?.hasUpdate && (
            <button
              onClick={() => {
                triggerHaptic(25);
                setShowUpdateModal(true);
              }}
              title="تحديث جديد متاح — اضغط للتثبيت"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 12,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                color: '#ffffff', cursor: 'pointer',
                fontSize: 11, fontWeight: 900,
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.6)',
                animation: 'auraPulseUpdate 2s infinite',
              }}
            >
              <span>✨</span>
              <span>{isRtl ? `تحديث v${availableUpdate.latestVersion}` : `Update v${availableUpdate.latestVersion}`}</span>
            </button>
          )}

          <button
            onClick={handleToggleTheme}
            title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
            style={{
              padding: '6px 10px', borderRadius: 12,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              color: colors.text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700,
            }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <div
            onClick={() => {
              if (availableUpdate?.hasUpdate) {
                triggerHaptic(20);
                setShowUpdateModal(true);
              }
            }}
            style={{
              padding: '4px 8px', borderRadius: 10,
              background: availableUpdate?.hasUpdate ? 'rgba(16, 185, 129, 0.15)' : colors.surface,
              border: `1px solid ${availableUpdate?.hasUpdate ? '#10b981' : colors.border}`,
              fontFamily: 'monospace', fontSize: 10, fontWeight: 800,
              color: availableUpdate?.hasUpdate ? '#10b981' : colors.textMuted,
              cursor: availableUpdate?.hasUpdate ? 'pointer' : 'default',
            }}
          >
            v{version}
          </div>
        </div>
      </header>

      {/* ── Main View (Active Tab) ────────────────────────────────────────── */}
      <main style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        paddingBottom: 96, position: 'relative', zIndex: 10,
      }}>
        <div style={{ maxWidth: 500, margin: '0 auto', padding: '16px 16px 0' }}>
          {activeTab === 'home' && (
            <MobileHome
              version={version}
              theme={theme}
              onNavigateTab={handleTabChange}
              onShowToast={showToast}
            />
          )}
          {activeTab === 'backup' && (
            <MobileAutoBackup
              onShowToast={showToast}
            />
          )}
          {activeTab === 'files' && (
            <MobileCloudExplorer
              theme={theme}
              onShowToast={showToast}
            />
          )}
          {activeTab === 'settings' && (
            <MobileSettings
              version={version}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              onShowToast={showToast}
              availableUpdate={availableUpdate}
              onTriggerUpdate={() => setShowUpdateModal(true)}
            />
          )}
        </div>
      </main>

      {/* ── Incoming Share Sheet Modal (When files are shared from Android) ── */}
      {incomingShareFiles.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 500,
            background: colors.surface,
            borderTopLeftRadius: 30, borderTopRightRadius: 30,
            padding: '22px 20px',
            border: `1px solid ${colors.border}`,
            boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
            animation: 'slideUp 0.25s ease-out',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📤</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: colors.text }}>
                    {isRtl ? 'مشاركة ملفات واردة من الهاتف' : 'Incoming Shared Files'}
                  </h3>
                  <p style={{ fontSize: 11, color: colors.textMuted, margin: '2px 0 0' }}>
                    {isRtl
                      ? `تم استلام ${incomingShareFiles.length} ملف جاهز للرفع إلى مجلد ${AURASYNC_MOBILE_FOLDER}`
                      : `${incomingShareFiles.length} file(s) ready to upload to ${AURASYNC_MOBILE_FOLDER}`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIncomingShareFiles([])}
                style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  border: 'none', color: colors.textMuted, cursor: 'pointer',
                  fontSize: 14, fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            {/* Files Preview Chips */}
            <div style={{
              maxHeight: 140, overflowY: 'auto',
              display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
              padding: '8px', borderRadius: 14,
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
            }}>
              {incomingShareFiles.slice(0, 10).map((f, i) => (
                <span key={i} style={{
                  fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
                  background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                  color: colors.text,
                }}>
                  {f.type === 'video' ? '🎬' : f.type === 'audio' ? '🎵' : '🖼️'} {f.name} ({f.sizeMB || 2.5} MB)
                </span>
              ))}
              {incomingShareFiles.length > 10 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', color: colors.accent }}>
                  +{incomingShareFiles.length - 10} {isRtl ? 'ملف آخر' : 'more'}
                </span>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button
                onClick={() => setIncomingShareFiles([])}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {isRtl ? 'تجاهل' : 'Dismiss'}
              </button>

              <button
                onClick={handleUploadIncomingShare}
                disabled={isUploadingShare}
                style={{
                  padding: '12px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 800,
                  cursor: isUploadingShare ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                }}
              >
                {isUploadingShare ? (
                  <span>{isRtl ? 'جاري الرفع المشفر...' : 'Uploading…'}</span>
                ) : (
                  <span>{isRtl ? `⚡ رفع فوري إلى ${AURASYNC_MOBILE_FOLDER}` : `⚡ Upload to ${AURASYNC_MOBILE_FOLDER}`}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Native Bottom Navigation Bar ──────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 35,
        display: 'flex', justifyContent: 'center',
        padding: '8px 16px max(14px, env(safe-area-inset-bottom))',
        background: 'transparent', pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', maxWidth: 440,
          background: colors.navBg,
          backdropFilter: 'blur(24px)',
          borderRadius: 24,
          padding: '6px 8px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
          border: `1px solid ${colors.border}`,
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 4px 20px rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
        }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const isPressed = pressedTab === tab.id;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '8px 4px', borderRadius: 18, border: 'none',
                  background: active ? colors.accentLight : 'transparent',
                  color: active ? colors.accent : colors.textMuted,
                  cursor: 'pointer', outline: 'none', position: 'relative',
                  transform: isPressed ? 'scale(0.92)' : 'scale(1)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Icon active={active} />
                  {Boolean(tab.badge) && tab.badge > 0 && (
                    <span style={{
                      position: 'absolute', top: -4, right: -8,
                      minWidth: 16, height: 16, borderRadius: 99,
                      background: '#10b981', color: '#fff',
                      fontSize: 9, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                      boxShadow: '0 2px 6px rgba(16,185,129,0.5)',
                    }}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: active ? 800 : 600, marginTop: 4,
                  letterSpacing: '-0.2px',
                }}>
                  {isRtl ? tab.ar : tab.en}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99, width: '90%', maxWidth: 420,
          padding: '12px 18px', borderRadius: 16,
          background: toast.type === 'success' ? '#10b981' : toast.type === 'warn' ? '#f59e0b' : '#3b82f6',
          color: '#ffffff', fontSize: 13, fontWeight: 800,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'toastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <span>{toast.type === 'success' ? '✓' : toast.type === 'warn' ? '⚠️' : 'ℹ️'}</span>
          <span style={{ flex: 1 }}>{toast.msg}</span>
        </div>
      )}

      {/* ── Biometric & PIN Lock Screen ───────────────────────────────────── */}
      {isLocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: isDark ? '#06080f' : '#ffffff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 22,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', margin: '0 auto 16px',
              boxShadow: '0 8px 30px rgba(37, 99, 235, 0.4)',
            }}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 6px', color: colors.text }}>
              AuraSync Mobile
            </h2>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 24px' }}>
              {isRtl ? 'المصادقة بالبصمة أو إدخال رمز PIN' : 'Authenticate with biometrics or PIN'}
            </p>

            {/* PIN Dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28 }}>
              {[0, 1, 2, 3].map(idx => {
                const filled = enteredPin.length > idx;
                return (
                  <div key={idx} style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: pinSuccess ? '#10b981' : pinError ? '#ef4444' : filled ? colors.accent : 'rgba(100,116,139,0.3)',
                    transform: filled ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.18s ease',
                  }}/>
                );
              })}
            </div>

            {/* Keypad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button
                  key={d}
                  onClick={() => handleDigitPress(d)}
                  style={{
                    height: 56, borderRadius: 18,
                    background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                    border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 20, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {d}
                </button>
              ))}
              <button
                onClick={handleUnlockBiometric}
                style={{
                  height: 56, borderRadius: 18,
                  background: 'rgba(168,85,247,0.15)',
                  border: '1px solid rgba(168,85,247,0.3)',
                  color: '#c084fc', fontSize: 18, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                👆
              </button>
              <button
                onClick={() => handleDigitPress('0')}
                style={{
                  height: 56, borderRadius: 18,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 20, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                style={{
                  height: 56, borderRadius: 18,
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  border: `1px solid ${colors.border}`,
                  color: colors.textMuted, fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OTA IN-APP AUTO-UPDATE MODAL ─────────────────────────── */}
      {showUpdateModal && availableUpdate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360,
            background: colors.surface, borderRadius: 28, padding: 24,
            border: '1px solid rgba(16, 185, 129, 0.4)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(16, 185, 129, 0.2)',
            textAlign: 'center',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', margin: '0 auto 12px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2))',
              border: '2px solid #10b981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
            }}>
              🚀
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 900, color: colors.text, margin: '0 0 6px' }}>
              {isRtl ? 'تحديث جديد متوفر للتطبيق!' : 'New Update Available!'}
            </h3>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 999,
              background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981', fontSize: 12, fontWeight: 800, margin: '6px 0 14px',
              fontFamily: 'monospace',
            }}>
              <span>v{version}</span>
              <span>➔</span>
              <span style={{ color: '#38bdf8' }}>v{availableUpdate.latestVersion}</span>
            </div>

            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
              {isRtl
                ? 'اضغط أدناه لتنزيل التحديث وتثبيته تلقائياً بضغطة زر واحدة دون الحاجة لتنزيل أي نسخ يدوية.'
                : 'Tap below to download and install update automatically without manual downloads.'}
            </p>

            {isUpdating && updateProgress && (
              <div style={{ margin: '12px 0 16px', textAlign: 'center' }}>
                <div style={{
                  height: 8, width: '100%', background: 'rgba(255,255,255,0.08)',
                  borderRadius: 999, overflow: 'hidden', marginBottom: 8,
                }}>
                  <div style={{
                    height: '100%', width: `${Math.max(5, updateProgress.percent >= 0 ? updateProgress.percent : 15)}%`,
                    background: 'linear-gradient(90deg, #10b981, #38bdf8)',
                    transition: 'width 0.2s ease', borderRadius: 999,
                  }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8' }}>
                  {updateProgress.percent >= 0 ? `${updateProgress.percent}%` : '...'}
                  {updateProgress.mbTotal > 0 && ` (${updateProgress.mbRead} / ${updateProgress.mbTotal} MB)`}
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  {isRtl ? '⚡ سيتم فتح نافذة التثبيت تلقائياً، فقط اضغط تثبيت فور ظهورها' : '⚡ Package installer will open automatically upon completion'}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                triggerHaptic(40);
                setIsUpdating(true);
                setUpdateStatus(isRtl ? 'جاري بدء التنزيل تلقائياً...' : 'Starting download…');
                mobileEngine.triggerUpdateInstallation(
                  availableUpdate,
                  (prog) => {
                    setUpdateProgress(prog);
                    setUpdateStatus(isRtl ? `جاري التنزيل: ${prog.percent}%` : `Downloading: ${prog.percent}%`);
                  },
                  () => {
                    setUpdateStatus(isRtl ? '✓ اكتمل التنزيل! جاري فتح التثبيت...' : '✓ Downloaded! Launching installer…');
                  },
                  () => {
                    setUpdateStatus(isRtl ? 'فشل التنزيل المباشر، جاري التحويل...' : 'Opening browser download…');
                  }
                );
              }}
              disabled={isUpdating}
              style={{
                width: '100%', padding: '14px', borderRadius: 16,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 900,
                cursor: isUpdating ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.45)',
                marginBottom: 10,
              }}
            >
              {isUpdating ? (
                <span>{updateStatus || (isRtl ? 'جاري تنزيل التحديث تلقائياً...' : 'Downloading…')}</span>
              ) : (
                <span>⚡ {isRtl ? 'تحديث وتثبيت النسخة الجديدة تلقائياً' : 'Update & Install Automatically'}</span>
              )}
            </button>

            <button
              onClick={() => setShowUpdateModal(false)}
              style={{
                width: '100%', padding: '10px', borderRadius: 12,
                background: 'transparent', border: 'none',
                color: colors.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {isRtl ? 'لاحقاً' : 'Later'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes auraPulseUpdate {
          0% { transform: scale(1); box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(16, 185, 129, 0.8); }
          100% { transform: scale(1); box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
        }
      `}</style>
    </div>
  );
}
