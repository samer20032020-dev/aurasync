import React from 'react';
import {
  Folder,
  FolderPlus,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Plus,
  FilePlus,
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
  onAddFiles,
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
    <div className="fade-in flex flex-col gap-5 max-w-5xl pb-12">
      {/* Hero status */}
      <section
        className="surface p-6 overflow-hidden relative"
        style={{
          borderRadius: '22px',
          border: `1px solid color-mix(in srgb, ${heroColor} 22%, var(--border-color))`,
          background: `radial-gradient(ellipse at top right, color-mix(in srgb, ${heroColor} 8%, transparent) 0%, var(--bg-surface) 72%)`,
          boxShadow: `0 8px 32px -10px color-mix(in srgb, ${heroColor} 14%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.05)`
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div
            className="w-13 h-13 rounded-2xl grid place-items-center shrink-0 shadow-sm transition-transform duration-300 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, ${heroColor} 22%, transparent) 0%, color-mix(in srgb, ${heroColor} 8%, transparent) 100%)`,
              border: `1px solid color-mix(in srgb, ${heroColor} 30%, transparent)`,
              color: heroColor
            }}
          >
            <HeroIcon className={`w-6 h-6 ${heroSpin ? 'animate-spin' : ''}`} strokeWidth={2.2} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[17px] font-black tracking-tight">{heroTitle}</h2>
              {hasAccounts && (
                <span className={`badge ${isMirror ? 'badge-warning' : 'badge-success'}`}>
                  {isMirror ? t('settings.modeMirrorTitle') : t('settings.modeSafeTitle')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11.5px]">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] font-medium">
                <span className="dim">{t('stats.shortFolders')}</span>
                <Num value={stats.totalFolders || 0} />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] font-medium">
                <span className="dim">{t('stats.shortFiles')}</span>
                <Num value={stats.syncedFiles || 0} />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] font-medium">
                <span className="dim">{t('stats.shortSize')}</span>
                <Num value={formatBytes(stats.totalBytes)} />
              </div>
              {!isMirror && (stats.preservedFiles || 0) > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                  <span>{t('stats.shortPreserved')}</span>
                  <Num value={stats.preservedFiles} />
                </div>
              )}
              {isMirror && (stats.deletedFiles || 0) > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 font-medium">
                  <span>{t('stats.shortDeleted')}</span>
                  <Num value={stats.deletedFiles} />
                </div>
              )}
              {lastScan && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.02] border border-white/[0.05] text-[11px] dim font-medium">
                  <span>{t('folders.lastScanLabel')}</span>
                  <span dir="ltr">{lastScan}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!hasAccounts ? (
              <button onClick={() => onNavigate('accounts')} className="btn btn-primary shadow-md">
                <Cloud className="w-4 h-4" />
                {t('dash.connectCloud')}
                <ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
              </button>
            ) : folders.length > 0 ? (
              <div className="flex items-center gap-2">
                <button onClick={onAddFolder} className="btn btn-outline hover:scale-[1.02] transition-transform">
                  <Plus className="w-4 h-4" />
                  {t('dash.addFolder')}
                </button>
                {onAddFiles && (
                  <button
                    onClick={onAddFiles}
                    className="btn btn-outline hover:scale-[1.02] transition-transform border-sky-500/40 text-sky-400 hover:bg-sky-500/10"
                    title={t('files.addFilesTip')}
                  >
                    <FilePlus className="w-4 h-4 text-sky-400" />
                    <span>{t('files.addFiles')}</span>
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Folders */}
      <section className="surface overflow-hidden flex flex-col" style={{ borderRadius: '22px' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-extrabold tracking-tight">{t('dash.foldersTitle')}</h2>
            <span className="badge badge-accent font-mono text-[10px]">{folders.length}</span>
          </div>
          <button
            onClick={() => onNavigate('files')}
            className="btn btn-ghost h-7 px-2.5 text-[11.5px] accent-text hover:bg-[var(--accent-soft)] transition-colors rounded-lg"
          >
            {t('dash.viewAll')}
            <ArrowUpRight className="w-3.5 h-3.5 rtl:-scale-x-100" />
          </button>
        </div>

        {folders.length === 0 ? (
          <div className="px-6 py-10 text-center flex flex-col items-center justify-center gap-3.5">
            <span className="text-xs dim">{t('dash.noFolders')}</span>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button onClick={onAddFolder} className="btn btn-primary h-8 text-[11.5px]">
                <Plus className="w-3.5 h-3.5" />
                {t('dash.addFirst')}
              </button>
              {onAddFiles && (
                <button
                  onClick={onAddFiles}
                  className="btn h-8 text-[11.5px] border border-sky-500/40 text-sky-400 bg-sky-950/30 hover:bg-sky-500/15"
                >
                  <FilePlus className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t('files.addFiles')}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-1">
            {folders.map((folder) => {
              const isPaused = folder.is_paused === 1;
              const isBusy = syncingFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-3.5 py-3 px-3.5 rounded-xl transition-all duration-200 hover:bg-white/[0.028] group"
                >
                  <div
                    className="w-8 h-8 rounded-xl grid place-items-center shrink-0 transition-colors"
                    style={{
                      background: isPaused ? 'rgba(148, 163, 184, 0.08)' : 'var(--accent-soft)',
                      color: isPaused ? 'var(--text-dim)' : 'var(--accent)'
                    }}
                  >
                    <Folder className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[13px] font-bold truncate group-hover:text-[var(--accent-hover)] transition-colors">
                        {folder.name}
                      </span>
                      <span
                        className="text-[10.5px] font-semibold shrink-0"
                        style={{ color: isPaused ? 'var(--warning)' : 'var(--success)' }}
                      >
                        ● {isPaused ? t('folders.paused') : t('folders.watching')}
                      </span>
                    </div>
                    <div
                      className="text-[11px] dim font-mono truncate mt-0.5"
                      dir="ltr"
                      style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}
                    >
                      {folder.path}
                    </div>
                  </div>
                  <span className="text-[11px] dim shrink-0 hidden sm:block font-mono" dir="ltr">
                    {folder.synced_files || 0} / {folder.total_files || 0}
                  </span>
                  <button
                    onClick={() => onSyncFolder && onSyncFolder(folder.id)}
                    disabled={isPaused || isBusy || !hasAccounts}
                    className="btn btn-ghost btn-icon shrink-0 rounded-lg hover:bg-[var(--accent-soft)]"
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
