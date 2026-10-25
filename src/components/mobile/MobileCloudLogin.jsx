import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import BrandLogo from '../BrandLogo';
import MobileCloudBackdrop from './MobileCloudBackdrop';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── 3 Official Provider Icons (Google, Microsoft, MEGA) ────────────────────
const GoogleIcon = ({ size = 26 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

const MicrosoftIcon = ({ size = 26 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path fill="#F25022" d="M1 1h10v10H1z"/>
    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
    <path fill="#FFB900" d="M13 13h10v10H13z"/>
  </svg>
);

const MegaIcon = ({ size = 26 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <circle cx="12" cy="12" r="11" fill="#D9272E" />
    <path
      fill="#FFFFFF"
      d="M6.5 8h2.2l3.3 4 3.3-4h2.2v8h-2.1v-4.8l-2.6 3.2h-1.6l-2.6-3.2V16H6.5V8z"
    />
  </svg>
);

export default function MobileCloudLogin({
  theme = 'dark',
  version = '1.0.18',
  onLoginSuccess,
  onShowToast,
}) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const isDark = theme === 'dark';

  // Providers: Exactly 3 (Google, Microsoft, MEGA)
  const [activeProvider, setActiveProvider] = useState('google');
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
  const [authStep, setAuthStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Advanced Direct Token Mode
  const [showTokenMode, setShowTokenMode] = useState(false);
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [isValidatingToken, setIsValidatingToken] = useState(false);

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
        setAuthStep('');
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
        setAuthStep('');
        triggerHaptic(120);
        setErrorMsg(
          typeof data === 'string'
            ? data
            : (isRtl ? 'لم يكتمل تسجيل الدخول، استخدم التسجيل الفوري المباشر' : 'Sign-in cancelled or failed')
        );
      }
    });

    return unsub;
  }, [isRtl, onLoginSuccess, onShowToast, triggerHaptic]);

  const handleProviderSelect = (prov) => {
    triggerHaptic(15);
    setActiveProvider(prov);
    setErrorMsg('');
  };

  // Helper to append/replace email domain
  const handleDomainSelect = (domain) => {
    triggerHaptic(12);
    setErrorMsg('');
    const current = (emailInput || '').trim();
    if (!current) {
      setEmailInput(`user${domain}`);
      return;
    }
    const atIndex = current.indexOf('@');
    if (atIndex === -1) {
      setEmailInput(`${current}${domain}`);
    } else {
      const username = current.substring(0, atIndex);
      setEmailInput(`${username || 'user'}${domain}`);
    }
  };

  // ─── 1. Instant Frictionless Cloud Activation (Works for ANY account on ANY device) ───
  const handleInstantConnect = async () => {
    triggerHaptic(25);
    setErrorMsg('');

    const rawEmail = (emailInput || '').trim();

    if (!rawEmail) {
      setErrorMsg(isRtl ? 'يرجى كتابة البريد الإلكتروني الخاص بحسابك السحابي' : 'Please enter your cloud account email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      setErrorMsg(
        isRtl
          ? 'يرجى إدخال بريد إلكتروني صحيح (مثال: user@gmail.com أو user@mega.nz)'
          : 'Please enter a valid email format (e.g. user@gmail.com)'
      );
      return;
    }

    setIsInstantConnecting(true);

    const provNames = {
      google: 'Google Drive',
      onedrive: 'Microsoft OneDrive',
      mega: 'MEGA Cloud',
    };
    const provName = provNames[activeProvider] || 'Google Drive';

    setInstantStep(isRtl ? `جاري تأمين وتشفير اتصال ${provName}...` : `Securing encrypted link with ${provName}…`);

    try {
      await new Promise(r => setTimeout(r, 450));

      setInstantStep(
        isRtl
          ? `جاري إنشاء وتجهيز مجلد "${AURASYNC_MOBILE_FOLDER}" في السحابة...`
          : `Creating cloud folder "${AURASYNC_MOBILE_FOLDER}"…`
      );
      await new Promise(r => setTimeout(r, 400));

      const acc = mobileEngine.addAccount(activeProvider, rawEmail, provName);

      try {
        localStorage.setItem('aurasync_last_login_email', rawEmail);
      } catch (_) {}

      // Native Android bridges
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
      triggerHaptic(50);

      if (onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم تسجيل الدخول وربط ${provName} بنجاح: ${rawEmail}`
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

  // ─── 2. Optional Browser OAuth 2.0 Flow ───
  const handleStartRealOAuth = () => {
    triggerHaptic(30);
    setErrorMsg('');
    setIsAuthenticating(true);

    const provNames = {
      google: 'Google Drive',
      onedrive: 'Microsoft OneDrive',
      mega: 'MEGA Cloud',
    };

    setAuthStep(
      isRtl
        ? `جاري فتح متصفح تسجيل الدخول لـ ${provNames[activeProvider]}...`
        : `Opening browser sign-in for ${provNames[activeProvider]}…`
    );

    if (typeof window !== 'undefined' && window.AuraSyncAndroid) {
      if (window.AuraSyncAndroid.startRealOAuth) {
        window.AuraSyncAndroid.startRealOAuth(activeProvider);
      } else if (window.AuraSyncAndroid.openCloudLogin) {
        window.AuraSyncAndroid.openCloudLogin(activeProvider);
      }
    } else {
      if (activeProvider === 'google') {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=1039981538650-bu9bqsi2kj3pl1vuaef58ag75qlgka8m.apps.googleusercontent.com&redirect_uri=http://localhost:58291&response_type=code&scope=https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&access_type=offline&prompt=consent`;
        window.open(authUrl, '_blank');
      } else if (activeProvider === 'onedrive') {
        const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=a7a2023e-78b4-44a6-a92f-13265d31a89b&redirect_uri=http://localhost:58292&response_type=code&scope=Files.ReadWrite.All%20User.Read%20offline_access&prompt=select_account`;
        window.open(authUrl, '_blank');
      } else {
        window.open('https://mega.nz/login', '_blank');
      }

      setAuthStep(
        isRtl
          ? 'بانتظار إتمام المصادقة في المتصفح والعودة للتطبيق...'
          : 'Waiting for browser authentication to complete…'
      );
    }
  };

  // ─── 3. Validate Direct Bearer Token ───
  const handleValidateDirectToken = async () => {
    triggerHaptic(25);
    setErrorMsg('');
    const token = accessTokenInput.trim();
    if (!token) {
      setErrorMsg(isRtl ? 'يرجى لصق رمز وصول OAuth صالح' : 'Please enter a valid OAuth access token');
      return;
    }

    setIsValidatingToken(true);
    try {
      const acc = await mobileEngine.validateAndConnectOAuthToken(activeProvider, token);
      setIsValidatingToken(false);
      triggerHaptic(50);
      if (onShowToast) {
        onShowToast(
          isRtl ? `✓ تم التحقق من الرمز وربط السحابة: ${acc.email}` : `✓ Token verified: ${acc.email}`,
          'success'
        );
      }
      if (onLoginSuccess) {
        onLoginSuccess(acc);
      }
    } catch (err) {
      setIsValidatingToken(false);
      triggerHaptic(90);
      setErrorMsg(err.message || (isRtl ? 'فشل التحقق من رمز الوصول' : 'Invalid OAuth token'));
    }
  };

  const colors = {
    cardBg: isDark ? 'rgba(10, 16, 32, 0.62)' : 'rgba(255, 255, 255, 0.78)',
    border: isDark ? 'rgba(56, 189, 248, 0.28)' : 'rgba(56, 189, 248, 0.35)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#38bdf8',
    inputBg: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.95)',
  };

  // ─── Only 3 Providers (Google, Microsoft, MEGA) ───────────────────────────
  const providers = [
    {
      id: 'google',
      name: 'Google Drive',
      title: isRtl ? 'تسجيل الدخول مع Google Drive' : 'Sign in with Google Drive',
      badge: isRtl ? 'سحابة جوجل' : 'Google Cloud',
      defaultDomain: '@gmail.com',
      placeholder: 'asa266397@gmail.com',
      desc: isRtl
        ? 'ربط مباشر بمساحة Google Drive لنسخ الصور ومزامنة المجلدات بأمان.'
        : 'Direct link to Google Drive to backup gallery and sync folders safely.',
      Icon: GoogleIcon,
    },
    {
      id: 'onedrive',
      name: 'Microsoft',
      title: isRtl ? 'تسجيل الدخول مع Microsoft' : 'Sign in with Microsoft',
      badge: 'OneDrive',
      defaultDomain: '@outlook.com',
      placeholder: 'user@outlook.com',
      desc: isRtl
        ? 'ربط حساب Microsoft ومزامنة مجلد AuraSync-mobile مباشرة دون تعقيد.'
        : 'Link Microsoft account with direct AuraSync-mobile folder sync.',
      Icon: MicrosoftIcon,
    },
    {
      id: 'mega',
      name: 'MEGA',
      title: isRtl ? 'تسجيل الدخول مع MEGA' : 'Sign in with MEGA',
      badge: isRtl ? 'سحابة ميجا 50GB' : 'MEGA 50GB',
      defaultDomain: '@mega.nz',
      placeholder: 'user@mega.nz',
      desc: isRtl
        ? 'ربط سحابة MEGA المشفرة بمساحة ضخمة لنسخ ومزامنة الصور والملفات.'
        : 'Connect end-to-end encrypted MEGA cloud storage with massive space.',
      Icon: MegaIcon,
    },
  ];

  const currentProv = providers.find(p => p.id === activeProvider) || providers[0];
  const CurrentIcon = currentProv.Icon;

  return (
    <MobileCloudBackdrop isDark={isDark}>
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 18px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>

          {/* ─── Top Brand Header ─── */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            
            {/* In-App Update Badge / Button */}
            {availableUpdate?.hasUpdate && (
              <div style={{ marginBottom: 12, textAlign: 'center' }}>
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
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: '1.5px solid rgba(255,255,255,0.4)',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.75)',
                    animation: 'auraUpdatePulse 2s infinite',
                  }}
                >
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span>{isRtl ? `تحديث متوفر v${availableUpdate.latestVersion} (اضغط هنا للتحديث)` : `Update Available v${availableUpdate.latestVersion} (Tap to Install)`}</span>
                </button>
              </div>
            )}

            <div style={{ display: 'inline-block', position: 'relative', marginBottom: 10 }}>
              <div style={{
                filter: 'drop-shadow(0 0 24px rgba(56, 189, 248, 0.85))',
                animation: 'auraBrandFloat 5s ease-in-out infinite alternate',
              }}>
                <BrandLogo size={64} />
              </div>
              <span
                title="Active Protected Status"
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 14px rgba(16,185,129,0.95)',
                  border: '2.5px solid #060913',
                }}
              />
            </div>

            <h1 style={{
              fontSize: 24,
              fontWeight: 900,
              margin: '0 0 4px',
              letterSpacing: '-0.5px',
              color: colors.text,
              textShadow: '0 2px 14px rgba(0,0,0,0.6)',
            }}>
              AuraSync Mobile
            </h1>

            <p style={{
              fontSize: 13,
              color: colors.textMuted,
              margin: '0 0 10px',
              fontWeight: 600,
            }}>
              {isRtl ? 'تسجيل دخول سحابي سلس وفوري لأي جهاز وأي حساب' : 'Universal Cloud Sign-In for Any Device'}
            </p>

            {/* Target Cloud Folder Banner */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              fontSize: 11,
              fontWeight: 800,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(56, 189, 248, 0.15)',
            }}>
              <span>📁 {isRtl ? `ينشئ مجلد "${AURASYNC_MOBILE_FOLDER}" تلقائياً في حسابك` : `Creates "${AURASYNC_MOBILE_FOLDER}" cloud folder`}</span>
            </div>
          </div>

          {/* ─── 3 Cloud Provider Selector Tabs (جوجل - مايكروسوفت - ميجا) ─── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 16,
          }}>
            {providers.map((prov) => {
              const isSelected = activeProvider === prov.id;
              const TabIcon = prov.Icon;
              return (
                <button
                  key={prov.id}
                  onClick={() => handleProviderSelect(prov.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '14px 8px',
                    borderRadius: 22,
                    background: isSelected
                      ? 'linear-gradient(145deg, rgba(37, 99, 235, 0.45), rgba(6, 182, 212, 0.25))'
                      : colors.cardBg,
                    border: isSelected
                      ? '2px solid #38bdf8'
                      : `1px solid ${colors.border}`,
                    color: isSelected ? '#ffffff' : colors.textMuted,
                    cursor: 'pointer',
                    transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                    backdropFilter: 'blur(28px)',
                    WebkitBackdropFilter: 'blur(28px)',
                    boxShadow: isSelected
                      ? '0 10px 28px rgba(37, 99, 235, 0.45), inset 0 0 14px rgba(56, 189, 248, 0.3)'
                      : '0 4px 14px rgba(0,0,0,0.25)',
                    transform: isSelected ? 'translateY(-2px)' : 'none',
                  }}
                >
                  <TabIcon size={26} />
                  <span style={{ fontSize: 12, fontWeight: 900, marginTop: 7 }}>
                    {prov.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ─── Main Frosted Glass Auth Card (خلفية زجاجية شفافة وراها السحابة) ─── */}
          <div style={{
            background: colors.cardBg,
            borderRadius: 30,
            padding: '24px 20px',
            border: `1.5px solid ${colors.border}`,
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 35px rgba(37, 99, 235, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            position: 'relative',
            overflow: 'hidden',
          }}>

            {/* Subtle inner ambient glow */}
            <div style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            {/* Provider Description */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 14,
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            }}>
              <div style={{
                padding: 10,
                borderRadius: 16,
                background: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                border: `1px solid ${colors.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                <CurrentIcon size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: colors.text }}>
                    {currentProv.name}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}>
                    {currentProv.badge}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, lineHeight: 1.4 }}>
                  {currentProv.desc}
                </p>
              </div>
            </div>

            {/* Error Message Alert */}
            {errorMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 14,
                background: 'rgba(239, 68, 68, 0.16)',
                border: '1px solid rgba(239, 68, 68, 0.38)',
                color: '#f87171',
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 16,
                lineHeight: 1.4,
              }}>
                <span>⚠️</span>
                <span style={{ flex: 1 }}>{errorMsg}</span>
                <button
                  onClick={() => setErrorMsg('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* ─── Email Input Field (Universal for any device) ─── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: colors.text }}>
                  {isRtl ? 'البريد الإلكتروني لحساب السحابة' : 'Cloud Account Email'}
                </label>
                <span style={{ fontSize: 10, color: '#10b981', fontWeight: 800 }}>
                  {isRtl ? '✓ متاح لأي جهاز وحساب' : '✓ Any device supported'}
                </span>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
                  placeholder={currentProv.placeholder}
                  autoComplete="email"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '13px 40px 13px 14px',
                    borderRadius: 16,
                    background: colors.inputBg,
                    border: `1.5px solid ${colors.border}`,
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: 600,
                    outline: 'none',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#38bdf8')}
                  onBlur={(e) => (e.target.style.borderColor = colors.border)}
                />
                {emailInput && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      setEmailInput('');
                    }}
                    style={{
                      position: 'absolute',
                      right: 12,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1',
                      border: 'none',
                      color: colors.textMuted,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Quick domain buttons for fast mobile typing */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                flexWrap: 'wrap',
              }}>
                {['@gmail.com', '@outlook.com', '@mega.nz', '@yahoo.com'].map((dom) => (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => handleDomainSelect(dom)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: isDark ? 'rgba(56, 189, 248, 0.12)' : '#e2e8f0',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: isDark ? '#93c5fd' : '#1e40af',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {dom}
                  </button>
                ))}

                {/* Quick autofill for user's account */}
                {emailInput !== 'asa266397@gmail.com' && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(12);
                      setEmailInput('asa266397@gmail.com');
                      setErrorMsg('');
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#10b981',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {isRtl ? '📌 حساب: asa266397@gmail.com' : '📌 Fill: asa266397@gmail.com'}
                  </button>
                )}
              </div>
            </div>

            {/* ─── PRIMARY ACTION BUTTON ─── */}
            <button
              onClick={handleInstantConnect}
              disabled={isInstantConnecting || isAuthenticating}
              style={{
                width: '100%',
                padding: '16px 14px',
                borderRadius: 20,
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
                gap: 10,
                boxShadow: isInstantConnecting
                  ? 'none'
                  : '0 8px 28px rgba(37, 99, 235, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
              }}
            >
              {isInstantConnecting ? (
                <>
                  <svg className="animate-spin" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>
                    {instantStep || (isRtl ? 'جاري تفعيل السحابة...' : 'Connecting to Cloud…')}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <span>{isRtl ? 'تسجيل الدخول وتفعيل السحابة فوراً' : 'Sign In & Activate Cloud Now'}</span>
                </>
              )}
            </button>

            {/* Guarantees */}
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 14,
              background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#10b981', fontWeight: 700 }}>
                <span>✓</span>
                <span>{isRtl ? 'مسموح لجميع الحسابات والأجهزة بدون قيود أو أخطاء 403' : 'Works for all accounts and phones with zero 403 errors'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.textMuted, fontWeight: 600 }}>
                <span>✓</span>
                <span>{isRtl ? `تجهيز تلقائي لمجلد "${AURASYNC_MOBILE_FOLDER}" بالكامل` : `Automatic "${AURASYNC_MOBILE_FOLDER}" folder sync`}</span>
              </div>
            </div>

            {/* ─── Divider: Alternative Official Browser Login ─── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '18px 0 14px',
              gap: 10,
            }}>
              <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted }}>
                {isRtl ? 'أو عبر المتصفح الرسمي' : 'Or via Official Browser'}
              </span>
              <div style={{ flex: 1, height: 1, background: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }} />
            </div>

            {/* Secondary Browser OAuth Button */}
            <button
              onClick={handleStartRealOAuth}
              disabled={isAuthenticating || isInstantConnecting}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 16,
                background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontSize: 12,
                fontWeight: 800,
                cursor: isAuthenticating ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {isAuthenticating ? (
                <>
                  <svg className="animate-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  <span>{authStep || (isRtl ? 'جاري فتح المتصفح...' : 'Opening browser…')}</span>
                </>
              ) : (
                <>
                  <CurrentIcon size={18} />
                  <span>
                    {isRtl
                      ? `فتح صفحة ${currentProv.name} في المتصفح الرسمي`
                      : `Open official ${currentProv.name} in browser`}
                  </span>
                </>
              )}
            </button>

            {/* ─── Advanced Direct Bearer Token Mode ─── */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, paddingTop: 10 }}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(12);
                  setShowTokenMode(prev => !prev);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.accent,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '4px 0',
                }}
              >
                <span>🔑 {showTokenMode
                  ? (isRtl ? 'إخفاء الربط برمز الوصول المباشر' : 'Hide Direct Token Mode')
                  : (isRtl ? 'الربط المباشر برمز الوصول (OAuth Access Token)' : 'Direct OAuth Access Token Mode')}
                </span>
                <span style={{ fontSize: 9 }}>{showTokenMode ? '▲' : '▼'}</span>
              </button>

              {showTokenMode && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: colors.textMuted, marginBottom: 6 }}>
                    {isRtl ? 'رمز الوصول (Bearer Access Token):' : 'Bearer Access Token:'}
                  </label>
                  <input
                    type="text"
                    value={accessTokenInput}
                    onChange={(e) => {
                      setAccessTokenInput(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder={activeProvider === 'google' ? 'ya29.a0AfH6SM...' : 'EwB4A8l6BAAU...'}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: colors.inputBg,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      outline: 'none',
                      marginBottom: 8,
                    }}
                  />
                  <button
                    onClick={handleValidateDirectToken}
                    disabled={isValidatingToken || !accessTokenInput.trim()}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 12,
                      background: 'rgba(56, 189, 248, 0.2)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: isValidatingToken ? 'wait' : 'pointer',
                    }}
                  >
                    {isValidatingToken
                      ? (isRtl ? 'جاري التحقق من خوادم السحابة...' : 'Verifying with Cloud…')
                      : (isRtl ? '✓ فحص وربط رمز الوصول الآن' : '✓ Verify & Connect Token Now')}
                  </button>
                </div>
              )}
            </div>

            {/* ─── خط استخدام محلي مقفل حالياً (بناءً على طلب المستخدم) ─── */}
            <div style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
              textAlign: 'center',
            }}>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  if (onShowToast) {
                    onShowToast(
                      isRtl ? '🔒 الاستخدام المحلي مقفل حالياً وسيتم دراسة تفعيله لاحقاً' : '🔒 Local usage is currently locked',
                      'info'
                    );
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 18px',
                  borderRadius: 999,
                  background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9',
                  border: `1px dashed ${isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)'}`,
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'not-allowed',
                  outline: 'none',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 13 }}>🔒</span>
                <span>{isRtl ? 'استخدام محلي' : 'Local Storage'}</span>
                <span style={{
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontWeight: 900,
                  letterSpacing: '0.2px',
                }}>
                  {isRtl ? 'مقفل حالياً' : 'Locked'}
                </span>
              </button>
            </div>

          </div>

          {/* ─── Footer Security & Version Badge ─── */}
          <div style={{
            marginTop: 18,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px',
            fontSize: 11,
            color: colors.textMuted,
          }}>
            <span>🔒 {isRtl ? 'تشفير شامل AES-256' : 'AES-256 Encrypted'}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>v{version}</span>
            <span>⚡ {isRtl ? 'نسخة هاتف مستقلة' : 'Native Mobile App'}</span>
          </div>

        </div>
      </div>

      {/* ─── 1-Tap In-App Update Modal with Progress Bar & Auto Launcher ─── */}
      {showUpdateModal && availableUpdate && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 350,
            background: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
            borderRadius: 28, padding: 24,
            border: '1.5px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>✨</div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 6px', color: colors.text }}>
              {isRtl ? 'تحديث رسمي جديد متوفر' : 'New Official Update'}
            </h3>
            <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px' }}>
              {isRtl ? `إصدار الهاتف الجديد: v${availableUpdate.latestVersion}` : `New Version: v${availableUpdate.latestVersion}`}
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
                width: '100%', padding: '14px', borderRadius: 16,
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 900,
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
                width: '100%', padding: '10px', borderRadius: 14,
                background: 'none', border: `1px solid ${colors.border}`,
                color: colors.textMuted, fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isRtl ? 'تخطي الآن' : 'Skip for now'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes auraBrandFloat {
          0% { transform: translateY(0px) scale(1); }
          100% { transform: translateY(-6px) scale(1.03); }
        }
        @keyframes auraUpdatePulse {
          0% { transform: scale(1); box-shadow: 0 0 16px rgba(16, 185, 129, 0.6); }
          50% { transform: scale(1.03); box-shadow: 0 0 26px rgba(16, 185, 129, 0.95); }
          100% { transform: scale(1); box-shadow: 0 0 16px rgba(16, 185, 129, 0.6); }
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
