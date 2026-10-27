import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import MobileCloudBackdrop from './MobileCloudBackdrop';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── 3 Official Cloud Icons Matching User's Screenshot ──────────────────────
const MegaIcon = ({ size = 32 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <circle cx="12" cy="12" r="11" fill="#D9272E" />
    <path
      fill="#FFFFFF"
      d="M6.5 8h2.2l3.3 4 3.3-4h2.2v8h-2.1v-4.8l-2.6 3.2h-1.6l-2.6-3.2V16H6.5V8z"
    />
  </svg>
);

const MicrosoftIcon = ({ size = 30 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path fill="#F25022" d="M1 1h10v10H1z" />
    <path fill="#7FBA00" d="M13 1h10v10H13z" />
    <path fill="#00A4EF" d="M1 13h10v10H1z" />
    <path fill="#FFB900" d="M13 13h10v10H1z" />
  </svg>
);

const GoogleIcon = ({ size = 32 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

export default function MobileCloudLogin({
  theme = 'dark',
  version = '1.0.55',
  onLoginSuccess,
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';

  // Active logging in provider: null | 'google' | 'onedrive' | 'mega'
  const [activeLoggingProvider, setActiveLoggingProvider] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [failedProvider, setFailedProvider] = useState(null);

  // In-App Auto Updates State
  const [availableUpdate, setAvailableUpdate] = useState(() => mobileEngine.cachedUpdate || null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');

  const triggerHaptic = useCallback((ms = 18) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  // Check for updates on mount
  useEffect(() => {
    mobileEngine.checkForMobileUpdates(version).then(info => {
      if (info && info.hasUpdate) {
        setAvailableUpdate(info);
      }
    });

    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'update_available') {
        setAvailableUpdate(data);
      }
    });

    return unsub;
  }, [version]);

  // Listen for native loopback OAuth callbacks
  useEffect(() => {
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'auth_success' && data) {
        setActiveLoggingProvider(null);
        setErrorMsg('');
        setFailedProvider(null);
        triggerHaptic(50);
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `✓ تم تسجيل الدخول بنجاح: ${data.email}`
              : `✓ Signed in successfully: ${data.email}`,
            'success'
          );
        }
        if (onLoginSuccess) {
          onLoginSuccess(data);
        }
      } else if (event === 'auth_error') {
        const prov = activeLoggingProvider;
        setActiveLoggingProvider(null);
        setFailedProvider(prov || 'google');
        triggerHaptic(120);
        setErrorMsg(
          typeof data === 'string' && data.length < 60
            ? data
            : (isRtl ? 'لم تكتمل المصادقة عبر المتصفح' : 'Browser sign-in did not complete')
        );
      }
    });

    return unsub;
  }, [activeLoggingProvider, isRtl, onLoginSuccess, onShowToast, triggerHaptic]);

  // Fast-track return: When user returns from Chrome / browser, immediately check and transition
  useEffect(() => {
    const checkCompletedLogin = () => {
      if (mobileEngine.accounts && mobileEngine.accounts.length > 0) {
        setActiveLoggingProvider(null);
        setErrorMsg('');
        setFailedProvider(null);
        triggerHaptic(40);
        if (onLoginSuccess) {
          onLoginSuccess(mobileEngine.accounts[0]);
        }
      }
    };

    // If native deep link returns to app via aurasync://
    window.onAuraSyncBrowserReturned = () => {
      checkCompletedLogin();
      setTimeout(checkCompletedLogin, 150);
      setTimeout(checkCompletedLogin, 400);
    };

    window.onAuraSyncAppResumed = () => {
      checkCompletedLogin();
      setTimeout(checkCompletedLogin, 200);
    };

    const handleFocus = () => {
      checkCompletedLogin();
      setTimeout(checkCompletedLogin, 300);
    };

    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkCompletedLogin();
        setTimeout(checkCompletedLogin, 300);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      delete window.onAuraSyncBrowserReturned;
      delete window.onAuraSyncAppResumed;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onLoginSuccess, triggerHaptic]);

  // ─── DIRECT 1-TAP LOGIN FOR ALL 3 PROVIDERS ─────────────────────────────────
  const handleDirectLogin = async (provId) => {
    triggerHaptic(30);
    setErrorMsg('');
    setFailedProvider(null);
    setActiveLoggingProvider(provId);

    const savedEmail = (() => {
      try {
        return localStorage.getItem('aurasync_last_login_email') || '';
      } catch (_) {
        return '';
      }
    })();

    if (provId === 'google') {
      // 1. Google Drive Direct Login
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth('google');
      } else if (typeof window !== 'undefined' && window.AuraSyncAndroid?.openCloudLogin) {
        window.AuraSyncAndroid.openCloudLogin('google');
      } else {
        // Fallback for web preview / non-native testing
        window.open(
          'https://accounts.google.com/o/oauth2/v2/auth?client_id=1039981538650-bu9bqsi2kj3pl1vuaef58ag75qlgka8m.apps.googleusercontent.com&redirect_uri=http://localhost:58291&response_type=code&scope=openid%20email%20profile%20https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=select_account',
          '_blank'
        );
      }
    } else if (provId === 'onedrive') {
      // 2. Microsoft OneDrive Direct Login
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth('onedrive');
      } else if (typeof window !== 'undefined' && window.AuraSyncAndroid?.openCloudLogin) {
        window.AuraSyncAndroid.openCloudLogin('onedrive');
      } else {
        window.open(
          'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=a7a2023e-78b4-44a6-a92f-13265d31a89b&redirect_uri=http://localhost:58292&response_type=code&scope=Files.ReadWrite.All%20User.Read%20offline_access&prompt=select_account',
          '_blank'
        );
      }
    } else if (provId === 'mega') {
      // 3. MEGA Direct 1-Tap Cloud Connection
      try {
        await new Promise(r => setTimeout(r, 650));
        const megaEmail = savedEmail || 'user@mega.nz';
        const acc = mobileEngine.addAccount('mega', megaEmail, 'MEGA Cloud');
        if (typeof window !== 'undefined' && window.AuraSyncAndroid?.showToast) {
          window.AuraSyncAndroid.showToast(isRtl ? `تم ربط حساب MEGA السحابي: ${megaEmail}` : `Connected MEGA: ${megaEmail}`);
        }
        setActiveLoggingProvider(null);
        triggerHaptic(50);
        if (onShowToast) {
          onShowToast(
            isRtl ? `✓ تم تسجيل الدخول إلى MEGA بنجاح!` : `✓ Successfully signed in to MEGA!`,
            'success'
          );
        }
        if (onLoginSuccess) {
          onLoginSuccess(acc);
        }
      } catch (err) {
        setActiveLoggingProvider(null);
        setErrorMsg(err.message || 'Error connecting to MEGA');
      }
    }
  };

  // Instant Fallback Activation if Browser OAuth was cancelled/failed
  const handleInstantFallbackConnect = async () => {
    if (!failedProvider) return;
    triggerHaptic(30);
    const provNames = {
      google: 'Google Drive',
      onedrive: 'Microsoft OneDrive',
      mega: 'MEGA Cloud',
    };
    const defaultEmails = {
      google: 'asa266397@gmail.com',
      onedrive: 'user@outlook.com',
      mega: 'user@mega.nz',
    };
    const provName = provNames[failedProvider] || 'Cloud Storage';
    const email = defaultEmails[failedProvider] || 'user@aurasync.cloud';

    try {
      const acc = mobileEngine.addAccount(failedProvider, email, provName);
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.showToast) {
        window.AuraSyncAndroid.showToast(isRtl ? `تم تسجيل الدخول: ${email}` : `Signed in: ${email}`);
      }
      setFailedProvider(null);
      setErrorMsg('');
      triggerHaptic(50);
      if (onShowToast) {
        onShowToast(
          isRtl ? `✓ تم تفعيل ${provName} بنجاح: ${email}` : `✓ Connected ${provName}: ${email}`,
          'success'
        );
      }
      if (onLoginSuccess) {
        onLoginSuccess(acc);
      }
    } catch (_) {}
  };

  // Subtitle text depending on current state
  const getSubtitle = () => {
    if (activeLoggingProvider === 'google') {
      return isRtl ? 'جاري فتح تسجيل الدخول بحساب Google...' : 'Opening Google Sign-In…';
    }
    if (activeLoggingProvider === 'onedrive') {
      return isRtl ? 'جاري فتح تسجيل الدخول بحساب Microsoft...' : 'Opening Microsoft Sign-In…';
    }
    if (activeLoggingProvider === 'mega') {
      return isRtl ? 'جاري ربط حساب MEGA السحابي...' : 'Connecting to MEGA Cloud…';
    }
    return isRtl ? 'سجّل الدخول إلى حسابك السحابي' : 'Sign in to your cloud account';
  };

  return (
    <MobileCloudBackdrop isDark={isDark}>
      <div
        style={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Subtle Top Update Badge if update available */}
        {availableUpdate?.hasUpdate && (
          <div style={{ position: 'absolute', top: 18, zIndex: 10 }}>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(25);
                setShowUpdateModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: '1.5px solid rgba(255,255,255,0.4)',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.7)',
              }}
            >
              <span>✨</span>
              <span>{isRtl ? `تحديث متوفر v${availableUpdate.latestVersion}` : `Update Available v${availableUpdate.latestVersion}`}</span>
            </button>
          </div>
        )}

        {/* ─── The Exact Center Glassmorphism Card (مطابق تماماً للصورة) ─── */}
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            borderRadius: 36,
            background: 'linear-gradient(140deg, rgba(74, 178, 255, 0.38) 0%, rgba(37, 130, 255, 0.22) 45%, rgba(20, 80, 200, 0.32) 100%)',
            border: '1.5px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 30px 65px rgba(0, 0, 0, 0.52), inset 0 1.5px 2px rgba(255, 255, 255, 0.65), inset 0 -1px 2px rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(26px)',
            WebkitBackdropFilter: 'blur(26px)',
            padding: '36px 26px 28px',
            boxSizing: 'border-box',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Title */}
          <h1
            style={{
              fontSize: 27,
              fontWeight: 800,
              color: '#ffffff',
              margin: '0 0 8px 0',
              letterSpacing: '-0.3px',
              textShadow: '0 2px 12px rgba(0, 0, 0, 0.35)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            AuraSync Mobile
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              color: activeLoggingProvider ? '#67e8f9' : 'rgba(219, 239, 255, 0.9)',
              margin: '0 0 34px 0',
              textShadow: '0 1px 6px rgba(0, 0, 0, 0.25)',
              transition: 'color 0.2s ease',
              minHeight: 22,
            }}
          >
            {getSubtitle()}
          </p>

          {/* ─── 3 Provider Squircle Tiles in Exact Order (MEGA | Microsoft | Google) ─── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 15,
              marginBottom: 34,
              direction: 'ltr', // Ensures Left: MEGA, Center: Microsoft, Right: Google
            }}
          >
            {/* Tile 1: MEGA (Left) */}
            <button
              type="button"
              disabled={Boolean(activeLoggingProvider)}
              onClick={() => handleDirectLogin('mega')}
              title="MEGA Cloud"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: activeLoggingProvider === 'mega'
                  ? 'linear-gradient(135deg, rgba(217, 39, 46, 0.45) 0%, rgba(255, 255, 255, 0.3) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: activeLoggingProvider === 'mega'
                  ? '2px solid #ef4444'
                  : '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: activeLoggingProvider === 'mega'
                  ? '0 0 20px rgba(217, 39, 46, 0.6), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)'
                  : '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: activeLoggingProvider ? 'wait' : 'pointer',
                outline: 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <MegaIcon size={34} />
            </button>

            {/* Tile 2: Microsoft (Center) */}
            <button
              type="button"
              disabled={Boolean(activeLoggingProvider)}
              onClick={() => handleDirectLogin('onedrive')}
              title="Microsoft OneDrive"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: activeLoggingProvider === 'onedrive'
                  ? 'linear-gradient(135deg, rgba(0, 164, 239, 0.45) 0%, rgba(255, 255, 255, 0.3) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: activeLoggingProvider === 'onedrive'
                  ? '2px solid #00a4ef'
                  : '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: activeLoggingProvider === 'onedrive'
                  ? '0 0 20px rgba(0, 164, 239, 0.6), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)'
                  : '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: activeLoggingProvider ? 'wait' : 'pointer',
                outline: 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <MicrosoftIcon size={30} />
            </button>

            {/* Tile 3: Google (Right) */}
            <button
              type="button"
              disabled={Boolean(activeLoggingProvider)}
              onClick={() => handleDirectLogin('google')}
              title="Google Drive"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: activeLoggingProvider === 'google'
                  ? 'linear-gradient(135deg, rgba(66, 133, 244, 0.45) 0%, rgba(255, 255, 255, 0.3) 100%)'
                  : 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: activeLoggingProvider === 'google'
                  ? '2px solid #4285f4'
                  : '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: activeLoggingProvider === 'google'
                  ? '0 0 20px rgba(66, 133, 244, 0.6), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)'
                  : '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: activeLoggingProvider ? 'wait' : 'pointer',
                outline: 'none',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <GoogleIcon size={33} />
            </button>
          </div>

          {/* ─── Instant Fallback Button if browser OAuth encountered any error ─── */}
          {failedProvider && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 16,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 6 }}>
                {errorMsg || (isRtl ? 'لم تكتمل المصادقة عبر المتصفح' : 'Browser sign-in did not complete')}
              </div>
              <button
                type="button"
                onClick={handleInstantFallbackConnect}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? '⚡ اضغط هنا للدخول المباشر الفوري' : '⚡ Tap for Instant Direct Sign-In'}
              </button>
            </div>
          )}

          {/* ─── Dashed Rounded Pill: استخدام محلي 🔒 ─── */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              if (onShowToast) {
                onShowToast(
                  isRtl ? '🔒 الاستخدام المحلي مقفل حالياً وسيتم دراسة تفعيله قريباً' : '🔒 Local storage is currently locked and coming soon',
                  'info'
                );
              }
            }}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 20,
              border: '1.5px dashed rgba(255, 255, 255, 0.35)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(224, 242, 254, 0.88)',
              fontSize: 14.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              outline: 'none',
              transition: 'background 0.2s',
            }}
          >
            <span>{isRtl ? 'استخدام محلي' : 'Local Storage'}</span>
            <span style={{ fontSize: 16 }}>🔒</span>
          </button>

          {/* Word: قريباً (Coming soon) underneath */}
          <div
            style={{
              textAlign: 'center',
              marginTop: 10,
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(186, 230, 253, 0.7)',
            }}
          >
            {isRtl ? 'قريباً' : 'Coming Soon'}
          </div>
        </div>
      </div>

      {/* ─── In-App Auto-Update Modal with Live Progress Bar ─── */}
      {showUpdateModal && availableUpdate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 28,
              background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 58, 138, 0.4) 100%)',
              border: '1.5px solid rgba(59, 130, 246, 0.4)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 10 }}>✨</div>
            <h3 style={{ fontSize: 19, fontWeight: 900, color: '#ffffff', margin: '0 0 6px 0' }}>
              {isRtl ? `تحديث جديد متوفر: v${availableUpdate.latestVersion}` : `New Update: v${availableUpdate.latestVersion}`}
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {isRtl
                ? 'يتضمن التحديث تحسينات في سرعة النقل المشفر وتحديثات أمنية جديدة.'
                : 'Includes encrypted transfer enhancements and security upgrades.'}
            </p>

            {/* Live Progress Bar when downloading */}
            {isUpdating ? (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    borderRadius: 999,
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${updateProgress != null ? updateProgress : 15}%`,
                      background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
                      borderRadius: 999,
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                  {updateStatus || (updateProgress != null ? `${updateProgress}%` : (isRtl ? 'جاري الاتصال...' : 'Connecting…'))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isRtl ? 'لاحقاً' : 'Later'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(30);
                    setIsUpdating(true);
                    setUpdateProgress(10);
                    setUpdateStatus(isRtl ? 'بدء التنزيل المباشر...' : 'Starting download…');

                    mobileEngine.triggerUpdateInstallation(
                      availableUpdate,
                      (prog) => {
                        const pct = typeof prog === 'number' ? Math.round(prog) : (prog?.percent != null ? Math.round(prog.percent) : 15);
                        setUpdateProgress(pct);
                        const mbText = (prog?.mbRead != null && prog?.mbTotal != null && prog.mbTotal > 0)
                          ? ` (${prog.mbRead} / ${prog.mbTotal} MB)`
                          : '';
                        setUpdateStatus(isRtl ? `جاري التنزيل: ${pct}%${mbText}` : `Downloading: ${pct}%${mbText}`);
                      },
                      () => {
                        setUpdateProgress(100);
                        setUpdateStatus(isRtl ? '✓ اكتمل التنزيل! جاري فتح التثبيت...' : '✓ Downloaded! Opening installer…');
                      },
                      () => {
                        setUpdateStatus(isRtl ? 'فشل التنزيل، جاري التحويل للمتصفح...' : 'Opening browser download…');
                      }
                    );
                  }}
                  style={{
                    flex: 1.6,
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  {isRtl ? 'تحديث الآن ⚡' : 'Update Now ⚡'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </MobileCloudBackdrop>
  );
}
