import React from 'react';
import {
  LayoutDashboard,
  FolderTree,
  ShieldCheck,
  Shield,
  History,
  CloudCog,
  Settings,
  RefreshCw,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sparkles
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes, formatPercent } from '../format';
import BrandLogo from './BrandLogo';

export default function Sidebar({
  activePage,
  onNavigate,
  providers = [],
  stats,
  isSyncing,
  version = '1.7.81',
  updateInfo = null,
  onOpenUpdate = null
}) {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'files', label: t('nav.filesAndFolders') || t('nav.files'), icon: FolderTree },
    { id: 'vault', label: t('nav.vault') || 'حارس المتصفح', icon: Globe },
    { id: 'cloudweb', label: t('nav.cloudWeb'), icon: Globe },
    {
      id: 'protection',
      label: t('nav.protection'),
      icon: ShieldCheck,
      badge: stats?.preservedFiles || 0,
      tone: 'var(--warning)'
    },
    {
      id: 'activity',
      label: t('nav.activityHub'),
      icon: History,
      badge: stats?.failedFiles || 0,
      tone: 'var(--danger)'
    }
  ];

  const connected = providers.filter((p) => p.connected);
  const online = connected.length > 0;
  const primary = connected[0] || null;
  const storageProvider = connected.find((p) => p.storage) || null;
  const storage = storageProvider ? storageProvider.storage : null;
  const percent = storage && storage.limit ? formatPercent(storage.usage, storage.limit) : null;

  return (
    <aside
      className="w-[228px] shrink-0 flex flex-col select-none relative z-20 min-h-0 overflow-y-auto scroll-area"
      style={{
        background: 'var(--bg-sidebar)',
        borderInlineEnd: '1px solid var(--border-color)'
      }}
    >
      {/* Top Header & Brand */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <BrandLogo size={34} />
        <div className="leading-tight min-w-0">
          <div className="text-[14.5px] font-extrabold tracking-tight">AuraSync</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold dim tracking-wide font-mono">
              v{version}
            </span>
          </div>
        </div>
      </div>

      {/* GitHub Update Notification Banner */}
      {updateInfo?.updateAvailable && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onOpenUpdate}
            className="w-full p-2.5 rounded-xl flex items-center gap-2.5 text-start transition-all duration-300 relative overflow-hidden group border"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(59, 130, 246, 0.15) 100%)',
              borderColor: 'rgba(6, 182, 212, 0.45)',
              boxShadow: '0 4px 16px rgba(6, 182, 212, 0.2)'
            }}
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-500/25 text-cyan-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-black text-cyan-200 leading-tight flex items-center gap-1">
                <span>تحديث متوفر!</span>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
              </div>
              <div className="text-[10px] text-cyan-400/80 font-mono truncate mt-0.5">
                v{updateInfo.latestVersion} • اضغط هنا
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Primary Navigation */}
      <nav className="px-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id ||
            (item.id === 'protection' && ['stats', 'snapshots', 'archive'].includes(activePage)) ||
            (item.id === 'activity' && activePage === 'transfers');
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
              <span className="flex-1 truncate text-start">{item.label}</span>
              {item.badge > 0 && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.tone }}
                  title={String(item.badge)}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Middle / Spacer */}
      <div className="flex-1 min-h-[16px]" />

      {/* Cloud Storage & Status */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {storage ? (
          <div className="sidebar-storage-card">
            <div className="flex items-center justify-between text-[11px] mb-2 font-semibold">
              <div className="flex items-center gap-1.5 min-w-0 truncate muted">
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{storageProvider.label}</span>
              </div>
              {percent != null && (
                <span className="font-mono text-[10.5px] font-bold dim" dir="ltr">
                  {percent}%
                </span>
              )}
            </div>

            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-hover)' }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${percent != null ? Math.max(percent, 3) : 3}%`,
                  background: percent >= 90 ? 'var(--danger)' : 'var(--accent)'
                }}
              />
            </div>

            <div className="text-[10px] dim mt-2 font-mono flex items-center justify-between" dir="ltr">
              <span>{formatBytes(storage.usage)}</span>
              {storage.limit && <span className="opacity-70">/ {formatBytes(storage.limit)}</span>}
            </div>
          </div>
        ) : null}

        {/* Live Sync Status indicator */}
        <div className="px-2 py-1 flex items-center gap-2 text-[11px] font-semibold">
          {online ? (
            <>
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin accent-text shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              )}
              <span className={`truncate ${isSyncing ? 'accent-text' : ''}`} style={!isSyncing ? { color: 'var(--success)' } : {}}>
                {isSyncing ? t('topbar.syncing') : t('nav.syncActive')}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--text-dim)' }} />
              <span className="dim truncate">{t('nav.syncPaused')}</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section: Accounts & Settings */}
      <div
        className="px-3 pt-3 pb-3 flex flex-col gap-1"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <button
          onClick={() => onNavigate('accounts')}
          className={`nav-item ${activePage === 'accounts' ? 'active' : ''}`}
          title={t('nav.accounts')}
        >
          {online && primary?.user?.picture ? (
            <img
              src={primary.user.picture}
              alt="avatar"
              className="w-[18px] h-[18px] rounded-full object-cover shrink-0"
            />
          ) : (
            <CloudCog className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
          )}

          <span className="flex-1 truncate text-start">{t('nav.accounts')}</span>

          {online ? (
            <span className="text-[10px] font-semibold dim shrink-0">
              {connected.length > 1 ? `${connected.length}` : primary?.label?.split(' ')[0] || '1'}
            </span>
          ) : (
            <span className="text-[10px] font-semibold dim shrink-0">+</span>
          )}

          {isRtl ? (
            <ChevronLeft className="w-3.5 h-3.5 opacity-40 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0" />
          )}
        </button>

        <button
          onClick={() => onNavigate('settings')}
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
          title={t('nav.settings')}
        >
          <Settings className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
          <span className="flex-1 truncate text-start">{t('nav.settings')}</span>
          {updateInfo?.updateAvailable && (
            <span
              className="badge text-[9.5px] px-2 py-0.5 font-black animate-pulse shrink-0"
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#fff',
                border: 'none',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              تحديث
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
