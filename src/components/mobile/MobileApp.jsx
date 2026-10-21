import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import BrandLogo from '../BrandLogo';
import MobileHome from './MobileHome';
import MobileCloudExplorer from './MobileCloudExplorer';
import MobileSettings from './MobileSettings';
import MobileAutoBackup from './MobileAutoBackup';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── Bottom Nav Icons ────────────────────────────────────────────────────────
const HomeIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const FilesIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const SettingsIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ─── Auto-Backup Icon ────────────────────────────────────────────────────────
const BackupIcon = ({ active }) => (
  <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

export default function MobileApp({
  version = '1.0.9',
  accounts = [],
  storage = {},
  stats = {},
  files = [],
  onTriggerSync,
  onSwitchToDesktop,
  isSyncing = false
}) {
  const { language, setLanguage } = useTranslation();
  const isRtl = language === 'ar';

  // 3 Tabs: home | files | settings
  const [activeTab, setActiveTab] = useState('home');
  const [toast, setToast] = useState(null);
  const [pressedTab, setPressedTab] = useState(null);

  // Theme: 'dark' | 'light'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aurasync_mobile_theme') || mobileEngine.settings.theme || 'dark';
    } catch (_) {
      return 'dark';
    }
  });

  // Permission prompt on startup
  const [showPermPrompt, setShowPermPrompt] = useState(false);

  // Biometric lock & PIN prompt
  const [isLocked, setIsLocked] = useState(() => Boolean(mobileEngine.settings.biometricLock));
  const [bioError, setBioError] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

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
    setTimeout(() => setToast(null), 3400);
  }, [triggerHaptic]);

  // Request permissions on first launch
  useEffect(() => {
    try {
      const granted = localStorage.getItem('aurasync_mobile_perms_granted');
      if (!granted) {
        setShowPermPrompt(true);
        if (window.AuraSyncAndroid?.requestStoragePermissions) {
          window.AuraSyncAndroid.requestStoragePermissions();
        }
      }
    } catch (_) {}
  }, []);

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
        // null -> No hardware biometrics or unsupported, hint PIN
        showToast(isRtl ? 'أدخل رمز PIN للفتح (الافتراضي: 1234)' : 'Enter PIN to unlock (default: 1234)', 'info');
      }
    } catch (_) {
      setIsAuthenticating(false);
      setBioError(true);
      setTimeout(() => setBioError(false), 2500);
    }
  }, [isRtl, showToast, triggerHaptic]);

  // Biometric prompt on launch if on Android native
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
          showToast(isRtl ? '✓ تم التحقق من رمز PIN وإلغاء القفل' : '✓ Unlocked with PIN', 'success');
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
        ? (isRtl ? 'تم تفعيل الوضع الليلي (Dark Mode)' : 'Dark mode activated')
        : (isRtl ? 'تم تفعيل الوضع الفاتح (Light Mode)' : 'Light mode activated'),
      'info'
    );
  };

  const handleGrantPermissions = async () => {
    triggerHaptic(30);
    await mobileEngine.requestAllPermissions();
    localStorage.setItem('aurasync_mobile_perms_granted', 'true');
    setShowPermPrompt(false);
    showToast(
      isRtl ? '✓ تم منح جميع أذونات الهاتف والملفات بنجاح' : '✓ Mobile and storage permissions granted',
      'success'
    );
  };

  const handleTabChange = useCallback((tabId) => {
    if (tabId === activeTab) return;
    triggerHaptic(12);
    setPressedTab(tabId);
    setTimeout(() => setPressedTab(null), 300);
    setActiveTab(tabId);
  }, [activeTab, triggerHaptic]);

  // 4 Bottom Tabs
  const tabs = [
    { id: 'home',     ar: 'الرئيسية', en: 'Home',     Icon: HomeIcon },
    { id: 'backup',   ar: 'النسخ',     en: 'Backup',   Icon: BackupIcon },
    { id: 'files',    ar: 'الملفات',   en: 'Files',    Icon: FilesIcon },
    { id: 'settings', ar: 'الإعدادات', en: 'Settings', Icon: SettingsIcon },
  ];

  // Theme styling tokens
  const colors = {
    bg: isDark ? '#060810' : '#f8fafc',
    surface: isDark ? 'rgba(15,20,40,0.92)' : '#ffffff',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.9)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    headerBg: isDark ? 'rgba(6,8,16,0.96)' : 'rgba(255,255,255,0.95)',
    navBg: isDark ? 'rgba(8,10,22,0.98)' : 'rgba(255,255,255,0.98)',
    accent: isDark ? '#3b82f6' : '#2563eb',
    accentLight: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.1)',
  };

  const toastBg = { info: isDark ? '#1e3a5f' : '#eff6ff', success: isDark ? '#14532d' : '#ecfdf5', warn: isDark ? '#451a03' : '#fffbeb' };
  const toastBorder = { info: 'rgba(59,130,246,0.4)', success: 'rgba(52,211,153,0.4)', warn: 'rgba(245,158,11,0.4)' };
  const toastColor = { info: isDark ? '#93c5fd' : '#1d4ed8', success: isDark ? '#6ee7b7' : '#047857', warn: isDark ? '#fcd34d' : '#b45309' };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%', minHeight: '100vh',
        background: colors.bg,
        fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
        color: colors.text, overflowX: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}
    >
      {/* Ambient background glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '80%', height: '220px', pointerEvents: 'none', zIndex: 0,
        background: isDark
          ? 'radial-gradient(ellipse at top, rgba(37,99,235,0.1) 0%, transparent 70%)'
          : 'radial-gradient(ellipse at top, rgba(37,99,235,0.06) 0%, transparent 70%)',
      }}/>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 12px',
        background: colors.headerBg,
        backdropFilter: 'blur(24px)',
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
              <span style={{ fontSize: 16, fontWeight: 900, color: colors.text, letterSpacing: '-0.5px' }}>
                AuraSync
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
                padding: '2px 7px', borderRadius: 999,
                background: colors.accentLight,
                color: colors.accent,
                border: `1px solid ${colors.accent}40`,
              }}>
                MOBILE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'monospace' }}>
                📁 {AURASYNC_MOBILE_FOLDER}
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls: Theme toggle + Desktop switch + Version */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Theme Switcher Button */}
          <button
            onClick={handleToggleTheme}
            title={isDark ? 'التبديل إلى الوضع الفاتح' : 'Switch to Dark Mode'}
            style={{
              padding: '6px 10px', borderRadius: 12,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              color: colors.text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700,
            }}
          >
            {isDark ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                <span style={{ fontSize: 10 }}>فاتح</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6366f1" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                <span style={{ fontSize: 10 }}>داكن</span>
              </>
            )}
          </button>

          {onSwitchToDesktop && (
            <button
              onClick={() => { triggerHaptic(20); onSwitchToDesktop(); }}
              title={isRtl ? 'إغلاق المعاينة' : 'Exit Preview'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 10,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                color: colors.textMuted,
                cursor: 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          <div style={{
            padding: '4px 9px', borderRadius: 10,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: colors.textMuted,
          }}>
            v{version}
          </div>
        </div>
      </header>

      {/* ── Main View (Render Active Tab) ─────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 88, position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 0' }}>
          <div key={activeTab} style={{ animation: 'pageFadeIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
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
                onSwitchToDesktop={onSwitchToDesktop}
                onShowToast={showToast}
              />
            )}
          </div>
        </div>
      </main>

      {/* ── Biometric & PIN Lock Overlay ─────────────────────────────────── */}
      {isLocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: isDark ? 'rgba(5,7,15,0.98)' : 'rgba(248,250,252,0.98)',
          backdropFilter: 'blur(36px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px 20px', textAlign: 'center', overflowY: 'auto',
        }}>
          {/* Lock Brand Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: pinSuccess
              ? 'linear-gradient(135deg, #059669, #10b981)'
              : pinError
              ? 'linear-gradient(135deg, #dc2626, #ef4444)'
              : 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            boxShadow: pinSuccess
              ? '0 0 30px rgba(16,185,129,0.6)'
              : pinError
              ? '0 0 30px rgba(239,68,68,0.6)'
              : '0 0 30px rgba(59,130,246,0.45)',
            animation: isAuthenticating ? 'pulseGlow 1.2s infinite' : pinError ? 'pinShake 0.4s ease' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {pinSuccess ? (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M12 2c1.5 0 3 .5 4 1.5l4 4-2 2-4-4-4 4-2-2 4-4A5 5 0 0 1 12 2z"/><ellipse cx="12" cy="17" rx="4" ry="3"/><path d="M9 17v-2a3 3 0 0 1 6 0v2"/>
              </svg>
            )}
          </div>

          <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 6px', color: colors.text }}>
            {isRtl ? 'AuraSync مقفل للحماية' : 'AuraSync Secured Vault'}
          </h2>
          <p style={{ fontSize: 12, color: colors.textMuted, maxWidth: 300, lineHeight: 1.5, margin: '0 0 16px' }}>
            {isRtl ? 'المس مستشعر البصمة أو أدخل رمز PIN المكون من 4 أرقام' : 'Touch fingerprint sensor or enter 4-digit PIN'}
          </p>

          {/* Biometric trigger button */}
          <button
            onClick={handleUnlockBiometric}
            disabled={isAuthenticating}
            style={{
              padding: '10px 22px', borderRadius: 14,
              background: isAuthenticating
                ? 'rgba(59,130,246,0.2)'
                : isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.08)',
              border: '1px solid rgba(59,130,246,0.35)',
              color: colors.accent, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              marginBottom: 16, transition: 'all 0.2s',
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: isAuthenticating ? 'mhSpin 1s linear infinite' : 'none' }}>
              <path d="M12 2c1.5 0 3 .5 4 1.5l4 4-2 2-4-4-4 4-2-2 4-4A5 5 0 0 1 12 2z"/><ellipse cx="12" cy="17" rx="4" ry="3"/><path d="M9 17v-2a3 3 0 0 1 6 0v2"/>
            </svg>
            <span>
              {isAuthenticating
                ? (isRtl ? 'جاري التحقق من البصمة...' : 'Scanning biometrics…')
                : (isRtl ? 'المس البصمة / Face ID للفتح' : 'Scan Fingerprint / Face ID')}
            </span>
          </button>

          {/* Feedback messages */}
          {bioError && (
            <div style={{
              color: '#ef4444', fontSize: 12, fontWeight: 700, marginBottom: 12,
              padding: '6px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)',
              animation: 'pinShake 0.4s ease',
            }}>
              {isRtl ? '❌ لم يتم التعرف على البصمة أو تم الإلغاء! أدخل رمز PIN' : '❌ Biometric not recognized or cancelled! Use PIN'}
            </div>
          )}

          {pinError && (
            <div style={{
              color: '#ef4444', fontSize: 12, fontWeight: 700, marginBottom: 12,
              padding: '6px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)',
              animation: 'pinShake 0.4s ease',
            }}>
              {isRtl ? '❌ رمز PIN غير صحيح! حاول مجدداً' : '❌ Incorrect PIN! Try again'}
            </div>
          )}

          {/* 4 PIN Indicator Dots */}
          <div style={{
            display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 20,
            animation: pinError ? 'pinShake 0.4s ease' : 'none',
          }}>
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = enteredPin.length > idx;
              return (
                <div
                  key={idx}
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: `2px solid ${pinSuccess ? '#10b981' : pinError ? '#ef4444' : isFilled ? colors.accent : colors.border}`,
                    background: pinSuccess ? '#10b981' : pinError ? '#ef4444' : isFilled ? colors.accent : 'transparent',
                    boxShadow: isFilled ? `0 0 10px ${pinSuccess ? '#10b981' : pinError ? '#ef4444' : colors.accent}` : 'none',
                    transform: isFilled ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                />
              );
            })}
          </div>

          {/* 12-Key Numeric Keypad */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 12,
            justifyContent: 'center', marginBottom: 16,
          }}>
            {[
              { val: '1', sub: '' },
              { val: '2', sub: 'ABC' },
              { val: '3', sub: 'DEF' },
              { val: '4', sub: 'GHI' },
              { val: '5', sub: 'JKL' },
              { val: '6', sub: 'MNO' },
              { val: '7', sub: 'PQRS' },
              { val: '8', sub: 'TUV' },
              { val: '9', sub: 'WXYZ' },
              { val: 'bio', isBio: true },
              { val: '0', sub: '+' },
              { val: 'back', isBack: true },
            ].map(({ val, sub, isBio, isBack }, i) => {
              if (isBio) {
                return (
                  <button
                    key={i}
                    onClick={handleUnlockBiometric}
                    title={isRtl ? 'مسح البصمة' : 'Scan fingerprint'}
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(37,99,235,0.06)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      color: colors.accent,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', outline: 'none', transition: 'transform 0.1s',
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2c1.5 0 3 .5 4 1.5l4 4-2 2-4-4-4 4-2-2 4-4A5 5 0 0 1 12 2z"/><ellipse cx="12" cy="17" rx="4" ry="3"/><path d="M9 17v-2a3 3 0 0 1 6 0v2"/>
                    </svg>
                  </button>
                );
              }
              if (isBack) {
                return (
                  <button
                    key={i}
                    onClick={handleBackspace}
                    title={isRtl ? 'مسح رقم' : 'Backspace'}
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: 'transparent',
                      border: `1px solid ${colors.border}`,
                      color: colors.textMuted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', outline: 'none', transition: 'transform 0.1s',
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                      <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                    </svg>
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigitPress(val)}
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${colors.border}`,
                    color: colors.text,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', outline: 'none', transition: 'transform 0.1s',
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{val}</span>
                  {sub && (
                    <span style={{ fontSize: 8, fontWeight: 600, color: colors.textMuted, letterSpacing: 1, marginTop: 2 }}>
                      {sub}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {isRtl ? 'الرمز الافتراضي: 1234 (يمكن تغييره من الإعدادات)' : 'Default PIN: 1234 (Changeable in Settings)'}
          </div>
        </div>
      )}

      {/* ── First-Launch Permission Prompt Modal ──────────────────────────── */}
      {showPermPrompt && !isLocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            background: colors.surface,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: '24px 20px',
            border: `1px solid ${colors.border}`,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
            animation: 'slideUpSheet 0.3s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: colors.border, margin: '0 auto 16px' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: colors.accentLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={colors.accent} strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: colors.text }}>
                  {isRtl ? 'أذونات التخزين والملفات' : 'Storage & File Permissions'}
                </h3>
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {isRtl ? 'مطلوبة لمزامنة الصور وإدارة مجلد aurasync-mobile' : 'Required to backup photos & sync cloud storage'}
                </span>
              </div>
            </div>
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 16, padding: '12px 14px', marginBottom: 20,
              fontSize: 12, color: colors.textMuted, lineHeight: 1.6,
            }}>
              {isRtl
                ? 'يحتاج التطبيق للوصول إلى ذاكرة الهاتف والصور والفيديوهات ليتمكن من حفظها في السحابة وإخلاء المساحة عند الطلب مع حمايتها بسياسة عدم الحذف.'
                : 'AuraSync needs file & storage access to backup photos & videos to aurasync-mobile and free up storage when requested.'}
            </div>
            <button
              onClick={handleGrantPermissions}
              style={{
                width: '100%', padding: '14px', borderRadius: 16,
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
              }}
            >
              {isRtl ? 'منح الأذونات ومتابعة ✓' : 'Grant Permissions & Continue ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Alert ──────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 70,
          maxWidth: 448, margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 16,
          background: toastBg[toast.type] || toastBg.info,
          border: `1px solid ${toastBorder[toast.type] || toastBorder.info}`,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
          animation: 'slideUpSheet 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: toastColor[toast.type] || toastColor.info,
            flexShrink: 0,
          }}/>
          <span style={{ fontSize: 13, fontWeight: 600, color: toastColor[toast.type] || toastColor.info, flex: 1 }}>
            {toast.msg}
          </span>
        </div>
      )}

      {/* ── Bottom Navigation Bar (EXACTLY 3 TABS) ───────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        maxWidth: 480, margin: '0 auto',
        background: colors.navBg,
        backdropFilter: 'blur(32px)',
        borderTop: `1px solid ${colors.border}`,
        paddingBottom: 'env(safe-area-inset-bottom, 6px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-around', padding: '6px 12px' }}>
          {tabs.map(({ id, ar, en, Icon }) => {
            const isActive = activeTab === id;
            const isPressed = pressedTab === id;
            return (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                style={{
                  position: 'relative', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  flex: 1, minHeight: 56, padding: '4px 6px', borderRadius: 16,
                  background: isActive ? colors.accentLight : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: isActive ? colors.accent : colors.textMuted,
                  transform: isPressed ? 'scale(0.9)' : 'scale(1)',
                  transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
                  outline: 'none',
                }}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
                    width: 4, height: 4, borderRadius: '50%',
                    background: colors.accent,
                    boxShadow: `0 0 6px ${colors.accent}`,
                  }}/>
                )}
                <Icon active={isActive} />
                <span style={{
                  marginTop: 3, fontSize: 11, fontWeight: isActive ? 800 : 500,
                  color: isActive ? colors.accent : colors.textMuted,
                }}>
                  {isRtl ? ar : en}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Keyframe Animations ───────────────────────────────────────────── */}
      <style>{`
        @keyframes pageFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpSheet {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.05); opacity: 0.85; }
        }
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        @keyframes mhSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
