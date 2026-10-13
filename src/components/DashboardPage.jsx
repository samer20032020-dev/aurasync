import React from 'react';
import {
  Folder,
  FolderPlus,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Plus,
  ArrowUpRight
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';
import RemoteCloudFolders from './RemoteCloudFolders';

function Num({ value }) {
  return (
    <span dir="ltr" className="font-mono font-bold" style={{ color: 'var(--text-main)' }}>
      {value}
    </span>
  );
}

function Sep() {
  return <span className="dim opacity-50">·</span>;
}

export default function DashboardPage({
  providers = [],
  stats,
  folders,
  onNavigate,
  onSyncFolder,
  syncingFolderId,
  onSyncAll,
  isSyncing,
  onAddFolder,
  remoteFolders = [],
  remoteLoading = false,
  onRefreshRemote,
  onLinkRemoteFolder,
  onTrashRemoteFolder,
  showToast
}) {
  const { t } = useI18n();
  const isMirror = stats.syncMode === 'mirror';
  const hasAccounts = providers.some((p) => p.connected);
  const lastScan = folders.reduce(
    (max, f) => (f.last_scanned_at && f.last_scanned_at > max ? f.last_scanned_at : max),
    ''
  );

  let heroTitle = t('dash.heroProtected');
  let HeroIcon = ShieldCheck;
  let heroColor = 'var(--success)';
  let heroSpin = false;

  if (!hasAccounts) {
    heroTitle = t('dash.heroOffline');
    HeroIcon = Cloud;
    heroColor = 'var(--accent)';
  } else if (stats.failedFiles > 0) {
    heroTitle = t('dash.heroAttention', { count: stats.failedFiles });
    HeroIcon = AlertTriangle;
    heroColor = 'var(--warning)';
  } else if (stats.pendingFiles > 0) {
    heroTitle = t('dash.heroSyncing');
    HeroIcon = RefreshCw;
    heroColor = 'var(--accent)';
    heroSpin = true;
  } else if (stats.totalFolders === 0) {
    heroTitle = t('dash.noFolders');
    HeroIcon = FolderPlus;
    heroColor = 'var(--accent)';
  }

  return (
    <div className="fade-in flex flex-col gap-4 max-w-5xl pb-12">
      {/* Hero status */}
      <section className="surface p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div
            className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
            style={{ background: `color-mix(in srgb, ${heroColor} 12%, transparent)`, color: heroColor }}
          >
            <HeroIcon className={`w-5 h-5 ${heroSpin ? 'animate-spin' : ''}`} strokeWidth={2.2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[16px] font-extrabold tracking-tight">{heroTitle}</h2>
              {hasAccounts && (
                <span className={`badge ${isMirror ? 'badge-warning' : 'badge-success'}`}>
                  {isMirror ? t('settings.modeMirrorTitle') : t('settings.modeSafeTitle')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-2.5 text-[11.5px] muted">
              <span>
                {t('stats.shortFolders')} <Num value={stats.totalFolders || 0} />
              </span>
              <Sep />
              <span>
                {t('stats.shortFiles')} <Num value={stats.syncedFiles || 0} />
              </span>
              <Sep />
              <span>
                {t('stats.shortSize')} <Num value={formatBytes(stats.totalBytes)} />
              </span>
              {!isMirror && (stats.preservedFiles || 0) > 0 && (
                <>
                  <Sep />
                  <span style={{ color: 'var(--warning)' }}>
                    {t('stats.shortPreserved')} <Num value={stats.preservedFiles} />
                  </span>
                </>
              )}
              {isMirror && (stats.deletedFiles || 0) > 0 && (
                <>
                  <Sep />
                  <span style={{ color: 'var(--danger)' }}>
                    {t('stats.shortDeleted')} <Num value={stats.deletedFiles} />
                  </span>
                </>
              )}
              {lastScan && (
                <>
                  <Sep />
                  <span className="dim">
                    {t('folders.lastScanLabel')} <span dir="ltr">{lastScan}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!hasAccounts ? (
              <button onClick={() => onNavigate('accounts')} className="btn btn-primary">
                <Cloud className="w-4 h-4" />
                {t('dash.connectCloud')}
                <ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </button>
            ) : folders.length > 0 ? (
              <button onClick={onAddFolder} className="btn btn-outline">
                <Plus className="w-4 h-4" />
                {t('dash.addFolder')}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Folders */}
      <section className="surface overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5">
          <h2 className="text-[13px] font-extrabold">{t('dash.foldersTitle')}</h2>
          <button
            onClick={() => onNavigate('files')}
            className="btn btn-ghost h-7 px-2 text-[11px] accent-text"
          >
            {t('dash.viewAll')}
            <ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
          </button>
        </div>

        {folders.length === 0 ? (
          <div className="px-5 pb-7 pt-1 text-center flex flex-col items-center justify-center gap-3">
            <span className="text-xs dim">{t('dash.noFolders')}</span>
            <button onClick={onAddFolder} className="btn btn-primary h-8 text-[11.5px]">
              <Plus className="w-3.5 h-3.5" />
              {t('dash.addFirst')}
            </button>
          </div>
        ) : (
          <div className="px-5 pb-2">
            {folders.map((folder, i) => {
              const isPaused = folder.is_paused === 1;
              const isBusy = syncingFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-3 py-3"
                  style={{ borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <Folder
                    className="w-[16px] h-[16px] shrink-0"
                    style={{ color: isPaused ? 'var(--text-dim)' : 'var(--accent)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[12.5px] font-bold truncate">{folder.name}</span>
                      <span
                        className="text-[10.5px] font-semibold shrink-0"
                        style={{ color: isPaused ? 'var(--warning)' : 'var(--success)' }}
                      >
                        ● {isPaused ? t('folders.paused') : t('folders.watching')}
                      </span>
                    </div>
                    <div
                      className="text-[10.5px] dim font-mono truncate mt-0.5"
                      dir="ltr"
                      style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}
                    >
                      {folder.path}
                    </div>
                  </div>
                  <span className="text-[10.5px] dim shrink-0 hidden sm:block font-mono" dir="ltr">
                    {folder.synced_files || 0} / {folder.total_files || 0}
                  </span>
                  <button
                    onClick={() => onSyncFolder && onSyncFolder(folder.id)}
                    disabled={isPaused || isBusy || !hasAccounts}
                    className="btn btn-ghost btn-icon shrink-0"
                    title={t('folders.syncTip')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Multi-Device Cloud Folders (Smart Catalog) */}
      {hasAccounts && (
        <RemoteCloudFolders
          remoteFolders={remoteFolders}
          loading={remoteLoading}
          onRefresh={onRefreshRemote}
          onLinkFolder={onLinkRemoteFolder}
          onTrashFolder={onTrashRemoteFolder}
          showToast={showToast}
        />
      )}
    </div>
  );
}
