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
  PackageX,
  ChevronDown,
  ShieldAlert,
  Zap,
  Leaf,
  ExternalLink,
  CheckCircle2,
  MousePointerClick,
  RotateCcw
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

function Section({ icon: Icon, title, desc, tone = 'accent', badge, children }) {
  const toneColor =
    tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--accent)';

  const header = (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-start gap-3 min-w-0">
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
          <h2 className="text-[13.5px] font-extrabold tracking-tight text-white">{title}</h2>
          {desc ? <p className="text-[11px] dim leading-relaxed mt-0.5">{desc}</p> : null}
        </div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
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
      {value ? (
        <span className="font-mono font-extrabold" dir="ltr">
          {value}
        </span>
      ) : null}
    </span>
  );
}

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
    const elapsed = performance.now() - startRef.current;
    const cur = Math.min(1, elapsed / duration);
    setProgress(cur);
    if (cur >= 1) {
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

// Concurrency scale constants
const CONCURRENCY_STEPS = ['2', '4', '8', '12', '16', '24', '32'];
const CONCURRENCY_META = {
  '2': { label: 'هادئ واقتصادي', badge: '2 ملفات • اقتصادي', tone: 'var(--success)', icon: Leaf, desc: 'استهلاك منخفض للإنترنت وموارد الجهاز — مثالي أثناء التصفح أو الألعاب أو مكالمات الفيديو.' },
  '4': { label: 'متوازن ومستقر', badge: '4 ملفات • موصى به', tone: 'var(--accent)', icon: Zap, desc: 'السرعة القياسية المتوازنة لمعظم سرعات الاتصال المنزلي واستقرار كامل.' },
  '8': { label: 'توربو فائق', badge: '8 ملفات • أقصى سرعة', tone: 'var(--accent)', icon: Rocket, desc: 'تزامن عالي وسريع لرفع وتنزيل دفعات الملفات الكبيرة بسرعة البرق.' },
  '12': { label: 'فايبر جيجابت', badge: '12 ملف • اتصالات فائقة', tone: '#38bdf8', icon: Gauge, desc: 'تزامن مخصص لسرعات الألياف الضوئية العالية (300+ ميجا).' },
  '16': { label: 'سرعة البرق', badge: '16 ملف • اتصالات متقدمة', tone: '#818cf8', icon: Zap, desc: 'تزامن مكثف لرفع عشرات الملفات في أجزاء من الثانية.' },
  '24': { label: 'ألترا توربو (Ultra Turbo)', badge: '24 ملف • استغلال النت 100%', tone: '#f59e0b', icon: Flame, desc: 'استغلال كامل لأقصى سرعة اتصال بالإنترنت، لرفع آلاف الملفات في دقائق معدودة.' },
  '32': { label: 'القوة القصوى الخارقة', badge: '32 ملف متزامن • أقصى طاقة', tone: '#ef4444', icon: Sparkles, desc: 'أقصى طاقة رفع متوازية يدعمها النظام لمزامنة المجلدات العملاقة (40,000+ ملف) بسرعة خارقة.' }
};

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
  appVersion = '1.7.83',
  updateInfo = null,
  isDownloadingUpdate = false,
  updateProgress = null,
  onCheckUpdates = null,
  onStartUpdate = null,
  onOpenDisasterRecovery = null
}) {
  const { t } = useI18n();
  const [excludeDraft, setExcludeDraft] = useState('');
  const [maxSizeDraft, setMaxSizeDraft] = useState('0');
  const [tab, setTab] = useState('sync'); // Default to sync & speed for instant access
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const connectedClouds = providers.filter((p) => p.connected);
  const hasConnectedCloud = connectedClouds.length > 0;

  const [contextMenuEnabled, setContextMenuEnabled] = useState(true);
  const [showExtremeFormat, setShowExtremeFormat] = useState(false);
  const [showCustomPatterns, setShowCustomPatterns] = useState(false);
  const [showAdvancedFolders, setShowAdvancedFolders] = useState(false);

  // Speed slider state
  const rawConcurrency = String(settings.maxConcurrentUploads || '8');
  const currentStepIndex = Math.max(0, CONCURRENCY_STEPS.indexOf(rawConcurrency) >= 0 ? CONCURRENCY_STEPS.indexOf(rawConcurrency) : 2);
  const activeMeta = CONCURRENCY_META[rawConcurrency] || CONCURRENCY_META['8'];

  const handleSliderChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    const chosen = CONCURRENCY_STEPS[idx] || '8';
    onUpdateSetting('maxConcurrentUploads', chosen);
    if (showToast) {
      showToast(`تم ضبط سرعة الرفع: ${CONCURRENCY_META[chosen]?.label} (${chosen} ملفات متزامنة)`, 'info');
    }
  };

  const handleSelectConcurrency = (val) => {
    onUpdateSetting('maxConcurrentUploads', val);
    if (showToast) {
      showToast(`تم ضبط سرعة الرفع: ${CONCURRENCY_META[val]?.label} (${val} ملفات متزامنة)`, 'info');
    }
  };

  const toggleClean = async (folderId, enabled) => {
    if (!window.electronAPI || !window.electronAPI.setFolderCleanMode) return;
    try {
      const res = await window.electronAPI.setFolderCleanMode(folderId, enabled);
      if (res && res.success) {
        showToast?.(
          enabled
            ? t('settings.cleanEnabled')
            : t('settings.cleanDisabled'),
          'success'
        );
      } else {
        showToast?.(t('settings.cleanFailed', { error: res?.error || 'Failed' }), 'error');
      }
    } catch (err) {
      showToast?.(t('settings.cleanFailed', { error: err.message }), 'error');
    }
  };

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
    const active = (excludeDraft || '').split('\n').map((s) => s.trim().toLowerCase());
    return items.every((it) => active.includes(it.toLowerCase()));
  };

  const togglePreset = (pr) => {
    let current = (excludeDraft || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const active = isPresetActive(pr.items);
    if (active) {
      current = current.filter((it) => !pr.items.map((x) => x.toLowerCase()).includes(it.toLowerCase()));
    } else {
      pr.items.forEach((it) => {
        if (!current.map((x) => x.toLowerCase()).includes(it.toLowerCase())) {
          current.push(it);
        }
      });
    }
    const joined = current.join('\n');
    setExcludeDraft(joined);
    onUpdateSetting('excludePatterns', joined);
    if (showToast) {
      showToast(active ? `تم إلغاء استبعاد ${pr.label}` : `تم تفعيل استبعاد ${pr.label}`, 'info');
    }
  };

  const commitExclusions = () => {
    if ((settings.excludePatterns || '') !== excludeDraft) {
      onUpdateSetting('excludePatterns', excludeDraft);
    }
  };

  const commitMaxSize = () => {
    const val = String(maxSizeDraft).trim() || '0';
    if (String(settings.maxFileSizeMB || '0') !== val) {
      onUpdateSetting('maxFileSizeMB', val);
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

  // Manual update checking handler
  const handleTriggerCheckUpdates = async () => {
    if (typeof onCheckUpdates === 'function') {
      setIsCheckingUpdate(true);
      try {
        await onCheckUpdates(true);
      } finally {
        setIsCheckingUpdate(false);
      }
    }
  };

  useEffect(() => {
    // Check for GitHub updates on mount and keep checking periodically while in Settings
    if (typeof onCheckUpdates === 'function') {
      onCheckUpdates(false);
    }
    const updateTimer = setInterval(() => {
      if (typeof onCheckUpdates === 'function') {
        onCheckUpdates(false);
      }
    }, 30000);
    return () => clearInterval(updateTimer);
  }, []);

  const isMirror = settings.syncMode === 'mirror';
  const isExactCopy = String(settings.exactCopyMode || 'false') === 'true';
  const isArchiveVersions = String(settings.archiveInstallerVersions ?? 'true') !== 'false';

  const THEMES = [
    {
      id: 'dark',
      label: t('settings.themeDark'),
      sub: t('settings.themeDarkSub'),
      preview: {
        base: '#12161f',
        side: '#0c0f16',
        line: 'rgba(233,237,244,0.4)',
        soft: 'rgba(233,237,244,0.14)',
        accentColor: '#5b8cff'
      }
    },
    {
      id: 'midnight',
      label: t('settings.themeMidnight'),
      sub: t('settings.themeMidnightSub'),
      preview: {
        base: '#0f131c',
        side: '#080a10',
        line: 'rgba(147,197,253,0.45)',
        soft: 'rgba(147,197,253,0.16)',
        accentColor: '#5ca8f5'
      }
    },
    {
      id: 'light',
      label: t('settings.themeLight'),
      sub: t('settings.themeLightSub'),
      preview: {
        base: '#ffffff',
        side: '#eef2f9',
        line: 'rgba(15,23,42,0.4)',
        soft: 'rgba(15,23,42,0.14)',
        accentColor: '#2563eb'
      }
    }
  ];

  const currentThemeObj = THEMES.find((th) => th.id === settings.theme) || THEMES[0];

  return (
    <div className="fade-in flex flex-col gap-5 max-w-5xl pb-12">
      {/* 1. Header Banner */}
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
                {updateInfo?.updateAvailable && (
                  <button
                    onClick={() => onStartUpdate && onStartUpdate(updateInfo.downloadUrl)}
                    className="badge badge-warning font-extrabold flex items-center gap-1.5 cursor-pointer animate-pulse"
                    title="تحديث متوفر على GitHub"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>تحديث متوفر (v{updateInfo.latestVersion})</span>
                  </button>
                )}
              </div>
              <p className="text-[11.5px] dim mt-1 leading-relaxed">
                {t('settings.subtitle')}
              </p>
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
            <StatusChip icon={Palette} label={currentThemeObj.label} />
          </div>
        </div>
      </section>

      {/* 1-CLICK GITHUB AUTO-UPDATE CARD (مربع صغير داخل الإعدادات مكتوب عليه تحديث) */}
      {updateInfo?.updateAvailable && (
        <div
          className="p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl relative overflow-hidden transition-all animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 16%, transparent) 0%, color-mix(in srgb, var(--accent) 12%, transparent) 100%)',
            border: '1.5px solid var(--warning)',
            boxShadow: '0 8px 24px -6px rgba(245, 158, 11, 0.25)'
          }}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 shadow-md"
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#fff'
              }}
            >
              <Rocket className="w-5 h-5 animate-bounce" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13.5px] font-black text-white">
                  تحديث جديد متاح للبرنامج: v{updateInfo.latestVersion}
                </span>
                <span className="badge badge-warning text-[10px] font-extrabold px-2 py-0.5 animate-pulse">
                  جديد على GitHub
                </span>
                {updateInfo.assetSizeMB && (
                  <span className="text-[10.5px] font-mono font-bold text-amber-300 opacity-90">
                    ({updateInfo.assetSizeMB} MB)
                  </span>
                )}
              </div>
              <p className="text-[11px] dim mt-0.5 leading-relaxed text-slate-300">
                تم نشر إصدار جديد على GitHub يتضمن تحسينات فورية وميزات متطورة. اضغط على زر تحديث ليتم التحديث والتثبيت تلقائياً بالكامل.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isDownloadingUpdate ? (
              <div className="flex flex-col gap-1.5 min-w-[210px]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    جاري التحديث تلقائياً...
                  </span>
                  <span className="font-mono font-black text-amber-300">
                    {updateProgress?.percent || 0}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-800 border border-amber-500/30 p-[1px]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(updateProgress?.percent || 3, 3)}%`,
                      background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)'
                    }}
                  />
                </div>
                {updateProgress?.speedMBs && (
                  <span className="text-[10px] font-mono dim text-end">
                    {updateProgress.transferredMB || '0'} / {updateProgress.totalMB || updateInfo.assetSizeMB || '0'} MB • {updateProgress.speedMBs} MB/s
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onStartUpdate && onStartUpdate(updateInfo.downloadUrl)}
                className="btn font-black text-[12.5px] py-2.5 px-6 shadow-lg cursor-pointer flex items-center gap-2 hover:scale-[1.03] active:scale-[0.97] transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)'
                }}
              >
                <Download className="w-4 h-4" />
                <span>تحديث</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Navigation Tabs */}
      <div className="page-tabs">
        {[
          { id: 'sync', label: t('settings.tabSync') || 'السرعة والمزامنة', icon: Zap },
          { id: 'updates', label: 'التحديثات والنظام', icon: Sparkles },
          { id: 'general', label: t('settings.tabGeneral'), icon: SlidersHorizontal },
          { id: 'clouds', label: t('settings.tabClouds'), icon: Cloud },
          { id: 'advanced', label: t('settings.tabAdvanced'), icon: Wrench }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? 'on' : ''}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {id === 'updates' && updateInfo?.updateAvailable && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block mr-1" />
            )}
          </button>
        ))}
      </div>

      {/* 3. Main Content Sections */}
      <div className="flex flex-col gap-5">
        {/* ============================================================ */}
        {/* TAB: SPEED & SYNC (السرعة والمزامنة) */}
        {/* ============================================================ */}
        {tab === 'sync' && (
          <div className="flex flex-col gap-5">
            {/* 1. MASTER SPEED SLIDER & SPEEDOMETER (Compact Bar replacing 5 giant cards) */}
            <Section
              icon={activeMeta.icon}
              title="قوة وسرعة الرفع المتوازي (Concurrency Speed)"
              desc="تحكم فائق السرعة في عدد الملفات المرفوعة في نفس الثانية لاستغلال أقصى سرعة إنترنت"
              badge={
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border transition-all shadow-sm"
                  style={{
                    color: activeMeta.tone,
                    borderColor: `color-mix(in srgb, ${activeMeta.tone} 40%, transparent)`,
                    background: `color-mix(in srgb, ${activeMeta.tone} 14%, transparent)`
                  }}
                >
                  <activeMeta.icon className="w-3.5 h-3.5 animate-pulse" />
                  <span>{activeMeta.badge}</span>
                </span>
              }
            >
              <div className="flex flex-col gap-4 py-1">
                {/* Visual Speed Slider Track */}
                <div className="flex flex-col gap-2">
                  <div className="relative flex items-center px-1">
                    <input
                      type="range"
                      min="0"
                      max={CONCURRENCY_STEPS.length - 1}
                      step="1"
                      value={currentStepIndex}
                      onChange={handleSliderChange}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer transition-all"
                      style={{
                        background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 35%, #818cf8 65%, #f59e0b 85%, #ef4444 100%)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Step Buttons (Quick Jump) */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    {CONCURRENCY_STEPS.map((stepVal, idx) => {
                      const isSel = idx === currentStepIndex;
                      const stepMeta = CONCURRENCY_META[stepVal];
                      return (
                        <button
                          key={stepVal}
                          type="button"
                          onClick={() => handleSelectConcurrency(stepVal)}
                          className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded-xl transition-all cursor-pointer ${
                            isSel
                              ? 'bg-blue-600/25 border-blue-500 shadow-md scale-105'
                              : 'hover:bg-slate-800/40 border-transparent opacity-75 hover:opacity-100'
                          }`}
                          style={{
                            border: `1.5px solid ${isSel ? stepMeta.tone : 'var(--border-color)'}`
                          }}
                        >
                          <span
                            className="font-mono font-black text-[12px]"
                            style={{ color: isSel ? stepMeta.tone : 'var(--text-main)' }}
                          >
                            {stepVal}
                          </span>
                          <span className="text-[9px] dim hidden sm:inline truncate mt-0.5">
                            {stepVal === '2' ? 'اقتصادي' : stepVal === '4' ? 'متوازن' : stepVal === '8' ? 'توربو' : stepVal === '24' ? 'ألترا' : stepVal === '32' ? 'خارق' : 'ملفات'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Profile Description */}
                <div
                  className="p-3 rounded-xl flex items-center justify-between gap-3 text-[11px] leading-relaxed"
                  style={{
                    background: 'color-mix(in srgb, var(--bg-main) 65%, transparent)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0 animate-ping" style={{ background: activeMeta.tone }} />
                    <span className="font-bold text-white shrink-0">{activeMeta.label}:</span>
                    <span className="dim truncate">{activeMeta.desc}</span>
                  </div>
                  <span className="badge badge-accent shrink-0 font-mono font-extrabold text-[10px]">
                    {rawConcurrency} خيوط متزامنة
                  </span>
                </div>
              </div>
            </Section>

            {/* 2. 1:1 EXACT COPY & SMART INSTALLER ARCHIVE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Exact Copy 1:1 */}
              <div
                className="surface p-4 rounded-2xl flex items-center justify-between gap-3 transition-all"
                style={{
                  border: `1.5px solid ${isExactCopy ? 'var(--accent)' : 'var(--border-color)'}`,
                  background: isExactCopy
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 80%)'
                    : 'var(--bg-surface)'
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12.5px] font-extrabold text-white">الرفع المطابق 1:1</span>
                    <span className={`badge ${isExactCopy ? 'badge-accent' : 'badge-neutral'} text-[10px]`}>
                      {isExactCopy ? 'مفعل' : 'تلقائي'}
                    </span>
                  </div>
                  <p className="text-[11px] dim leading-relaxed">
                    رفع جميع الملفات والمجلدات بالضبط طبق الأصل بما فيها مجلدات البناء (release و dist).
                  </p>
                </div>
                <Toggle
                  value={isExactCopy}
                  onClick={() => onUpdateSetting('exactCopyMode', isExactCopy ? 'false' : 'true')}
                />
              </div>

              {/* Setup Archive */}
              <div
                className="surface p-4 rounded-2xl flex items-center justify-between gap-3 transition-all"
                style={{
                  border: `1.5px solid ${isArchiveVersions ? 'color-mix(in srgb, var(--success) 60%, transparent)' : 'var(--border-color)'}`,
                  background: isArchiveVersions
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 14%, transparent) 0%, transparent 80%)'
                    : 'var(--bg-surface)'
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12.5px] font-extrabold text-white">أرشفة إصدارات التثبيت</span>
                    <span className={`badge ${isArchiveVersions ? 'badge-success' : 'badge-neutral'} text-[10px]`}>
                      {isArchiveVersions ? 'أرشفة تراكمية' : 'استبدال'}
                    </span>
                  </div>
                  <p className="text-[11px] dim leading-relaxed">
                    حفظ كل إصدار جديد من ملفات التثبيت كنسخة مستقلة في السحابة لمنع فقدان النسخ السابقة.
                  </p>
                </div>
                <Toggle
                  value={isArchiveVersions}
                  onClick={() => onUpdateSetting('archiveInstallerVersions', isArchiveVersions ? 'false' : 'true')}
                />
              </div>
            </div>

            {/* 3. SYNC MODE (Safe vs Mirror) */}
            <Section
              icon={ShieldCheck}
              title={t('settings.syncModeTitle')}
              desc={t('settings.syncModeDesc')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => isMirror && onUpdateSetting('syncMode', 'safe')}
                  className="text-start p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden"
                  style={{
                    border: `1.5px solid ${!isMirror ? 'color-mix(in srgb, var(--success) 60%, transparent)' : 'var(--border-color)'}`,
                    background: !isMirror
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--success) 14%, transparent) 0%, transparent 80%)'
                      : 'color-mix(in srgb, var(--bg-main) 65%, transparent)'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-[12.5px] font-extrabold text-white">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      {t('settings.modeSafeTitle')}
                    </span>
                    {!isMirror && (
                      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-emerald-500 shadow-sm">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span className="badge badge-success mb-2">{t('settings.modeSafeBadge')}</span>
                  <p className="text-[11px] muted leading-relaxed">{t('settings.modeSafeDesc')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => !isMirror && onUpdateSetting('syncMode', 'mirror')}
                  className="text-start p-4 rounded-2xl transition-all cursor-pointer relative overflow-hidden"
                  style={{
                    border: `1.5px solid ${isMirror ? 'color-mix(in srgb, var(--warning) 60%, transparent)' : 'var(--border-color)'}`,
                    background: isMirror
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 14%, transparent) 0%, transparent 80%)'
                      : 'color-mix(in srgb, var(--bg-main) 65%, transparent)'
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-[12.5px] font-extrabold text-white">
                      <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                      {t('settings.modeMirrorTitle')}
                    </span>
                    {isMirror && (
                      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-amber-500 shadow-sm">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span className="badge badge-warning mb-2">{t('settings.modeMirrorBadge')}</span>
                  <p className="text-[11px] muted leading-relaxed">{t('settings.modeMirrorDesc')}</p>
                </button>
              </div>
            </Section>

            {/* 4. FAST EXCLUSIONS & FILE SIZE LIMITS */}
            <Section
              icon={Filter}
              title="الاستبعاد السريع والحد الأقصى للملفات"
              desc="استبعاد مجلدات البرمجة والملفات الضخمة غير الضرورية لتوفير المساحة"
            >
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EXCLUSION_PRESETS.map((pr) => {
                    const active = isPresetActive(pr.items);
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => togglePreset(pr)}
                        className={`text-start p-2.5 rounded-xl transition-all cursor-pointer border flex items-center justify-between gap-1.5 ${
                          active ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <span className="text-[11px] font-bold text-white truncate">{pr.label}</span>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${active ? 'bg-blue-600 text-white' : 'border border-slate-700 dim'}`}>
                          {active ? '✓' : '+'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Size Presets */}
                <div className="flex items-center justify-between gap-3 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <span className="text-[11px] font-bold text-white">الحد الأقصى لحجم الملف:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SIZE_PRESETS.map((sz) => {
                      const isSel = String(maxSizeDraft || '0') === sz.val;
                      return (
                        <button
                          key={sz.val}
                          type="button"
                          onClick={() => handleSelectSizePreset(sz.val)}
                          className={`badge cursor-pointer px-2.5 py-1 text-[10.5px] transition-all ${
                            isSel ? 'badge-accent' : 'badge-neutral'
                          }`}
                        >
                          {sz.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: UPDATES & GITHUB (التحديثات والنظام) */}
        {/* ============================================================ */}
        {tab === 'updates' && (
          <div className="flex flex-col gap-5">
            {/* 1-CLICK GITHUB AUTO-UPDATER CARD */}
            <Section
              icon={Rocket}
              title="التحديث التلقائي بنقرة واحدة من GitHub"
              desc="فحص أحدث الإصدارات والميزات من مستودع GitHub وتثبيتها بنقرة واحدة تلقائياً دون أي خطوات يدوية"
              badge={
                updateInfo?.updateAvailable ? (
                  <span className="badge badge-warning font-black animate-pulse">
                    تحديث جديد متوفر
                  </span>
                ) : (
                  <span className="badge badge-success font-black">
                    البرنامج محدث بالكامل
                  </span>
                )
              }
            >
              <div className="flex flex-col gap-4">
                {/* Status Hero Card */}
                <div
                  className="p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                  style={{
                    background: updateInfo?.updateAvailable
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 16%, transparent) 0%, color-mix(in srgb, var(--accent) 12%, transparent) 100%)'
                      : 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                    border: `1.5px solid ${updateInfo?.updateAvailable ? 'var(--warning)' : 'var(--border-color)'}`
                  }}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 shadow-md"
                      style={{
                        background: updateInfo?.updateAvailable ? 'var(--warning)' : 'var(--accent-gradient)',
                        color: updateInfo?.updateAvailable ? '#000' : '#fff'
                      }}
                    >
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-black text-white">
                          {updateInfo?.updateAvailable ? `إصدار جديد متاح: v${updateInfo.latestVersion}` : 'أنت تستخدم أحدث إصدار رسمي'}
                        </span>
                        <span className="badge badge-accent font-mono text-[10px]">
                          v{appVersion}
                        </span>
                      </div>
                      <p className="text-[11px] dim mt-0.5 leading-relaxed">
                        {updateInfo?.updateAvailable
                          ? 'يتضمن هذا الإصدار تحسينات للسرعة وقفل المتصفح الفوري وميزات متطورة.'
                          : 'تطبيقك محصن ومحدث بأحدث قواعد الحماية والمزامنة السحابية.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {updateInfo?.updateAvailable ? (
                      <button
                        type="button"
                        onClick={() => onStartUpdate && onStartUpdate(updateInfo.downloadUrl)}
                        disabled={isDownloadingUpdate}
                        className="btn btn-primary font-extrabold text-[12px] py-2.5 px-4 shadow-lg cursor-pointer flex items-center gap-2"
                      >
                        {isDownloadingUpdate ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>جاري التحميل...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            <span>تحديث تلقائي فوري الآن</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleTriggerCheckUpdates}
                        disabled={isCheckingUpdate}
                        className="btn font-bold text-[11.5px] py-2 px-3.5 flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        <span>{isCheckingUpdate ? 'جاري الفحص...' : 'فحص التحديثات الآن'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Download Meter (if downloading) */}
                {isDownloadingUpdate && updateProgress && (
                  <div
                    className="p-4 rounded-xl flex flex-col gap-2.5"
                    style={{
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      border: '1px solid var(--accent)'
                    }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
                        جاري تحميل حزمة التحديث تلقائياً...
                      </span>
                      <span className="font-mono font-black text-accent text-[13px]">
                        {updateProgress.percent}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${updateProgress.percent}%`,
                          background: 'var(--accent-gradient)'
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] dim font-mono" dir="ltr">
                      <span>{updateProgress.transferredMB} MB / {updateProgress.totalMB} MB</span>
                      <span>{updateProgress.speedMBs} MB/s</span>
                    </div>
                  </div>
                )}

                {/* Release notes preview if available */}
                {updateInfo?.releaseNotes && (
                  <div
                    className="p-3.5 rounded-xl text-[11px] leading-relaxed max-h-40 overflow-y-auto"
                    style={{
                      background: 'color-mix(in srgb, var(--bg-main) 70%, transparent)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      تفاصيل الإصدار الجديد:
                    </div>
                    <div className="whitespace-pre-wrap dim">{updateInfo.releaseNotes}</div>
                  </div>
                )}

                {/* Explorer Context Menu Switch */}
                <div
                  className="p-3.5 rounded-xl flex items-center justify-between gap-3 mt-1"
                  style={{
                    background: 'color-mix(in srgb, var(--bg-main) 50%, transparent)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div className="min-w-0">
                    <span className="text-[12px] font-bold text-white block">
                      قائمة النقر بالزر الأيمن في ويندوز (Windows Context Menu)
                    </span>
                    <span className="text-[10.5px] dim block mt-0.5">
                      إضافة خيارات المزامنة الفورية والحذف المشترك مباشرة داخل مستعرض الملفات.
                    </span>
                  </div>
                  <Toggle
                    value={contextMenuEnabled}
                    onClick={handleToggleContextMenu}
                  />
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: GENERAL & APPEARANCE (عام والمظهر) */}
        {/* ============================================================ */}
        {tab === 'general' && (
          <div className="flex flex-col gap-5">
            {/* Appearance / Theme Picker */}
            <Section icon={Palette} title={t('settings.appearance')} desc="تخصيص المظهر العام والألوان">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {THEMES.map((th) => {
                  const isSel = settings.theme === th.id;
                  return (
                    <button
                      key={th.id}
                      onClick={() => onUpdateSetting('theme', th.id)}
                      className={`theme-card-pick !p-3.5 ${isSel ? 'selected' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="theme-preview shrink-0" style={{ background: th.preview.base, width: 70, height: 45 }}>
                          <div className="tp-side" style={{ background: th.preview.side }} />
                          <div className="tp-body">
                            <div className="tp-line" style={{ width: '75%', background: th.preview.line }} />
                            <div className="tp-line" style={{ width: '46%', background: th.preview.soft }} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 text-start">
                          <span className="text-[12px] font-extrabold block text-white">{th.label}</span>
                          <span className="text-[10px] dim block mt-0.5 truncate">{th.sub}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Language Switcher */}
              <div className="mt-4 pt-3.5 flex items-center justify-between gap-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 dim" />
                  <span className="text-[12px] font-bold text-white">{t('settings.languageTitle')}</span>
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
            </Section>

            {/* System Behavior Toggles */}
            <Section icon={Rocket} title={t('settings.behavior')} desc="إعدادات الإقلاع والتشغيل في الخلفية">
              <div className="flex flex-col">
                {[
                  { icon: Minimize2, title: t('settings.minimizeTitle'), desc: t('settings.minimizeDesc'), key: 'minimizeToTray' },
                  { icon: Rocket, title: t('settings.startOnBootTitle'), desc: t('settings.startOnBootDesc'), key: 'startOnBoot' },
                  { icon: Bell, title: t('settings.notificationsTitle'), desc: t('settings.notificationsDesc'), key: 'notifications' }
                ].map((item) => (
                  <div key={item.key} className="setting-row">
                    <div className="flex items-start gap-3 min-w-0">
                      <item.icon className="w-4 h-4 dim mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-white">{item.title}</div>
                        <div className="text-[10.5px] dim leading-relaxed mt-0.5">{item.desc}</div>
                      </div>
                    </div>
                    <Toggle
                      value={settings[item.key] === 'true'}
                      onClick={() => onUpdateSetting(item.key, settings[item.key] === 'true' ? 'false' : 'true')}
                    />
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: CLOUDS & STORAGE (السحابة والتخزين) */}
        {/* ============================================================ */}
        {tab === 'clouds' && (
          <Section icon={Cloud} title={t('nav.storage')} desc="إدارة السيرفرات السحابية ومساحات التخزين">
            {connectedClouds.length === 0 ? (
              <p className="text-[11.5px] dim leading-relaxed text-center py-6">{t('settings.storageNotConnected')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {connectedClouds.map((p, idx) => {
                  const storage = p.storage;
                  const pct = storage && storage.limit ? Math.min(100, Math.round((storage.usage / storage.limit) * 100)) : null;
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl border"
                      style={{
                        background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                        borderColor: 'var(--border-color)'
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-[12.5px] font-bold text-white">{p.label}</span>
                        <span className="badge badge-success">{t('accounts.connected')}</span>
                      </div>
                      <div className="h-2 w-full rounded-full overflow-hidden bg-slate-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct == null ? 3 : Math.max(pct, 3)}%`,
                            background: pct >= 90 ? 'linear-gradient(90deg, #f87171, #ef4444)' : 'var(--accent-gradient)'
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10.5px] dim font-mono" dir="ltr">
                        <span>{p.user?.email || p.id}</span>
                        {pct != null && <span>{pct}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* ============================================================ */}
        {/* TAB: MAINTENANCE & DANGER ZONE (الصيانة والأمان) */}
        {/* ============================================================ */}
        {tab === 'advanced' && (
          <div className="flex flex-col gap-5">
            <Section icon={RotateCcw} title={t('recovery.title')} tone="accent" desc={t('recovery.subtitle')}>
              <div
                className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border"
                style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(59, 130, 246, 0.08) 100%)',
                  borderColor: 'rgba(6, 182, 212, 0.35)'
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-extrabold text-white block">
                      {t('recovery.heroCardTitle')}
                    </span>
                    <span className="badge badge-accent text-[9.5px]">1-Click</span>
                  </div>
                  <span className="text-[11px] dim block mt-0.5 leading-relaxed">
                    {t('recovery.heroCardDesc')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenDisasterRecovery}
                  disabled={!hasConnectedCloud}
                  className="btn btn-primary font-bold text-[11.5px] shrink-0 flex items-center gap-2 shadow-md shadow-cyan-500/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('recovery.btnLaunch')}</span>
                </button>
              </div>
            </Section>

            <Section icon={Power} title={t('settings.dangerZone')} tone="danger" desc="عمليات الصيانة المتقدمة ومسح السحابة">
              <div className="flex flex-col gap-3">
                {/* Wipe Cloud */}
                <div
                  className="p-4 rounded-xl flex items-center justify-between gap-3"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)'
                  }}
                >
                  <div className="min-w-0">
                    <span className="text-[12.5px] font-extrabold text-white block">{t('settings.wipeTitle')}</span>
                    <span className="text-[11px] dim block mt-0.5">{t('settings.wipeDesc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onWipeCloud}
                    disabled={!hasConnectedCloud}
                    className="btn btn-danger font-bold text-[11.5px] shrink-0"
                    style={{ opacity: hasConnectedCloud ? 1 : 0.5 }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('settings.wipeButton')}
                  </button>
                </div>

                {/* Uninstall / Full Removal */}
                <div
                  className="p-4 rounded-xl flex flex-col gap-2.5"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div>
                    <span className="text-[12px] font-bold text-white block">{t('settings.fullRemovalTitle')}</span>
                    <span className="text-[10.5px] dim block mt-0.5">{t('settings.fullRemovalDesc')}</span>
                  </div>
                  <HoldToRemove
                    onComplete={onUninstallApp}
                    label={t('settings.fullRemovalButton')}
                    holdingLabel={t('settings.fullRemovalHolding')}
                  />
                </div>

                {/* Clear Logs & Quit */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button onClick={onClearLogs} className="btn text-[11.5px]">
                    <ScrollText className="w-3.5 h-3.5" />
                    {t('settings.clearLogs')}
                  </button>
                  <button onClick={onQuitApp} className="btn btn-danger text-[11.5px]">
                    <Power className="w-3.5 h-3.5" />
                    {t('settings.quit')}
                  </button>
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
