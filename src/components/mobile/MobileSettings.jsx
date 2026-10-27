import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

// ─── Smooth iOS-Style Switch Component ───────────────────────────────────────
function IOSSwitch({ checked, onChange, color = '#2563eb', disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        position: 'relative',
        background: checked ? color : 'rgba(148, 163, 184, 0.28)',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.24s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.24s ease',
        boxShadow: checked ? `0 0 10px ${color}55` : 'none',
        flexShrink: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 'calc(100% - 24px)' : 2,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.25)',
          transition: 'left 0.24s cubic-bezier(0.34, 1.45, 0.64, 1)',
        }}
      />
    </button>
  );
}

// ─── Apple-Style Segmented Control ───────────────────────────────────────────
function SegmentedControl({ options, value, onChange, isDark }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.05)',
        borderRadius: 14,
        padding: 3,
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'}`,
        position: 'relative',
      }}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
            style={{
              border: 'none',
              background: isSelected
                ? 'linear-gradient(135deg, #2563eb, #3b82f6)'
                : 'transparent',
              color: isSelected ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
              fontSize: 12,
              fontWeight: isSelected ? 800 : 600,
              padding: '6px 14px',
              borderRadius: 11,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {opt.icon && <span style={{ fontSize: 13 }}>{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Grouped Section Card ────────────────────────────────────────────────────
function SettingsCard({ title, icon, children, isDark }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px 6px',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: isDark ? '#64748b' : '#94a3b8',
          }}
        >
          {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
          <span>{title}</span>
        </div>
      )}
      <div
        style={{
          background: isDark ? 'rgba(18, 24, 38, 0.72)' : '#ffffff',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderRadius: 20,
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(226, 232, 240, 0.85)'}`,
          boxShadow: isDark
            ? '0 4px 20px -2px rgba(0, 0, 0, 0.35)'
            : '0 2px 14px -2px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Individual Setting Row ──────────────────────────────────────────────────
function SettingItem({
  icon,
  iconBg = 'rgba(59, 130, 246, 0.12)',
  iconColor = '#3b82f6',
  title,
  subtitle,
  children,
  onClick,
  last = false,
  isDark,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '13px 16px',
        borderBottom: last
          ? 'none'
          : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(226, 232, 240, 0.7)'}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginInlineEnd: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: `1px solid ${iconColor}25`,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: isDark ? '#f8fafc' : '#0f172a',
              lineHeight: 1.3,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 11,
                color: isDark ? '#94a3b8' : '#64748b',
                marginTop: 2,
                lineHeight: 1.35,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ─── Main MobileSettings Component ───────────────────────────────────────────
export default function MobileSettings({
  version = '1.0.43',
  theme = 'dark',
  language: propLanguage,
  onSetLanguage,
  onToggleTheme,
  onShowToast,
  availableUpdate = null,
  onTriggerUpdate,
  onSignOut,
}) {
  const i18n = useTranslation();
  const currentLang = propLanguage || i18n.language || 'ar';
  const isRtl = currentLang === 'ar';
  const isDark = theme === 'dark';

  const [settings, setSettings] = useState(() => mobileEngine.settings || {});
  const [accounts, setAccounts] = useState(() => mobileEngine.accounts || []);

  // Modals state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinModalError, setPinModalError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Tactile haptic feedback
  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  // Subscribe to live engine updates
  useEffect(() => {
    const unsub = mobileEngine.subscribe((event, data) => {
      if (event === 'accounts_updated') setAccounts(data || []);
      if (event === 'settings_updated') setSettings(data || {});
    });
    return unsub;
  }, []);

  // Language switcher — 100% Guaranteed reactive across context, engine, and DOM
  const handleSelectLanguage = useCallback((newLang) => {
    if (newLang === currentLang) return;
    triggerHaptic(20);

    // 1. Invoke i18n context updater
    if (i18n.setLanguage) {
      i18n.setLanguage(newLang);
    }
    // 2. Invoke prop callback if supplied
    if (onSetLanguage) {
      onSetLanguage(newLang);
    }
    // 3. Save into mobile engine settings & localStorage
    mobileEngine.saveSettings({ language: newLang });

    // 4. Directly update HTML root dir and lang
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('lang', newLang);
        document.documentElement.setAttribute('dir', newLang === 'en' ? 'ltr' : 'rtl');
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('aurasync_language', newLang);
        window.dispatchEvent(new CustomEvent('aurasync_language_changed', { detail: newLang }));
      }
    } catch (_) {}

    // 5. Toast notification
    if (onShowToast) {
      onShowToast(
        newLang === 'ar' ? '✓ تم تحويل الواجهة إلى العربية بنجاح' : '✓ Interface language switched to English',
        'success'
      );
    }
  }, [currentLang, i18n, onSetLanguage, onShowToast, triggerHaptic]);

  // Handle setting toggles (Wi-Fi, Charging, Zero-Deletion, Biometrics)
  const handleToggle = useCallback((key) => {
    triggerHaptic(15);
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    mobileEngine.saveSettings(updated);

    const feedback = {
      deleteFromPhoneKeepsCloud: {
        ar: ['تم تعطيل حماية سحابة الهاتف', '✓ تم تفعيل: ما يُحذف من الهاتف يظل محفوظاً بالسحابة'],
        en: ['Cloud deletion protection disabled', '✓ Enabled: What is deleted from phone stays in cloud'],
      },
      wifiOnly: {
        ar: ['المزامنة مفعلة على كافة الشبكات', '✓ تم تفعيل المزامنة عبر Wi-Fi فقط لتوفير البيانات'],
        en: ['Sync enabled on all networks', '✓ Sync restricted to Wi-Fi only to save data'],
      },
      chargingOnly: {
        ar: ['المزامنة مفعلة في أي وقت', '✓ تم تفعيل المزامنة أثناء الشحن فقط للحفاظ على البطارية'],
        en: ['Sync active anytime', '✓ Sync restricted to charging only to save battery'],
      },
      biometricLock: {
        ar: ['تم تعطيل قفل البصمة', '✓ تم تفعيل قفل البصمة / Face ID بنجاح'],
        en: ['Biometric lock disabled', '✓ Biometric / Face ID lock enabled'],
      },
    };

    if (feedback[key] && onShowToast) {
      const idx = updated[key] ? 1 : 0;
      onShowToast(isRtl ? feedback[key].ar[idx] : feedback[key].en[idx], updated[key] ? 'success' : 'warn');
    }
  }, [settings, isRtl, onShowToast, triggerHaptic]);

  // Save new security PIN
  const handleSavePin = useCallback(() => {
    triggerHaptic(20);
    if (!pinInput || pinInput.length < 4) {
      setPinModalError(isRtl ? 'يجب إدخال 4 أرقام على الأقل' : 'Must enter at least 4 digits');
      return;
    }
    mobileEngine.setSecurityPin(pinInput);
    setSettings((prev) => ({ ...prev, securityPin: pinInput }));
    setShowPinModal(false);
    setPinInput('');
    setPinModalError('');
    if (onShowToast) {
      onShowToast(isRtl ? '✓ تم تحديث وحفظ رمز PIN الجديد بنجاح' : '✓ PIN updated successfully', 'success');
    }
  }, [pinInput, isRtl, onShowToast, triggerHaptic]);

  // Test biometrics
  const handleTestBiometric = useCallback(async () => {
    triggerHaptic(25);
    try {
      const ok = await mobileEngine.authenticateBiometric();
      if (ok === true && onShowToast) {
        onShowToast(isRtl ? '✓ نجح فحص البصمة / Face ID ويعمل 100%!' : '✓ Biometric test passed 100%!', 'success');
      } else if (ok === false && onShowToast) {
        onShowToast(isRtl ? '⚠️ لم يتم التعرف على البصمة' : '⚠️ Biometrics not recognized', 'warn');
      } else if (onShowToast) {
        onShowToast(
          isRtl
            ? `ℹ️ رمز PIN الاحتياطي الحالي هو: ${settings.securityPin || '1234'}`
            : `ℹ️ Current PIN: ${settings.securityPin || '1234'}`,
          'info'
        );
      }
    } catch (e) {
      if (onShowToast) onShowToast(e.message, 'warn');
    }
  }, [isRtl, onShowToast, settings.securityPin, triggerHaptic]);

  // Sign out confirmation
  const handleConfirmSignOut = useCallback(() => {
    triggerHaptic(30);
    setShowLogoutConfirm(false);
    if (onSignOut) {
      onSignOut();
    } else {
      mobileEngine.saveAccounts([]);
      setAccounts([]);
      if (onShowToast) {
        onShowToast(isRtl ? 'تم تسجيل الخروج وفصل الحساب' : 'Signed out successfully', 'info');
      }
    }
  }, [onSignOut, isRtl, onShowToast, triggerHaptic]);

  const activeAccount = accounts[0];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 0 24px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div style={{ padding: '0 4px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2
            style={{
              fontSize: 19,
              fontWeight: 900,
              margin: 0,
              color: isDark ? '#ffffff' : '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            {isRtl ? 'الإعدادات' : 'Settings'}
          </h2>
          <p
            style={{
              fontSize: 12,
              color: isDark ? '#94a3b8' : '#64748b',
              margin: '2px 0 0',
              fontWeight: 500,
            }}
          >
            {isRtl ? 'تخصيص تجربة السحابة وخيارات المزامنة' : 'Preferences & Cloud Sync Options'}
          </p>
        </div>
      </div>

      {/* ── 1. ACTIVE CLOUD ACCOUNT ──────────────────────────────────── */}
      {activeAccount && (
        <SettingsCard isDark={isDark} title={isRtl ? 'الحساب السحابي المتصل' : 'Connected Cloud Account'}>
          <div
            style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              {activeAccount.picture ? (
                <img
                  src={activeAccount.picture}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    border: '2px solid #3b82f6',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: activeAccount.isOffline
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #2563eb, #38bdf8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 18,
                    fontWeight: 900,
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {activeAccount.isOffline ? '📴' : activeAccount.name ? activeAccount.name.charAt(0).toUpperCase() : '☁️'}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: isDark ? '#ffffff' : '#0f172a',
                    }}
                  >
                    {activeAccount.name || activeAccount.label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: '#10b981',
                        display: 'inline-block',
                      }}
                    />
                    {isRtl ? 'متصل' : 'Active'}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: isDark ? '#94a3b8' : '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                    fontFamily: 'monospace',
                  }}
                >
                  {activeAccount.isOffline
                    ? (isRtl ? 'خزنة الهاتف المشفرة محلياً' : 'Encrypted Local Vault')
                    : activeAccount.email || AURASYNC_MOBILE_FOLDER}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                setShowLogoutConfirm(true);
              }}
              style={{
                border: 'none',
                background: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: 11,
                fontWeight: 700,
                padding: '7px 11px',
                borderRadius: 10,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <span>🚪</span>
              <span>{isRtl ? 'تبديل' : 'Switch'}</span>
            </button>
          </div>
        </SettingsCard>
      )}

      {/* ── 2. PREFERENCES (LANGUAGE & THEME) ───────────────────────── */}
      <SettingsCard isDark={isDark} title={isRtl ? 'التفضيلات والمظهر' : 'Preferences & Appearance'}>
        {/* Language Row (The Star Feature — 100% Working) */}
        <SettingItem
          isDark={isDark}
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          }
          iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)'}
          iconColor="#8b5cf6"
          title={isRtl ? 'لغة التطبيق' : 'App Language'}
          subtitle={isRtl ? 'تبديل فوري بين العربية والإنجليزية' : 'Instant Arabic & English switcher'}
        >
          <SegmentedControl
            isDark={isDark}
            value={currentLang}
            onChange={handleSelectLanguage}
            options={[
              { value: 'ar', label: 'العربية', icon: '🇸🇦' },
              { value: 'en', label: 'English', icon: '🇬🇧' },
            ]}
          />
        </SettingItem>

        {/* Theme Row */}
        <SettingItem
          isDark={isDark}
          last
          icon={
            isDark ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )
          }
          iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.12)'}
          iconColor={isDark ? '#38bdf8' : '#f59e0b'}
          title={isRtl ? 'المظهر' : 'Appearance'}
          subtitle={
            isDark
              ? (isRtl ? 'الوضع الليلي النشط' : 'Dark Mode active')
              : (isRtl ? 'الوضع الفاتح النشط' : 'Light Mode active')
          }
        >
          <SegmentedControl
            isDark={isDark}
            value={isDark ? 'dark' : 'light'}
            onChange={(val) => {
              if ((val === 'dark') !== isDark && onToggleTheme) onToggleTheme();
            }}
            options={[
              { value: 'dark', label: isRtl ? 'داكن' : 'Dark', icon: '🌙' },
              { value: 'light', label: isRtl ? 'فاتح' : 'Light', icon: '☀️' },
            ]}
          />
        </SettingItem>
      </SettingsCard>

      {/* ── 3. SYNC & ZERO-DELETION PROTECTION ──────────────────────── */}
      <SettingsCard isDark={isDark} title={isRtl ? 'المزامنة وحماية الملفات' : 'Sync & Safe Retention'}>
        {/* Zero-Deletion Guard */}
        <SettingItem
          isDark={isDark}
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          }
          iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)'}
          iconColor="#10b981"
          title={isRtl ? 'حفظ السحابة عند الحذف' : 'Keep Cloud Copy on Delete'}
          subtitle={isRtl ? 'ما يُحذف من الهاتف يظل محفوظاً في السحابة' : 'Local deletions never touch cloud copies'}
        >
          <IOSSwitch
            checked={Boolean(settings.deleteFromPhoneKeepsCloud)}
            onChange={() => handleToggle('deleteFromPhoneKeepsCloud')}
            color="#10b981"
          />
        </SettingItem>

        {/* Wi-Fi Only Sync */}
        <SettingItem
          isDark={isDark}
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          }
          iconBg={isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)'}
          iconColor="#0284c7"
          title={isRtl ? 'المزامنة عبر Wi-Fi فقط' : 'Sync on Wi-Fi Only'}
          subtitle={isRtl ? 'توفير باقة بيانات الإنترنت للهاتف' : 'Save mobile cellular data'}
        >
          <IOSSwitch
            checked={Boolean(settings.wifiOnly)}
            onChange={() => handleToggle('wifiOnly')}
            color="#0284c7"
          />
        </SettingItem>

        {/* Charging Only Sync */}
        <SettingItem
          isDark={isDark}
          last
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          }
          iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)'}
          iconColor="#f59e0b"
          title={isRtl ? 'المزامنة أثناء الشحن فقط' : 'Sync While Charging Only'}
          subtitle={isRtl ? 'الحفاظ على طاقة وبطارية الهاتف' : 'Preserve device battery health'}
        >
          <IOSSwitch
            checked={Boolean(settings.chargingOnly)}
            onChange={() => handleToggle('chargingOnly')}
            color="#f59e0b"
          />
        </SettingItem>
      </SettingsCard>

      {/* ── 4. SECURITY & BIOMETRIC LOCK ─────────────────────────────── */}
      <SettingsCard isDark={isDark} title={isRtl ? 'الأمان وقفل التطبيق' : 'App Security & Lock'}>
        {/* Biometric / Face ID Lock */}
        <SettingItem
          isDark={isDark}
          last={!settings.biometricLock}
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
          iconBg={isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.1)'}
          iconColor="#a855f7"
          title={isRtl ? 'قفل البصمة أو الوجه' : 'Biometric / Face ID Lock'}
          subtitle={isRtl ? 'طلب البصمة لفتح التطبيق بأمان' : 'Require biometrics to open app'}
        >
          <IOSSwitch
            checked={Boolean(settings.biometricLock)}
            onChange={() => handleToggle('biometricLock')}
            color="#a855f7"
          />
        </SettingItem>

        {/* PIN Configuration and Biometric Testing (Shown when Lock is ON) */}
        {Boolean(settings.biometricLock) && (
          <div
            style={{
              padding: '12px 16px',
              background: isDark ? 'rgba(168, 85, 247, 0.05)' : '#faf5ff',
              borderTop: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.2)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#e9d5ff' : '#6b21a8' }}>
                {isRtl ? 'رمز PIN الاحتياطي' : 'Backup PIN Code'}
              </div>
              <div style={{ fontSize: 11, color: isDark ? '#c084fc' : '#7e22ce', marginTop: 1 }}>
                {isRtl ? 'الرمز الحالي: ••••' : 'Current: ••••'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={handleTestBiometric}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  background: isDark ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.12)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  color: '#a855f7',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? 'فحص البصمة' : 'Test'}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  setShowPinModal(true);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #a855f7, #9333ea)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(168, 85, 247, 0.3)',
                }}
              >
                {isRtl ? 'تعديل الرمز' : 'Edit PIN'}
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* ── 5. ABOUT AURASYNC MOBILE ─────────────────────────────────── */}
      <SettingsCard isDark={isDark} title={isRtl ? 'حول التطبيق' : 'About Application'}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
                fontWeight: 900,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              ☁️
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: isDark ? '#ffffff' : '#0f172a' }}>
                AuraSync Mobile
              </div>
              <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', marginTop: 1 }}>
                {isRtl ? 'نسخة الهاتف المستقلة المعتمدة' : 'Official Standalone Mobile Build'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 8px',
                borderRadius: 8,
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                color: isDark ? '#cbd5e1' : '#475569',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
                fontFamily: 'monospace',
              }}
            >
              v{version}
            </span>

            {availableUpdate?.hasUpdate && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  if (onTriggerUpdate) onTriggerUpdate();
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 9,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)',
                }}
              >
                <span>✨</span>
                <span>{isRtl ? `تحديث v${availableUpdate.latestVersion}` : `Update v${availableUpdate.latestVersion}`}</span>
              </button>
            )}
          </div>
        </div>
      </SettingsCard>

      {/* ── PIN Modification Modal ───────────────────────────────────── */}
      {showPinModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fadeIn 0.18s ease-out',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 320,
              background: isDark ? 'rgba(20, 26, 42, 0.98)' : '#ffffff',
              borderRadius: 24,
              padding: 22,
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(226, 232, 240, 0.9)'}`,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 6 }}>🔐</div>
            <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px', color: isDark ? '#f8fafc' : '#0f172a' }}>
              {isRtl ? 'تعيين رمز PIN احتياطي' : 'Set Backup PIN'}
            </h3>
            <p style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', margin: '0 0 16px' }}>
              {isRtl ? 'أدخل 4 أرقام على الأقل لفتح التطبيق' : 'Enter 4+ digits to unlock app'}
            </p>

            <input
              type="password"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px',
                borderRadius: 14,
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                border: `1px solid ${pinModalError ? '#ef4444' : isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(203, 213, 225, 0.8)'}`,
                color: isDark ? '#f8fafc' : '#0f172a',
                fontSize: 26,
                textAlign: 'center',
                letterSpacing: 8,
                outline: 'none',
                marginBottom: 10,
              }}
            />

            {pinModalError && (
              <div style={{ color: '#ef4444', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
                {pinModalError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setShowPinModal(false);
                  setPinInput('');
                  setPinModalError('');
                }}
                style={{
                  padding: '11px',
                  borderRadius: 12,
                  background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSavePin}
                style={{
                  padding: '11px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(37, 99, 235, 0.35)',
                }}
              >
                {isRtl ? 'حفظ ✓' : 'Save ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sign-Out Confirmation Modal ─────────────────────────────── */}
      {showLogoutConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fadeIn 0.18s ease-out',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 320,
              background: isDark ? 'rgba(20, 26, 42, 0.98)' : '#ffffff',
              borderRadius: 24,
              padding: 22,
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(226, 232, 240, 0.9)'}`,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚪</div>
            <h3 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px', color: isDark ? '#f8fafc' : '#0f172a' }}>
              {isRtl ? 'تسجيل الخروج من السحابة؟' : 'Sign out of cloud?'}
            </h3>
            <p style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', margin: '0 0 20px', lineHeight: 1.45 }}>
              {isRtl
                ? 'سيتم فصل الحساب مؤقتاً. ملفاتك السحابية تظل محفوظة 100% بأمان.'
                : 'Your account will be disconnected. Cloud files remain 100% safe.'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  padding: '11px',
                  borderRadius: 12,
                  background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isRtl ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                style={{
                  padding: '11px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(239, 68, 68, 0.35)',
                }}
              >
                {isRtl ? 'خروج' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
