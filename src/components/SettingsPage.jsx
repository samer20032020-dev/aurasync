import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ArrowLeftRight,
  Check,
  Languages,
  Filter,
  Bell,
  Power,
  Trash2,
  Minimize2,
  Rocket,
  Palette,
  AlertTriangle,
  CloudOff,
  Cloud,
  Settings2,
  Sparkles,
  HardDrive,
  ScrollText,
  RefreshCw,
  Gauge,
  FolderOpen,
  Download,
  SlidersHorizontal,
  Wrench,
  Flame,
  MousePointerClick,
  PackageX,
  ChevronDown,
  ShieldAlert,
  Zap,
  Leaf
} from 'lucide-react';
import { useI18n } from '../i18n';
import BrandLogo from './BrandLogo';

function Toggle({ value, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={onClick}
      className={`switch ${value ? 'on' : ''}`}
    >
      <span
        className={`switch-knob ${value ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

function Section({ icon: Icon, title, desc, tone = 'accent', children }) {
  const toneColor =
    tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--accent)';

  const header = (
    <div className="flex items-start gap-3 mb-4">
      <div
        className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
        style={{
          background: `color-mix(in srgb, ${toneColor} 14%, transparent)`,
          color: toneColor,
          border: `1px solid color-mix(in srgb, ${toneColor} 26%, transparent)`
        }}
      >
        <Icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-[13.5px] font-extrabold tracking-tight">{title}</h2>
        {desc ? <p className="text-[11px] dim leading-relaxed mt-0.5">{desc}</p> : null}
      </div>
    </div>
  );

  if (tone === 'danger' || tone === 'warning') {
    return (
      <section className="danger-panel">
        {header}
        {children}
      </section>
    );
  }

  return (
    <section className="surface p-5">
      {header}
      {children}
    </section>
  );
}

function StatusChip({ icon: Icon, label, value, color }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold border"
      style={{
        color: color || 'var(--text-muted)',
        borderColor: 'var(--border-color)',
        background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)'
      }}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      {value ? <span className="font-mono font-extrabold" dir="ltr">{value}</span> : null}
    </span>
  );
}

// Danger action that only fires after the user PRESSES AND HOLDS for `duration`
// ms — releasing early cancels it. A moving fill shows the hold progress.
function HoldToRemove({ onComplete, label, holdingLabel, duration = 1600, disabled = false }) {
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  const stop = () => {
    holdingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (!doneRef.current) setProgress(0);
  };

  const tick = () => {
    if (!holdingRef.current) return;
    const p = Math.min(1, (performance.now() - startRef.current) / duration);
    setProgress(p);
    if (p >= 1) {
      holdingRef.current = false;
      doneRef.current = true;
      rafRef.current = null;
      if (typeof onComplete === 'function') onComplete();
      setTimeout(() => { doneRef.current = false; setProgress(0); }, 500);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = (e) => {
    if (disabled) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    holdingRef.current = true;
    doneRef.current = false;
    startRef.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const pct = Math.round(progress * 100);
  const holding = progress > 0 && progress < 1;

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="relative overflow-hidden btn btn-danger font-bold text-[12px] w-full"
      style={{ touchAction: 'none', userSelect: 'none', opacity: disabled ? 0.5 : 1 }}
    >
      <span
        className="absolute inset-y-0"
        style={{
          insetInlineStart: 0,
          width: `${pct}%`,
          background: 'rgba(0, 0, 0, 0.3)',
          transition: pct === 0 ? 'width .25s ease' : 'none'
        }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2 w-full">
        <PackageX className="w-3.5 h-3.5" />
        <span>{holding ? (holdingLabel || label) : label}</span>
        {holding && <span className="text-[10px] font-mono opacity-90">{pct}%</span>}
      </span>
    </button>
  );
}

export default function SettingsPage({
  settings,
  onUpdateSetting,
  onClearLogs,
  onQuitApp,
  onResetApp,
  onUninstallApp,
  onFormatCloud,
  onWipeCloud,
  providers = [],
  folders = [],
  showToast,
  appVersion = '1.7.76'
}) {
  const { t } = useI18n();
  const [excludeDraft, setExcludeDraft] = useState('');
  const [maxSizeDraft, setMaxSizeDraft] = useState('0');
  const [tab, setTab] = useState('general');

  const connectedClouds = providers.filter((p) => p.connected);
  const hasConnectedCloud = connectedClouds.length > 0;

  const [contextMenuEnabled, setContextMenuEnabled] = useState(true);
  const [showExtremeFormat, setShowExtremeFormat] = useState(false);
  const [showCustomPatterns, setShowCustomPatterns] = useState(false);
  const [showAdvancedFolders, setShowAdvancedFolders] = useState(false);

  const EXCLUSION_PRESETS = [
    {
      id: 'dev',
      label: 'ملفات البرمجة والتطوير',
      desc: 'node_modules, .git, dist, build, release',
      items: ['node_modules', '.git', '.vscode', 'dist', 'build', 'release', 'release/**']
    },
    {
      id: 'disks',
      label: 'نسخ الأنظمة والأقراص الضخمة',
      desc: '*.iso, *.vmdk, *.img, *.vdi',
      items: ['*.iso', '*.vmdk', '*.img', '*.vdi']
    },
    {
      id: 'temp',
      label: 'الملفات المؤقتة وسجلات الكاش',
      desc: '*.tmp, *.temp, *.log, *.cache, thumbs.db',
      items: ['*.tmp', '*.temp', '*.log', '*.cache', 'thumbs.db']
    },
    {
      id: 'media',
      label: 'الأرشيفات والميديا الثقيلة',
      desc: '*.zip, *.rar, *.7z, *.tar, *.mkv',
      items: ['*.zip', '*.rar', '*.7z', '*.tar', '*.gz', '*.mkv']
    }
  ];

  const isPresetActive = (items) => {
    const currentLines = (excludeDraft || '')
      .split('\n')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return items.every((it) => currentLines.includes(it.toLowerCase()));
  };

  const togglePreset = (preset) => {
    let lines = (excludeDraft || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const active = isPresetActive(preset.items);
    if (active) {
      const toRemove = new Set(preset.items.map((it) => it.toLowerCase()));
      lines = lines.filter((line) => !toRemove.has(line.toLowerCase()));
    } else {
      const existing = new Set(lines.map((it) => it.toLowerCase()));
      preset.items.forEach((it) => {
        if (!existing.has(it.toLowerCase())) {
          lines.push(it);
        }
      });
    }
    const nextVal = lines.join('\n');
    setExcludeDraft(nextVal);
    onUpdateSetting('excludePatterns', nextVal);
    if (showToast) {
      showToast(active ? `تم إلغاء استبعاد ${preset.label}` : `تم تفعيل استبعاد ${preset.label}`, 'info');
    }
  };

  const SIZE_PRESETS = [
    { val: '0', label: 'بلا حد' },
    { val: '100', label: '100 MB' },
    { val: '500', label: '500 MB' },
    { val: '1024', label: '1 GB' },
    { val: '2048', label: '2 GB' }
  ];

  const handleSelectSizePreset = (val) => {
    setMaxSizeDraft(val);
    onUpdateSetting('maxFileSizeMB', val);
    if (showToast) {
      showToast(val === '0' ? 'تم ضبط الحد: رفع كافة الأحجام بلا قيود' : `تم ضبط الحد الأقصى للملف: ${val >= 1024 ? (val / 1024) + ' GB' : val + ' MB'}`, 'info');
    }
  };

  const SPEED_PROFILES = [
    {
      concurrency: '2',
      icon: Leaf,
      title: 'هادئ وخفيف',
      badge: '2 ملفات • اقتصادي',
      desc: 'استهلاك منخفض للإنترنت وموارد الجهاز — مثالي أثناء التصفح أو الألعاب أو مكالمات الفيديو.'
    },
    {
      concurrency: '4',
      icon: Zap,
      title: 'متوازن',
      badge: '4 ملفات • موصى به',
      desc: 'السرعة القياسية المثالية — أداء سريع واستقرار كامل لمعظم سرعات الاتصال.'
    },
    {
      concurrency: '8',
      icon: Rocket,
      title: 'توربو فائق',
      badge: '8 ملفات • أقصى سرعة',
      desc: 'أقصى تزامن ممكن لرفع وتنزيل دفعات الملفات الكبيرة بسرعة البرق.'
    },
    {
      concurrency: '12',
      icon: Gauge,
      title: 'فايبر جيجابت (500+ ميجا)',
      badge: '12 ملف • اتصالات فائقة',
      desc: 'تزامن عالي جداً مخصص لاتصالات الألياف الضوئية لرفع مئات الملفات دفعة واحدة.'
    },
    {
      concurrency: '24',
      icon: Sparkles,
      title: 'السرعة القصوى الخارقة (Ultra Turbo)',
      badge: '24 ملف • أقصى استغلال للنت',
      desc: 'استغلال 100% من أقصى سرعة رفع وسرعة الإنترنت، مخصص لرفع المجلدات العملاقة (عشرات آلاف الملفات) في دقائق معدودة.'
    }
  ];

  useEffect(() => {
    setExcludeDraft(settings.excludePatterns || '');
    setMaxSizeDraft(settings.maxFileSizeMB || '0');
  }, [settings.excludePatterns, settings.maxFileSizeMB]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getContextMenuStatus) {
      window.electronAPI.getContextMenuStatus().then((st) => {
        if (st) setContextMenuEnabled(!!st.enabled);
      }).catch(() => {});
    }
  }, []);

  const handleToggleContextMenu = async () => {
    const nextVal = !contextMenuEnabled;
    setContextMenuEnabled(nextVal);
    onUpdateSetting('context_menu_enabled', nextVal ? 'true' : 'false');
    if (window.electronAPI && window.electronAPI.toggleContextMenu) {
      try {
        await window.electronAPI.toggleContextMenu(nextVal);
        if (showToast) showToast(nextVal ? 'تم تفعيل قائمة كليك يمين في ويندوز بنجاح' : 'تم تعطيل قائمة كليك يمين في ويندوز', 'info');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Multi-cloud (3-2-1) selection
  const [mirrorFolderId, setMirrorFolderId] = useState('');
  const [mirrorSelection, setMirrorSelection] = useState([]);
  const mirrorFolder = folders.find((f) => String(f.id) === String(mirrorFolderId)) || null;

  useEffect(() => {
    if (!mirrorFolderId && folders.length > 0) {
      setMirrorFolderId(String(folders[0].id));
    }
  }, [folders, mirrorFolderId]);

  useEffect(() => {
    if (!mirrorFolder) return;
    let list = [];
    try { list = JSON.parse(mirrorFolder.mirror_providers || '[]') || []; } catch (_) { list = []; }
    setMirrorSelection(Array.isArray(list) ? list : []);
  }, [mirrorFolderId, folders]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMirror = (id) => {
    setMirrorSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleClean = async (folderId, enabled) => {
    try {
      const res = await window.electronAPI.setFolderCleanMode(folderId, enabled);
      if (res && res.success) {
        if (showToast) showToast(t(enabled ? 'settings.cleanEnabled' : 'settings.cleanDisabled'), 'success');
      } else if (showToast) {
        showToast(t('settings.cleanFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('settings.cleanFailed', { error: err.message }), 'error');
    }
  };

  const toggleReverse = async (folderId, enabled) => {
    try {
      const res = await window.electronAPI.setFolderReverse(folderId, enabled);
      if (res && res.success) {
        if (showToast) showToast(t(enabled ? 'settings.reverseEnabled' : 'settings.reverseDisabled'), 'success');
      } else if (showToast) {
        showToast(t('settings.reverseFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('settings.reverseFailed', { error: err.message }), 'error');
    }
  };

  const saveMirrors = async () => {
    if (!mirrorFolderId || !window.electronAPI?.setFolderMirrors) return;
    try {
      const res = await window.electronAPI.setFolderMirrors(Number(mirrorFolderId), mirrorSelection);
      if (res && res.success) {
        if (showToast) showToast(t('settings.mirrorSaved', { count: res.queued || 0 }), 'success');
      } else if (showToast) {
        showToast(t('settings.mirrorFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('settings.mirrorFailed', { error: err.message }), 'error');
    }
  };

  const isMirror = settings.syncMode === 'mirror';
  const isExactCopy = String(settings.exactCopyMode || 'false') === 'true';
  const isArchiveVersions = String(settings.archiveInstallerVersions ?? 'true') !== 'false';

  const themes = [
    {
      id: 'dark',
      label: t('settings.themeDark'),
      sub: t('settings.themeDarkSub'),
      preview: { base: '#12161f', side: '#0c0f16', line: 'rgba(233,237,244,0.4)', soft: 'rgba(233,237,244,0.14)', accentColor: '#5b8cff' }
    },
    {
      id: 'midnight',
      label: t('settings.themeMidnight'),
      sub: t('settings.themeMidnightSub'),
      preview: { base: '#0f131c', side: '#080a10', line: 'rgba(147,197,253,0.45)', soft: 'rgba(147,197,253,0.16)', accentColor: '#5ca8f5' }
    },
    {
      id: 'light',
      label: t('settings.themeLight'),
      sub: t('settings.themeLightSub'),
      preview: { base: '#ffffff', side: '#eef2f9', line: 'rgba(15,23,42,0.4)', soft: 'rgba(15,23,42,0.14)', accentColor: '#2563eb' }
    }
  ];

  const themeLabel = (themes.find((th) => th.id === settings.theme) || themes[0]).label;

  const commitExclusions = () => {
    if ((settings.excludePatterns || '') !== excludeDraft) {
      onUpdateSetting('excludePatterns', excludeDraft);
    }
  };

  const commitMaxSize = () => {
    const normalized = String(maxSizeDraft).trim() || '0';
    if (String(settings.maxFileSizeMB || '0') !== normalized) {
      onUpdateSetting('maxFileSizeMB', normalized);
    }
  };

  return (
    <div className="fade-in flex flex-col gap-5 max-w-5xl pb-12">
      {/* ---------- Hero: app identity + live status ---------- */}
      <section className="surface p-6 relative overflow-hidden rise-in">
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className="brand-glow" />
              <BrandLogo size={46} className="relative z-10" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[19px] font-black tracking-tight gradient-text">AuraSync</h1>
                <span className="badge badge-accent font-mono">v{appVersion}</span>
              </div>
              <p className="text-[11.5px] dim mt-1 leading-relaxed">{t('settings.subtitle')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <StatusChip
              icon={Cloud}
              label={t('nav.accounts')}
              value={String(connectedClouds.length)}
              color={hasConnectedCloud ? 'var(--success)' : 'var(--text-dim)'}
            />
            <StatusChip
              icon={isMirror ? ArrowLeftRight : ShieldCheck}
              label={isMirror ? t('settings.modeMirrorTitle') : t('settings.modeSafeTitle')}
              color={isMirror ? 'var(--warning)' : 'var(--success)'}
            />
            <StatusChip icon={Palette} label={themeLabel} />
            <StatusChip
              icon={Languages}
              label={settings.language === 'en' ? t('settings.english') : t('settings.arabic')}
            />
          </div>
        </div>
      </section>

      {/* ---------- Calm tabs ---------- */}
      <div className="page-tabs">
        {[
          { id: 'general', label: t('settings.tabGeneral'), icon: SlidersHorizontal },
          { id: 'sync', label: t('settings.tabSync'), icon: RefreshCw },
          { id: 'clouds', label: t('settings.tabClouds'), icon: Cloud },
          { id: 'advanced', label: t('settings.tabAdvanced'), icon: Wrench }
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={tab === id ? 'on' : ''}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ---------- LEFT column (General) ---------- */}
        {tab === 'general' && (
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Behavior */}
          <Section icon={Rocket} title={t('settings.behavior')}>
            <div className="flex flex-col">
              {[
                { icon: Minimize2, title: t('settings.minimizeTitle'), desc: t('settings.minimizeDesc'), key: 'minimizeToTray' },
                { icon: Rocket, title: t('settings.startOnBootTitle'), desc: t('settings.startOnBootDesc'), key: 'startOnBoot' },
                { icon: Bell, title: t('settings.notificationsTitle'), desc: t('settings.notificationsDesc'), key: 'notifications' }
              ].map((row) => (
                <div key={row.key} className="setting-row">
                  <div className="flex items-start gap-3 min-w-0">
                    <row.icon className="w-4 h-4 dim mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold">{row.title}</div>
                      <div className="text-[11px] dim leading-relaxed mt-0.5">{row.desc}</div>
                    </div>
                  </div>
                  <Toggle
                    value={settings[row.key] === 'true'}
                    onClick={() => onUpdateSetting(row.key, settings[row.key] === 'true' ? 'false' : 'true')}
                  />
                </div>
              ))}

              {/* Context menu setting hidden per user preference */}
            </div>
          </Section>

          {/* Updates */}
          <Section
            icon={RefreshCw}
            title={t('settings.updatesTitle')}
            desc={t('settings.updatesDesc')}
          >
            <div
              className="flex items-center gap-3 p-3.5 rounded-xl"
              style={{
                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)'
              }}
            >
              <span
                className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                style={{ background: 'var(--accent-gradient)', color: '#fff' }}
              >
                <RefreshCw className="w-4 h-4" strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <div className="text-[11.5px] font-extrabold" style={{ color: 'var(--accent)' }}>
                  AuraSync-Setup.exe
                </div>
                <div className="text-[10.5px] muted leading-relaxed mt-0.5">
                  شغّله فقط — يتكفّل بالباقي: يكتشف المكان، يغلق النسخة الحالية، يحدّث ويعيد التشغيل.
                </div>
              </div>
            </div>
          </Section>
        </div>
        )}

        {/* ---------- RIGHT column (Sync / Clouds / Advanced / Appearance) ---------- */}
        <div className={`flex flex-col gap-5 ${tab === 'clouds' || tab === 'advanced' || tab === 'sync' ? 'lg:col-span-12' : 'lg:col-span-5'}`}>
          {/* ==================== BALANCED SYNC DASHBOARD ==================== */}
          {tab === 'sync' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Column 1: Protection Mode & Smart Exclusions */}
            <div className="flex flex-col gap-5">
              {/* 1. Sync Mode & Safety */}
              <Section
                icon={ShieldCheck}
                title={t('settings.syncModeTitle')}
                desc={t('settings.syncModeDesc')}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Safe Mode */}
                  <button
                    type="button"
                    onClick={() => !isMirror || onUpdateSetting('syncMode', 'safe')}
                    className="text-start p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden"
                    style={{
                      border: `1.5px solid ${!isMirror ? 'color-mix(in srgb, var(--success) 60%, transparent)' : 'var(--border-color)'}`,
                      background: !isMirror
                        ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 14%, transparent) 0%, transparent 80%)'
                        : 'color-mix(in srgb, var(--bg-main) 65%, transparent)',
                      boxShadow: !isMirror ? '0 14px 34px -20px color-mix(in srgb, var(--success) 70%, transparent)' : 'none'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="flex items-center gap-2 text-[12.5px] font-extrabold">
                        <ShieldCheck className="w-4 h-4" style={{ color: 'var(--success)' }} />
                        {t('settings.modeSafeTitle')}
                      </span>
                      {!isMirror && (
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'var(--success)', boxShadow: '0 4px 12px -4px var(--success)' }}
                        >
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <span className="badge badge-success mb-2">{t('settings.modeSafeBadge')}</span>
                    <p className="text-[11px] muted leading-relaxed mt-1">{t('settings.modeSafeDesc')}</p>
                  </button>

                  {/* Mirror Mode */}
                  <button
                    type="button"
                    onClick={() => isMirror || onUpdateSetting('syncMode', 'mirror')}
                    className="text-start p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden"
                    style={{
                      border: `1.5px solid ${isMirror ? 'color-mix(in srgb, var(--warning) 60%, transparent)' : 'var(--border-color)'}`,
                      background: isMirror
                        ? 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 80%)'
                        : 'color-mix(in srgb, var(--bg-main) 65%, transparent)',
                      boxShadow: isMirror ? '0 14px 34px -20px color-mix(in srgb, var(--warning) 70%, transparent)' : 'none'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="flex items-center gap-2 text-[12.5px] font-extrabold">
                        <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                        {t('settings.modeMirrorTitle')}
                      </span>
                      {isMirror && (
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'var(--warning)', boxShadow: '0 4px 12px -4px var(--warning)' }}
                        >
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <span className="badge badge-warning mb-2">{t('settings.modeMirrorBadge')}</span>
                    <p className="text-[11px] muted leading-relaxed mt-1">{t('settings.modeMirrorDesc')}</p>
                  </button>
                </div>

                {isMirror && (
                  <div
                    className="mt-3 p-3 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed"
                    style={{
                      background: 'var(--warning-soft)',
                      color: 'var(--warning)',
                      border: '1px solid color-mix(in srgb, var(--warning) 26%, transparent)'
                    }}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{t('settings.modeMirrorWarning')}</span>
                  </div>
                )}
              </Section>

              {/* 2. Exact 1:1 Copy & Smart Version Archiving */}
              <Section
                icon={Sparkles}
                title="الرفع المطابق 1:1 وأرشفة الإصدارات"
                desc="التحكم الكامل في رفع كافة ملفات المشاريع بدون استثناءات، وحفظ تاريخ كل إصدار تثبيت تلقائياً"
              >
                <div className="flex flex-col gap-3">
                  {/* Exact Copy Mode Switch */}
                  <div
                    className="p-3.5 rounded-2xl flex items-center justify-between gap-4 transition-all"
                    style={{
                      background: isExactCopy
                        ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 15%, transparent) 0%, transparent 80%)'
                        : 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                      border: `1.5px solid ${isExactCopy ? 'var(--accent)' : 'var(--border-color)'}`
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12.5px] font-extrabold text-white">الرفع المطابق 1:1 (نسخ ولصق بدون استثناءات)</span>
                        <span className={`badge ${isExactCopy ? 'badge-accent' : 'badge-neutral'} text-[10px]`}>
                          {isExactCopy ? 'مفعل — رفع طبق الأصل' : 'افتراضي — فلترة ذكية'}
                        </span>
                      </div>
                      <p className="text-[11px] dim leading-relaxed">
                        رفع جميع الملفات والمجلدات بالضبط كما هي على القرص بما فيها مجلدات البناء والتوزيع (release و dist) دون تجاهل أي ملف.
                      </p>
                    </div>
                    <Toggle
                      value={isExactCopy}
                      onClick={() => onUpdateSetting('exactCopyMode', isExactCopy ? 'false' : 'true')}
                    />
                  </div>

                  {/* Smart Version Archiving Switch */}
                  <div
                    className="p-3.5 rounded-2xl flex items-center justify-between gap-4 transition-all"
                    style={{
                      background: isArchiveVersions
                        ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 14%, transparent) 0%, transparent 80%)'
                        : 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                      border: `1.5px solid ${isArchiveVersions ? 'color-mix(in srgb, var(--success) 60%, transparent)' : 'var(--border-color)'}`
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12.5px] font-extrabold text-white">أرشفة إصدارات التثبيت كنسخ مستقلة (Setup Archive)</span>
                        <span className={`badge ${isArchiveVersions ? 'badge-success' : 'badge-neutral'} text-[10px]`}>
                          {isArchiveVersions ? 'أرشفة تراكمية ذكية' : 'استبدال مباشر'}
                        </span>
                      </div>
                      <p className="text-[11px] dim leading-relaxed">
                        عند تحديث أو رفع أي ملف تثبيت (Setup / Portable / exe) بإصدار جديد في المجلد الرئيسي أو release، يتم حفظ كل إصدار تلقائياً كنسخة مستقلة في السحابة (مثل Setup-v1.7.65.exe) دون الكتابة فوق الإصدارات القديمة.
                      </p>
                    </div>
                    <Toggle
                      value={isArchiveVersions}
                      onClick={() => onUpdateSetting('archiveInstallerVersions', isArchiveVersions ? 'false' : 'true')}
                    />
                  </div>
                </div>
              </Section>

              {/* 2. Smart Exclusions & Size Limits */}
              <Section
                icon={Filter}
                title="الاستبعاد والحدود الذكية"
                desc="استبعاد الملفات غير الضرورية بنقرة واحدة لتوفير مساحة السحابة وتسريع المزامنة"
              >
                <div>
                  <div className="text-[11.5px] font-bold text-white mb-2.5">استبعاد سريع بنقرة واحدة:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {EXCLUSION_PRESETS.map((pr) => {
                      const active = isPresetActive(pr.items);
                      return (
                        <button
                          key={pr.id}
                          type="button"
                          onClick={() => togglePreset(pr)}
                          className="text-start p-3 rounded-xl transition-all cursor-pointer flex flex-col justify-between"
                          style={{
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
                            background: active
                              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                              : 'color-mix(in srgb, var(--bg-main) 60%, transparent)'
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11.5px] font-bold text-white truncate">{pr.label}</span>
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                                active ? 'bg-blue-600 text-white' : 'dim border border-slate-700'
                              }`}
                              style={{ background: active ? 'var(--accent)' : 'transparent' }}
                            >
                              {active ? '✓' : '+'}
                            </span>
                          </div>
                          <div className="text-[10px] dim truncate font-mono mt-0.5" dir="ltr">
                            {pr.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* File size limits */}
                  <div className="mt-4 pt-3.5" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11.5px] font-bold text-white">الحد الأقصى لحجم الملف الواحد:</span>
                      <span className="text-[10px] font-mono dim">
                        {maxSizeDraft === '0' || !maxSizeDraft ? 'بلا حد' : `${maxSizeDraft} MB`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {SIZE_PRESETS.map((sz) => {
                        const isSel = String(maxSizeDraft || '0') === sz.val;
                        return (
                          <button
                            key={sz.val}
                            type="button"
                            onClick={() => handleSelectSizePreset(sz.val)}
                            className={`badge cursor-pointer px-2.5 py-1 text-[11px] transition-all ${
                              isSel ? 'badge-accent' : 'badge-neutral'
                            }`}
                          >
                            {sz.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3 p-2.5 rounded-xl" style={{ background: 'color-mix(in srgb, var(--bg-main) 70%, transparent)', border: '1px solid var(--border-color)' }}>
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-3.5 h-3.5 dim" />
                        <span className="text-[11px] dim">أو أدخل حجماً مخصصاً (MB):</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={maxSizeDraft}
                        onChange={(e) => setMaxSizeDraft(e.target.value)}
                        onBlur={commitMaxSize}
                        dir="ltr"
                        placeholder="0"
                        className="input w-20 text-center font-mono font-bold text-[11.5px] py-1 h-8 shrink-0"
                      />
                    </div>
                  </div>

                  {/* Custom Patterns Accordion */}
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={() => setShowCustomPatterns(!showCustomPatterns)}
                      className="flex items-center justify-between w-full text-start py-1.5 text-[11px] font-bold dim hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-accent" />
                        {showCustomPatterns ? 'إخفاء التخصيص اليدوي' : 'إضافة أو تعديل صيغ استبعاد يدوية مخصصة'}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCustomPatterns ? 'rotate-180' : ''}`} />
                    </button>

                    {showCustomPatterns && (
                      <div className="mt-2.5">
                        <textarea
                          value={excludeDraft}
                          onChange={(e) => setExcludeDraft(e.target.value)}
                          onBlur={commitExclusions}
                          rows={3}
                          dir="ltr"
                          spellCheck={false}
                          placeholder={t('settings.excludePlaceholder')}
                          className="input h-auto py-2 font-mono text-[11px] resize-y w-full"
                        />
                        <div className="text-[10px] dim mt-1">اكتب نمطاً أو امتداداً في كل سطر (مثال: *.bak أو temp_folder).</div>
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            </div>

            {/* Column 2: Speed / Concurrency & Reverse Sync */}
            <div className="flex flex-col gap-5">
              {/* 3. Speed & Performance Profiles */}
              <Section
                icon={Gauge}
                title={t('settings.performanceTitle')}
                desc="التحكم في قوة الرفع والتنزيل وعدد الملفات المتزامنة في نفس اللحظة"
              >
                <div className="flex flex-col gap-2.5">
                  {SPEED_PROFILES.map((prof) => {
                    const isSelected = String(settings.maxConcurrentUploads || '4') === prof.concurrency;
                    const Icon = prof.icon;
                    return (
                      <button
                        key={prof.concurrency}
                        type="button"
                        onClick={() => onUpdateSetting('maxConcurrentUploads', prof.concurrency)}
                        className="text-start p-3.5 rounded-2xl transition-all cursor-pointer relative overflow-hidden"
                        style={{
                          border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-color)'}`,
                          background: isSelected
                            ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 15%, transparent) 0%, transparent 80%)'
                            : 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                          boxShadow: isSelected ? '0 12px 30px -18px var(--accent)' : 'none'
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
                              style={{
                                background: isSelected ? 'var(--accent)' : 'color-mix(in srgb, var(--text-main) 10%, transparent)',
                                color: isSelected ? '#fff' : 'var(--text-muted)'
                              }}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="text-[12.5px] font-extrabold text-white">{prof.title}</span>
                              <span className="badge badge-accent mr-2 text-[10px]">{prof.badge}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'var(--accent)', boxShadow: '0 4px 12px -4px var(--accent)' }}
                            >
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] dim leading-relaxed mt-1 pr-9">{prof.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <span className="text-[11px] dim">تخصيص يدوي لعدد الملفات المتوازية:</span>
                  <div className="segmented shrink-0">
                    {['2', '4', '8', '12', '16', '24', '32'].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onUpdateSetting('maxConcurrentUploads', n)}
                        className={String(settings.maxConcurrentUploads || '8') === n ? 'on' : ''}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              {/* 4. Reverse Sync & Folders */}
              <Section
                icon={Download}
                title={t('settings.reverseTitle')}
                desc={t('settings.reverseDesc')}
              >
                <div className="flex items-center justify-between gap-4 pb-2.5 mb-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <span className="text-[11.5px] font-bold">{t('settings.reverseInterval')}</span>
                  <div className="segmented shrink-0">
                    {[1, 2, 5, 10, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onUpdateSetting('reverseSyncIntervalMin', String(n))}
                        className={String(settings.reverseSyncIntervalMin || '2') === String(n) ? 'on' : ''}
                      >
                        {n} د
                      </button>
                    ))}
                  </div>
                </div>

                {folders.length === 0 ? (
                  <div className="p-3.5 rounded-xl text-center text-[11px] dim" style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', border: '1px dashed var(--border-color)' }}>
                    {t('settings.mirrorNone')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                    {folders.map((f) => (
                      <div key={f.id} className="setting-row !py-2.5 !my-0 rounded-xl px-3" style={{ background: 'color-mix(in srgb, var(--bg-main) 50%, transparent)' }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FolderOpen className="w-4 h-4 dim shrink-0 text-accent" />
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold truncate">{f.name}</div>
                            <div className="text-[10px] dim mt-0.5">
                              {f.reverse_sync === 1 ? t('settings.reverseOn') : t('settings.reverseOff')}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={f.reverse_sync === 1}
                          onClick={() => toggleReverse(f.id, f.reverse_sync !== 1)}
                          className={`switch ${f.reverse_sync === 1 ? 'on' : ''}`}
                        >
                          <span
                            className={`switch-knob ${f.reverse_sync === 1 ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Advanced Folder Options (Clean Mode & Multi-Cloud 3-2-1) */}
                <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFolders(!showAdvancedFolders)}
                    className="flex items-center justify-between w-full text-start py-1.5 text-[11px] font-bold dim hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                      خيارات متقدمة (النسخ المتعدد 3-2-1 • وضع الأحدث فقط)
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedFolders ? 'rotate-180' : ''}`} />
                  </button>

                  {showAdvancedFolders && (
                    <div className="flex flex-col gap-4 mt-3 pt-3" style={{ borderTop: '1px dashed var(--border-color)' }}>
                      {/* Clean Mode (latest-only) */}
                      <div>
                        <div className="text-[11.5px] font-bold mb-1 flex items-center gap-1.5">
                          <Rocket className="w-3.5 h-3.5 text-accent" />
                          {t('settings.cleanTitle')}
                        </div>
                        <p className="text-[10.5px] dim mb-2.5">{t('settings.cleanDesc')}</p>
                        {folders.map((f) => (
                          <div key={f.id} className="setting-row !py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11.5px] font-bold truncate">{f.name}</span>
                              <span className="text-[10px] dim">({f.clean_mirror === 1 ? t('settings.cleanOn') : t('settings.cleanOff')})</span>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={f.clean_mirror === 1}
                              onClick={() => toggleClean(f.id, f.clean_mirror !== 1)}
                              className={`switch ${f.clean_mirror === 1 ? 'on' : ''}`}
                            >
                              <span
                                className={`switch-knob ${f.clean_mirror === 1 ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'}`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Multi-cloud 3-2-1 */}
                      <div className="pt-3" style={{ borderTop: '1px dashed var(--border-color)' }}>
                        <div className="text-[11.5px] font-bold mb-1 flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5 text-accent" />
                          {t('settings.mirrorTitle')}
                        </div>
                        <p className="text-[10.5px] dim mb-2.5">{t('settings.mirrorDesc')}</p>
                        {folders.length === 0 ? (
                          <p className="text-[11px] dim">{t('settings.mirrorNone')}</p>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <select
                                value={mirrorFolderId}
                                onChange={(e) => setMirrorFolderId(e.target.value)}
                                className="input flex-1 text-[11.5px] h-9"
                              >
                                {folders.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                              <button type="button" onClick={saveMirrors} className="btn btn-primary h-9 text-[11px] shrink-0">
                                {t('settings.mirrorSave')}
                              </button>
                            </div>
                            <div>
                              <div className="text-[10.5px] font-bold mb-1.5">{t('settings.mirrorExtra')}</div>
                              {connectedClouds.filter((p) => p.id !== (mirrorFolder?.provider || 'google')).length === 0 ? (
                                <span className="text-[10.5px] dim">{t('settings.mirrorNeedTwo')}</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {connectedClouds
                                    .filter((p) => p.id !== (mirrorFolder?.provider || 'google'))
                                    .map((p) => {
                                      const on = mirrorSelection.includes(p.id);
                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          onClick={() => toggleMirror(p.id)}
                                          className={`badge ${on ? 'badge-accent' : 'badge-neutral'}`}
                                          style={{ cursor: 'pointer', padding: '5px 10px', fontSize: 10.5 }}
                                        >
                                          {on ? '✓ ' : ''}
                                          {p.label}
                                        </button>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>
          </div>
          )}
          {/* Appearance */}
          {tab === 'general' && (
          <Section icon={Palette} title={t('settings.appearance')}>
            <div className="flex flex-col gap-3">
              {themes.map((th) => {
                const selected = settings.theme === th.id;
                return (
                  <button
                    key={th.id}
                    onClick={() => onUpdateSetting('theme', th.id)}
                    className={`theme-card-pick ${selected ? 'selected' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="theme-preview shrink-0"
                        style={{ background: th.preview.base, width: 96 }}
                      >
                        <div className="tp-side" style={{ background: th.preview.side }} />
                        <div className="tp-body">
                          <div className="tp-line" style={{ width: '75%', background: th.preview.line }} />
                          <div className="tp-line" style={{ width: '46%', background: th.preview.soft }} />
                          <div className="tp-line" style={{ width: '60%', background: th.preview.accentColor }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-extrabold">{th.label}</span>
                          {selected && (
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'var(--accent-gradient)', boxShadow: '0 4px 12px -4px var(--accent)' }}
                            >
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] dim mt-1 leading-relaxed">{th.sub}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Language */}
            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Languages className="w-4 h-4 dim shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold">{t('settings.languageTitle')}</div>
                    <div className="text-[10.5px] dim mt-0.5 truncate">{t('settings.languageDesc')}</div>
                  </div>
                </div>
                <div className="segmented shrink-0">
                  {[
                    { id: 'ar', label: t('settings.arabic') },
                    { id: 'en', label: t('settings.english') }
                  ].map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onUpdateSetting('language', l.id)}
                      className={settings.language === l.id ? 'on' : ''}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
          )}

          {/* Cloud status */}
          {tab === 'clouds' && (
          <Section icon={Cloud} title={t('nav.storage')}>
            {connectedClouds.length === 0 ? (
              <p className="text-[11.5px] dim leading-relaxed">{t('settings.storageNotConnected')}</p>
            ) : (
              <div className="flex flex-col">
                {connectedClouds.map((p, i) => {
                  const storage = p.storage;
                  const percent = storage && storage.limit ? Math.min(100, Math.round((storage.usage / storage.limit) * 100)) : null;
                  return (
                    <div key={p.id} className={`py-3 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: 'var(--border-color)' }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-[12px] font-bold truncate">{p.label}</span>
                        <span className="badge badge-success shrink-0">{t('accounts.connected')}</span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: 'color-mix(in srgb, var(--text-main) 8%, transparent)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percent != null ? Math.max(percent, 3) : 3}%`,
                            background: percent >= 90 ? 'linear-gradient(90deg,#f87171,#ef4444)' : 'var(--accent-gradient)'
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] dim font-mono" dir="ltr">
                        <span>{p.user?.email || p.id}</span>
                        {percent != null && <span>{percent}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          )}

          {/* Maintenance / Danger zone */}
          {tab === 'advanced' && (
          <Section
            icon={Power}
            title={t('settings.dangerZone')}
            tone="danger"
          >
            {/* Primary Action 1: Wipe AuraSync from Cloud & App */}
            <div
              className="p-4 rounded-2xl mb-4"
              style={{
                border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                background: 'var(--bg-surface)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[12.5px] font-extrabold block truncate" style={{ color: 'var(--danger)' }}>
                      {t('settings.wipeTitle')}
                    </span>
                    <span className="text-[10.5px] dim block truncate">{t('settings.wipeBadge')}</span>
                  </div>
                </div>
                <span className="badge badge-danger shrink-0">AuraSync</span>
              </div>

              <p className="text-[11.5px] muted leading-relaxed mb-3.5">
                {t('settings.wipeDesc')}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onWipeCloud}
                  disabled={!hasConnectedCloud}
                  className="btn btn-danger font-bold text-[12px]"
                  style={{ opacity: hasConnectedCloud ? 1 : 0.5 }}
                >
                  <Flame className="w-3.5 h-3.5" />
                  {t('settings.wipeButton')}
                </button>
                {!hasConnectedCloud && (
                  <span className="text-[11px] dim">{t('settings.formatCloudNoAccount')}</span>
                )}
              </div>
            </div>

            {/* Action 2: Hidden Protected Extreme Cloud Format (0 GB literally) */}
            <div
              className="p-3.5 rounded-2xl mb-4 transition-all duration-300"
              style={{
                border: '1px dashed color-mix(in srgb, var(--danger) 35%, transparent)',
                background: showExtremeFormat
                  ? 'linear-gradient(135deg, color-mix(in srgb, var(--danger) 10%, transparent) 0%, transparent 70%)'
                  : 'color-mix(in srgb, var(--bg-surface) 60%, transparent)'
              }}
            >
              <button
                type="button"
                onClick={() => setShowExtremeFormat((prev) => !prev)}
                className="w-full flex items-center justify-between text-start cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: 'var(--danger)' }} />
                  <span className="text-[12px] font-bold" style={{ color: 'var(--danger)' }}>
                    {showExtremeFormat
                      ? t('settings.formatHiddenToggleHide')
                      : t('settings.formatHiddenToggleShow')}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 dim shrink-0 transition-transform duration-200 ${
                    showExtremeFormat ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showExtremeFormat && (
                <div className="mt-3.5 pt-3.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CloudOff className="w-4 h-4 shrink-0" style={{ color: 'var(--danger)' }} />
                      <span className="text-[12px] font-extrabold" style={{ color: 'var(--danger)' }}>
                        {t('settings.formatCloudTitle')}
                      </span>
                    </div>
                    <span className="badge badge-danger shrink-0">{t('settings.zeroGbClean')}</span>
                  </div>

                  <p className="text-[11px] muted leading-relaxed mb-3.5">
                    {t('settings.formatCloudDesc')}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={onFormatCloud}
                      disabled={!hasConnectedCloud}
                      className="btn btn-danger font-bold text-[12px]"
                      style={{ opacity: hasConnectedCloud ? 1 : 0.5 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('settings.formatCloudButton')}
                    </button>
                    {!hasConnectedCloud && (
                      <span className="text-[11px] dim">{t('settings.formatCloudNoAccount')}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Uninstall App from Windows (Press & hold safeguard) */}
            <div
              className="p-3.5 rounded-2xl mb-4"
              style={{
                border: '1px solid color-mix(in srgb, var(--border-color) 80%, transparent)',
                background: 'color-mix(in srgb, var(--bg-surface) 40%, transparent)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PackageX className="w-4 h-4 dim shrink-0" />
                  <span className="text-[12px] font-bold">{t('settings.fullRemovalTitle')}</span>
                </div>
                <span className="badge badge-danger shrink-0 text-[10px]">{t('settings.fullRemovalHold')}</span>
              </div>
              <p className="text-[10.5px] dim leading-relaxed mb-3">{t('settings.fullRemovalDesc')}</p>
              <HoldToRemove
                onComplete={onUninstallApp}
                label={t('settings.fullRemovalButton')}
                holdingLabel={t('settings.fullRemovalHolding')}
              />
            </div>

            {/* Logs + Quit */}
            <div className="setting-row !py-3">
              <div className="flex items-start gap-3 min-w-0">
                <ScrollText className="w-4 h-4 dim shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold">{t('activityPage.title')}</div>
                  <p className="text-[11px] dim leading-relaxed mt-1">{t('activityPage.subtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={onClearLogs} className="btn">
                  <Trash2 className="w-4 h-4" />
                  {t('settings.clearLogs')}
                </button>
                <button onClick={onQuitApp} className="btn btn-danger">
                  <Power className="w-4 h-4" />
                  {t('settings.quit')}
                </button>
              </div>
            </div>
          </Section>
          )}

          {/* Footer */}
          {tab === 'advanced' && (
          <div className="flex items-center justify-center gap-2 text-[10.5px] dim pb-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            {t('settings.version', { version: appVersion })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
