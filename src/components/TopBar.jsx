import React from 'react';
import { RefreshCw, ArrowUp, Search, Sparkles, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

const PAGE_KEYS = {
  dashboard: { title: 'dash.title', subtitle: 'dash.subtitle' },
  folders: { title: 'filesPage.title', subtitle: 'filesPage.subtitle' },
  files: { title: 'filesPage.title', subtitle: 'filesPage.subtitle' },
  accounts: { title: 'accounts.title', subtitle: 'accounts.subtitle' },
  transfers: { title: 'transfers.title', subtitle: 'transfers.subtitle' },
  snapshots: { title: 'snapshots.title', subtitle: 'snapshots.subtitle' },
  archive: { title: 'archivePage.title', subtitle: 'archivePage.subtitle' },
  stats: { title: 'statsPage.title', subtitle: 'statsPage.subtitle' },
  activity: { title: 'activityPage.title', subtitle: 'activityPage.subtitle' },
  cloudweb: { title: 'cloudWeb.title', subtitle: 'cloudWeb.subtitle' },
  protection: { title: 'protection.title', subtitle: 'protection.subtitle' },
  activityHub: { title: 'activityHub.title', subtitle: 'activityHub.subtitle' },
  settings: { title: 'settings.title', subtitle: 'settings.subtitle' }
};

export default function TopBar({
  page,
  stats,
  hasAccounts,
  isSyncing,
  onSyncAll,
  uploadSpeed = 0,
  onOpenSearch,
  updateInfo = null,
  onOpenUpdate = null,
  onOpenDisasterRecovery = null
}) {
  const { t } = useI18n();
  const keys = PAGE_KEYS[page] || PAGE_KEYS.dashboard;

  return (
    <header
      className="shrink-0 flex items-center justify-between gap-4 px-6 py-3.5 glass-bar relative z-10"
      style={{ borderBottom: '1px solid var(--border-color)' }}
    >
      <div className="min-w-0">
        <h1 className="text-[15px] font-extrabold tracking-tight truncate">{t(keys.title)}</h1>
        <p className="text-[11px] dim truncate mt-0.5">{t(keys.subtitle)}</p>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px] font-bold border transition-colors"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)'
            }}
            title={t('search.hint')}
          >
            <Search className="w-3.5 h-3.5" />
            {t('search.hint')}
            <span className="font-mono opacity-60">Ctrl K</span>
          </button>
        )}

        {uploadSpeed > 0 && (
          <span
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold badge-accent"
            title={t('topbar.speedTip')}
          >
            <ArrowUp className="w-3 h-3" strokeWidth={2.6} />
            <span className="font-mono" dir="ltr">
              {formatBytes(uploadSpeed)}/s
            </span>
          </span>
        )}

        {updateInfo?.updateAvailable && onOpenUpdate && (
          <button
            onClick={onOpenUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-all border animate-pulse"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.22) 0%, rgba(59, 130, 246, 0.22) 100%)',
              borderColor: 'rgba(6, 182, 212, 0.6)',
              color: '#38bdf8',
              boxShadow: '0 0 14px rgba(6, 182, 212, 0.25)'
            }}
            title="تحديث جديد متوفر على GitHub — اضغط للتحديث الفوري"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>تحديث متوفر (v{updateInfo.latestVersion})</span>
          </button>
        )}

        {hasAccounts && onOpenDisasterRecovery && (
          <button
            onClick={onOpenDisasterRecovery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10.5px] font-bold border transition-all hover:border-cyan-400 hover:text-cyan-300 bg-surface-flat"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)'
            }}
            title={t('recovery.title')}
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">{t('recovery.btnLaunch')}</span>
          </button>
        )}

        <button
          onClick={onSyncAll}
          disabled={isSyncing || !hasAccounts}
          className="btn btn-primary"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isSyncing ? t('topbar.syncing') : t('topbar.syncNow')}</span>
        </button>
      </div>
    </header>
  );
}
