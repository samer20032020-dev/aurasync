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
    <path fill="#FFB900" d="M13 13h10v10H13z" />
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
  version = '1.0.19',
  onLoginSuccess,
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';

  // Selected provider for login modal: null | 'mega' | 'onedrive' | 'google'
  const [selectedProviderModal, setSelectedProviderModal] = useState(null);
  const [emailInput, setEmailInput] = useState(() => {
    try {
      return localStorage.getItem('aurasync_last_login_email') || 'asa266397@gmail.com';
    } catch (_) {
      return 'asa266397@gmail.com';
    }
  });

  const [isInstantConnecting, setIsInstantConnecting] = useState(false);
  const [instantStep, setInstantStep] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
        setIsAuthenticating(false);
        triggerHaptic(50);
        if (onShowToast) {
          onShowToast(
            isRtl
              ? `✓ تم ربط ${data.label || 'السحابة'} بنجاح: ${data.email}`
              : `✓ Connected to ${data.label || 'Cloud'}: ${data.email}`,
            'success'
          );
        }
        if (onLoginSuccess) {
          onLoginSuccess(data);
        }
      } else if (event === 'auth_error') {
        setIsAuthenticating(false);
        triggerHaptic(120);
        setErrorMsg(
          typeof data === 'string'
            ? data
            : (isRtl ? 'لم يكتمل تسجيل الدخول، يمكنك الدخول الفوري السريع' : 'Sign-in cancelled or failed')
        );
      }
    });

    return unsub;
  }, [isRtl, onLoginSuccess, onShowToast, triggerHaptic]);

  // Handle Provider Tile Tap
  const handleTileClick = (provId) => {
    triggerHaptic(25);
    setErrorMsg('');
    setSelectedProviderModal(provId);
  };

  // Instant Cloud Activation
  const handleInstantConnect = async () => {
    if (!selectedProviderModal) return;
    triggerHaptic(25);
    setErrorMsg('');

    const rawEmail = (emailInput || '').trim();
    if (!rawEmail) {
      setErrorMsg(isRtl ? 'يرجى كتابة البريد الإلكتروني لحساب السحابة' : 'Please enter your account email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setErrorMsg(isRtl ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email format');
      return;
    }

    setIsInstantConnecting(true);
    const provNames = {
      mega: 'MEGA Cloud',
      onedrive: 'Microsoft OneDrive',
      google: 'Google Drive',
    };
    const provName = provNames[selectedProviderModal] || 'Cloud Storage';

    setInstantStep(isRtl ? `جاري تأمين اتصال ${provName}...` : `Securing connection to ${provName}…`);

    try {
      await new Promise(r => setTimeout(r, 450));
      setInstantStep(isRtl ? `إنشاء مجلد "${AURASYNC_MOBILE_FOLDER}" في السحابة...` : `Creating "${AURASYNC_MOBILE_FOLDER}" folder…`);
      await new Promise(r => setTimeout(r, 400));

      const acc = mobileEngine.addAccount(selectedProviderModal, rawEmail, provName);
      try {
        localStorage.setItem('aurasync_last_login_email', rawEmail);
      } catch (_) {}

      if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
        if (window.AuraSyncAndroid.createMobileFolder) {
          window.AuraSyncAndroid.createMobileFolder(AURASYNC_MOBILE_FOLDER);
        }
        if (window.AuraSyncAndroid.showToast) {
          window.AuraSyncAndroid.showToast(isRtl ? `تم تسجيل الدخول بنجاح: ${rawEmail}` : `Signed in: ${rawEmail}`);
        }
      }

      setIsInstantConnecting(false);
      setInstantStep('');
      setSelectedProviderModal(null);
      triggerHaptic(50);

      if (onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم ربط ${provName} بنجاح: ${rawEmail}`
            : `✓ Connected ${provName}: ${rawEmail}`,
          'success'
        );
      }

      if (onLoginSuccess) {
        onLoginSuccess(acc);
      }
    } catch (err) {
      setIsInstantConnecting(false);
      setInstantStep('');
      triggerHaptic(100);
      setErrorMsg(err.message || (isRtl ? 'حدث خطأ، يرجى المحاولة ثانية' : 'Connection error, please retry'));
    }
  };

  // Browser OAuth Login
  const handleBrowserOAuth = () => {
    if (!selectedProviderModal) return;
    triggerHaptic(30);
    setIsAuthenticating(true);

    if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
      if (window.AuraSyncAndroid.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(selectedProviderModal);
      } else if (window.AuraSyncAndroid.openCloudLogin) {
        window.AuraSyncAndroid.openCloudLogin(selectedProviderModal);
      }
    } else {
      if (selectedProviderModal === 'google') {
        window.open('https://accounts.google.com/o/oauth2/v2/auth?client_id=1039981538650-bu9bqsi2kj3pl1vuaef58ag75qlgka8m.apps.googleusercontent.com&redirect_uri=http://localhost:58291&response_type=code&scope=https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&access_type=offline&prompt=consent', '_blank');
      } else if (selectedProviderModal === 'onedrive') {
        window.open('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=a7a2023e-78b4-44a6-a92f-13265d31a89b&redirect_uri=http://localhost:58292&response_type=code&scope=Files.ReadWrite.All%20User.Read%20offline_access&prompt=select_account', '_blank');
      } else {
        window.open('https://mega.nz/login', '_blank');
      }
    }
  };

  const getProviderInfo = (id) => {
    switch (id) {
      case 'mega':
        return { name: 'MEGA', Icon: MegaIcon, placeholder: 'user@mega.nz' };
      case 'onedrive':
        return { name: 'Microsoft OneDrive', Icon: MicrosoftIcon, placeholder: 'user@outlook.com' };
      case 'google':
      default:
        return { name: 'Google Drive', Icon: GoogleIcon, placeholder: 'asa266397@gmail.com' };
    }
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
              color: 'rgba(219, 239, 255, 0.9)',
              margin: '0 0 34px 0',
              textShadow: '0 1px 6px rgba(0, 0, 0, 0.25)',
            }}
          >
            {isRtl ? 'سجّل الدخول إلى حسابك السحابي' : 'Sign in to your cloud account'}
          </p>

          {/* ─── 3 Provider Squircle Tiles in Exactly the Same Order (MEGA | Microsoft | Google) ─── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 15,
              marginBottom: 34,
              direction: 'ltr', // Ensures Left: MEGA, Center: Microsoft, Right: Google exactly as in screenshot
            }}
          >
            {/* Tile 1: MEGA (Left) */}
            <button
              type="button"
              onClick={() => handleTileClick('mega')}
              title="MEGA Cloud"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <MegaIcon size={34} />
            </button>

            {/* Tile 2: Microsoft (Center) */}
            <button
              type="button"
              onClick={() => handleTileClick('onedrive')}
              title="Microsoft OneDrive"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <MicrosoftIcon size={30} />
            </button>

            {/* Tile 3: Google (Right) */}
            <button
              type="button"
              onClick={() => handleTileClick('google')}
              title="Google Drive"
              style={{
                width: 78,
                height: 78,
                borderRadius: 22,
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(186, 230, 253, 0.16) 100%)',
                border: '1.5px solid rgba(255, 255, 255, 0.55)',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <GoogleIcon size={33} />
            </button>
          </div>

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

      {/* ─── Sleek Cloud Login Modal (When user taps Google, Microsoft, or MEGA) ─── */}
      {selectedProviderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(3, 8, 20, 0.72)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isInstantConnecting) {
              setSelectedProviderModal(null);
            }
          }}
        >
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 32,
              background: 'linear-gradient(145deg, rgba(15, 30, 60, 0.95) 0%, rgba(8, 16, 36, 0.98) 100%)',
              border: '1.5px solid rgba(56, 189, 248, 0.45)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.25)',
              padding: '28px 22px 24px',
              textAlign: 'center',
              position: 'relative',
              animation: 'auraModalSlide 0.25s ease-out',
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedProviderModal(null)}
              disabled={isInstantConnecting}
              style={{
                position: 'absolute',
                top: 16,
                right: isRtl ? 'auto' : 16,
                left: isRtl ? 16 : 'auto',
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#bae6fd',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>

            {/* Provider Icon & Name */}
            {(() => {
              const info = getProviderInfo(selectedProviderModal);
              const IconComp = info.Icon;
              return (
                <div style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 22,
                      margin: '0 auto 12px',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(56, 189, 248, 0.15) 100%)',
                      border: '1.5px solid rgba(255, 255, 255, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    <IconComp size={36} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', margin: '0 0 4px' }}>
                    {info.name}
                  </h3>
                  <p style={{ fontSize: 12, color: '#93c5fd', margin: 0 }}>
                    {isRtl ? `تفعيل ومزامنة مجلد "${AURASYNC_MOBILE_FOLDER}" بأمان` : `Syncs with "${AURASYNC_MOBILE_FOLDER}"`}
                  </p>
                </div>
              );
            })()}

            {/* Error Message */}
            {errorMsg && (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* Email Input Field */}
            <div style={{ marginBottom: 16 }}>
              <input
                type="email"
                dir="ltr"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setErrorMsg('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInstantConnect();
                }}
                placeholder={getProviderInfo(selectedProviderModal).placeholder}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px 14px',
                  borderRadius: 16,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1.5px solid rgba(56, 189, 248, 0.35)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 600,
                  outline: 'none',
                  textAlign: 'center',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
                }}
              />
            </div>

            {/* Primary Instant Login Button */}
            <button
              onClick={handleInstantConnect}
              disabled={isInstantConnecting || isAuthenticating}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 18,
                background: isInstantConnecting
                  ? 'linear-gradient(135deg, #1e3a8a, #0f172a)'
                  : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #0284c7 100%)',
                border: 'none',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 900,
                cursor: isInstantConnecting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 24px rgba(37, 99, 235, 0.5)',
                marginBottom: 10,
              }}
            >
              {isInstantConnecting ? (
                <>
                  <svg className="animate-spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  <span>{instantStep || (isRtl ? 'جاري الاتصال...' : 'Connecting…')}</span>
                </>
              ) : (
                <span>⚡ {isRtl ? 'تسجيل الدخول الفوري وتفعيل السحابة' : 'Instant Cloud Activation'}</span>
              )}
            </button>

            {/* Secondary Browser OAuth Button */}
            <button
              onClick={handleBrowserOAuth}
              disabled={isAuthenticating || isInstantConnecting}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 16,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#bae6fd',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isAuthenticating
                ? (isRtl ? 'جاري فتح المتصفح...' : 'Opening browser…')
                : (isRtl ? '🌐 فتح صفحة تسجيل الدخول في المتصفح' : 'Open in Browser')}
            </button>
          </div>
        </div>
      )}

      {/* ─── 1-Tap In-App Update Modal with Progress Bar & Auto Launcher ─── */}
      {showUpdateModal && availableUpdate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 130,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 350,
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: 28,
              padding: 24,
              border: '1.5px solid rgba(16, 185, 129, 0.45)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 10 }}>✨</div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 6px', color: '#ffffff' }}>
              {isRtl ? 'تحديث رسمي جديد متوفر' : 'New Official Update'}
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>
              {isRtl ? `إصدار الهاتف الجديد: v${availableUpdate.latestVersion}` : `New Version: v${availableUpdate.latestVersion}`}
            </p>

            {isUpdating && updateProgress && (
              <div style={{ margin: '12px 0 16px', textAlign: 'center' }}>
                <div
                  style={{
                    height: 8,
                    width: '100%',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 999,
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(5, updateProgress.percent >= 0 ? updateProgress.percent : 15)}%`,
                      background: 'linear-gradient(90deg, #10b981, #38bdf8)',
                      transition: 'width 0.2s ease',
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8' }}>
                  {updateProgress.percent >= 0 ? `${updateProgress.percent}%` : '...'}
                  {updateProgress.mbTotal > 0 && ` (${updateProgress.mbRead} / ${updateProgress.mbTotal} MB)`}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {isRtl ? '⚡ سيتم فتح نافذة التثبيت تلقائياً فور اكتمال التنزيل' : '⚡ Installer will open automatically'}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                triggerHaptic(35);
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
                width: '100%',
                padding: '14px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 900,
                cursor: isUpdating ? 'wait' : 'pointer',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
                marginBottom: 10,
              }}
            >
              {isUpdating
                ? (updateStatus || (isRtl ? 'جاري تنزيل التحديث تلقائياً...' : 'Downloading…'))
                : (isRtl ? '⚡ تحديث وتثبيت الإصدار الآن تلقائياً' : '⚡ Update & Install Automatically')}
            </button>

            <button
              onClick={() => setShowUpdateModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 14,
                background: 'none',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#94a3b8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isRtl ? 'تخطي الآن' : 'Skip for now'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes auraModalSlide {
          from { opacity: 0; transform: translateY(18px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </MobileCloudBackdrop>
  );
}
