import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  DownloadCloud,
  RotateCcw,
  Trash2,
  CloudOff,
  FileText,
  Folder,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Play,
  Pause,
  Sparkles,
  HardDrive
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

function formatDate(value) {
  if (!value) return '—';
  const str = String(value);
  const [date, time] = str.split(' ');
  if (!time) return str;
  return `${date} ${time.slice(0, 5)}`;
}

export default function FilesPage({
  folders = [],
  providers = [],
  onAddFolder,
  onRemoveFolder,
  onTogglePause,
  onSyncFolder,
  onOpenInExplorer,
  onReapplyBadge,
  onRestore,
  onRetry,
  onRetryAll,
  syncingFolderId,
  failedCount = 0,
  preservedCount = 0,
  stats,
  showToast
}) {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [flatFiles, setFlatFiles] = useState([]);
  const [flatLoading, setFlatLoading] = useState(false);
  const [treeByFolder, setTreeByFolder] = useState({});
  const [childrenByFolder, setChildrenByFolder] = useState({});
  const [expanded, setExpanded] = useState({});
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [treeLoading, setTreeLoading] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [busyPath, setBusyPath] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [displayedLimits, setDisplayedLimits] = useState({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);

  const isFlat = Boolean(search) || Boolean(statusFilter);
  const folderIds = folders.map((f) => f.id).join(',');

  const providerLabel = (id) => {
    const found = providers.find((p) => p.id === (id || 'google'));
    return found ? found.label : 'Google Drive';
  };

  // ---------- Data fetching ----------

  const fetchFlat = async () => {
    if (!window.electronAPI) return;
    setFlatLoading(true);
    try {
      const data = await window.electronAPI.getFiles({
        search,
        status: statusFilter || null,
        limit: 300
      });
      setFlatFiles(
        (data || []).filter((f) => {
          const n = (f.name || f.relative_path || '').split(/[/\\]/).pop().toLowerCase();
          return n !== 'desktop.ini' && n !== 'thumbs.db' && n !== '.ds_store';
        })
      );
    } catch (e) {
      console.error('Error fetching files:', e);
    } finally {
      setFlatLoading(false);
    }
  };

  const fetchTree = async (silent = false) => {
    if (!window.electronAPI?.getFileTree || folders.length === 0) {
      setTreeByFolder({});
      return;
    }
    if (!silent) setTreeLoading(true);
    try {
      const results = await Promise.all(
        folders.map(async (folder) => [folder.id, await window.electronAPI.getFileTree(folder.id)])
      );
      const map = {};
      for (const [id, entries] of results) {
        map[id] = (entries || []).filter((e) => {
          const n = (e.name || '').toLowerCase();
          return n !== 'desktop.ini' && n !== 'thumbs.db' && n !== '.ds_store';
        });
      }
      setTreeByFolder(map);
    } catch (e) {
      console.error('Error fetching file tree:', e);
    } finally {
      if (!silent) setTreeLoading(false);
    }
  };

  const fetchChildren = async (folderId, relativePath) => {
    if (!window.electronAPI?.getFileChildren) return;
    const key = `${folderId}:${relativePath}`;
    try {
      const entries = await window.electronAPI.getFileChildren(folderId, relativePath);
      const filtered = (entries || []).filter((e) => {
        const n = (e.name || '').toLowerCase();
        return n !== 'desktop.ini' && n !== 'thumbs.db' && n !== '.ds_store';
      });
      setChildrenByFolder((prev) => ({ ...prev, [key]: filtered }));
    } catch (e) {
      console.error('Error fetching children:', e);
    }
  };

  const refreshVisible = async () => {
    if (isFlat) {
      await fetchFlat();
      return;
    }
    await fetchTree(true);
    const openKeys = Object.keys(expanded).filter((k) => expanded[k]);
    for (const key of openKeys) {
      const idx = key.indexOf(':');
      await fetchChildren(Number(key.slice(0, idx)), key.slice(idx + 1));
    }
  };

  // Load tree when folders list changes
  useEffect(() => {
    fetchTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIds]);

  // Load flat search
  useEffect(() => {
    if (!isFlat) return undefined;
    const timer = setTimeout(fetchFlat, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, isFlat]);

  // Live updates
  useEffect(() => {
    if (!window.electronAPI?.onStatsUpdated) return undefined;
    return window.electronAPI.onStatsUpdated(() => setRefreshTick((x) => x + 1));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshVisible();
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // Progress listener
  useEffect(() => {
    if (!window.electronAPI?.onFileProgress) return undefined;
    return window.electronAPI.onFileProgress((data) => {
      if (!data || !data.filePath) return;
      setProgressMap((prev) => ({
        ...prev,
        [data.filePath]: { percent: data.percent || 0, restoring: !!data.restoring }
      }));
    });
  }, []);

  // Bulk operation progress listener (purge & restore)
  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubPurge = window.electronAPI.onPurgeProgress?.((data) => {
      setBulkProgress(data);
    });
    const unsubRestore = window.electronAPI.onRestoreProgress?.((data) => {
      setBulkProgress(data);
    });
    return () => {
      if (unsubPurge) unsubPurge();
      if (unsubRestore) unsubRestore();
    };
  }, []);

  // ---------- Action Handlers ----------

  const handleRestore = async (filePath) => {
    if (!onRestore || busyPath) return;
    setBusyPath(filePath);
    try {
      await onRestore(filePath);
    } finally {
      setBusyPath(null);
      setTimeout(refreshVisible, 800);
    }
  };

  const handleRetry = async (filePath) => {
    if (!onRetry || busyPath) return;
    setBusyPath(filePath);
    try {
      await onRetry(filePath);
    } finally {
      setBusyPath(null);
      setTimeout(refreshVisible, 800);
    }
  };

  const handleRetryAll = async (folderId = null) => {
    if (!onRetryAll || busyPath) return;
    setBusyPath('__all__');
    try {
      await onRetryAll(folderId);
    } finally {
      setBusyPath(null);
      setTimeout(refreshVisible, 800);
    }
  };

  const handleRestoreAllPreserved = async () => {
    if (bulkBusy) return;
    const countToRestore = (statusFilter === 'preserved_on_drive' && flatFiles.length > 0)
      ? flatFiles.length
      : (preservedCount || 0);

    const confirmed = window.confirm(
      t('files.confirmRestoreAll', { count: countToRestore > 0 ? countToRestore : '' })
    );
    if (!confirmed) return;

    setBulkBusy(true);
    setBulkAction('restoring');
    setBulkProgress({ done: 0, total: countToRestore || 1 });

    try {
      if (window.electronAPI?.restoreAllPreserved) {
        const res = await window.electronAPI.restoreAllPreserved();
        if (res && res.success) {
          if (showToast) {
            showToast(t('files.restoreAllSuccess', { count: res.restored ?? countToRestore }), 'success');
          }
        } else {
          const errMsg = res?.error || 'Unknown';
          if (showToast) showToast(t('files.restoreAllFailed', { error: errMsg }), 'error');
        }
      } else {
        const targetList = flatFiles.filter((f) => f.status === 'preserved_on_drive' && f.drive_file_id);
        let count = 0;
        for (const f of targetList) {
          try {
            await handleRestore(f.local_path);
            count++;
          } catch (_) {}
        }
        if (showToast) showToast(t('files.restoreAllSuccess', { count }), 'success');
      }
    } catch (err) {
      if (showToast) showToast(t('files.restoreAllFailed', { error: err.message }), 'error');
    } finally {
      setBulkBusy(false);
      setBulkAction(null);
      setBulkProgress(null);
      setTimeout(refreshVisible, 600);
    }
  };

  const handlePurgeAllPreserved = async () => {
    if (bulkBusy) return;
    const countToPurge = (statusFilter === 'preserved_on_drive' && flatFiles.length > 0)
      ? flatFiles.length
      : (preservedCount || 0);

    const confirmed = window.confirm(
      t('files.confirmPurgeAll', { count: countToPurge > 0 ? countToPurge : '' })
    );
    if (!confirmed) return;

    setBulkBusy(true);
    setBulkAction('purging');
    setBulkProgress({ done: 0, total: countToPurge || 1 });

    try {
      if (window.electronAPI?.purgeAllPreserved) {
        const res = await window.electronAPI.purgeAllPreserved();
        if (res && res.success) {
          if (showToast) {
            showToast(t('files.purgeAllSuccess', { count: res.deleted ?? countToPurge }), 'success');
          }
        } else {
          const errMsg = res?.error || 'Unknown';
          if (showToast) showToast(t('files.purgeAllFailed', { error: errMsg }), 'error');
        }
      }
    } catch (err) {
      if (showToast) showToast(t('files.purgeAllFailed', { error: err.message }), 'error');
    } finally {
      setBulkBusy(false);
      setBulkAction(null);
      setBulkProgress(null);
      setTimeout(refreshVisible, 600);
    }
  };

  const toggleExpand = async (folderId, entry) => {
    const key = `${folderId}:${entry.relativePath}`;
    const isOpen = !!expanded[key];
    setExpanded((prev) => ({ ...prev, [key]: !isOpen }));
    if (!isOpen && !childrenByFolder[key]) {
      await fetchChildren(folderId, entry.relativePath);
    }
  };

  const toggleFolderCollapse = (folderId) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // ---------- Status Badge Component ----------

  const renderStatus = (status) => {
    switch (status) {
      case 'synced':
        return (
          <span className="badge badge-success">
            <CheckCircle2 className="w-3 h-3" />
            {t('files.statusSynced')}
          </span>
        );
      case 'preserved_on_drive':
        return (
          <span className="badge badge-warning">
            <ShieldCheck className="w-3 h-3" />
            {t('files.statusPreserved')}
          </span>
        );
      case 'cloud_missing':
        return (
          <span className="badge badge-warning">
            <CloudOff className="w-3 h-3" />
            {t('files.statusCloudMissing')}
          </span>
        );
      case 'deleted_on_drive':
        return (
          <span className="badge badge-danger">
            <Trash2 className="w-3 h-3" />
            {t('files.statusDeleted')}
          </span>
        );
      case 'removed_before_upload':
        return (
          <span className="badge badge-neutral">
            <Trash2 className="w-3 h-3" />
            {t('files.statusRemovedBeforeUpload')}
          </span>
        );
      case 'syncing':
        return (
          <span className="badge badge-accent">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t('files.statusSyncing')}
          </span>
        );
      case 'failed':
        return (
          <span className="badge badge-danger">
            <AlertTriangle className="w-3 h-3" />
            {t('files.statusFailed')}
          </span>
        );
      default:
        return (
          <span className="badge badge-neutral">
            <Clock className="w-3 h-3" />
            {t('files.statusPending')}
          </span>
        );
    }
  };

  // ---------- Aggregations ----------

  const folderTotals = useMemo(() => {
    const totals = {};
    for (const folder of folders) {
      const entries = treeByFolder[folder.id] || [];
      totals[folder.id] = {
        files: entries.reduce((sum, e) => sum + (e.fileCount || 0), 0),
        size: entries.reduce((sum, e) => sum + (e.totalSize || 0), 0)
      };
    }
    return totals;
  }, [folders, treeByFolder]);

  const grandTotals = useMemo(() => {
    let files = 0;
    let size = 0;
    for (const id of Object.keys(folderTotals)) {
      files += folderTotals[id].files;
      size += folderTotals[id].size;
    }
    return { files, size };
  }, [folderTotals]);

  const resolveEntryPath = (folder, entry) => {
    if (!entry) return '';
    if (entry.localPath) return entry.localPath;
    if (entry.local_path) return entry.local_path;
    if (folder?.path && entry.relativePath) {
      const relNorm = entry.relativePath.replace(/\//g, '\\');
      const rootNorm = folder.path.replace(/[\\/]+$/, '');
      return `${rootNorm}\\${relNorm}`;
    }
    return '';
  };

  const handleDeleteBoth = async (entry, folder = null) => {
    if (!window.electronAPI?.deleteFileBoth) return;
    const targetPath = resolveEntryPath(folder, entry);
    const entryName = entry?.name || entry?.relative_path || targetPath;
    const confirmed = window.confirm(
      t('files.confirmDeleteBoth', { name: entryName })
    );
    if (!confirmed) return;

    if (!targetPath) {
      if (showToast) showToast('Could not resolve file path', 'error');
      return;
    }

    setBusyPath(targetPath);
    try {
      const res = await window.electronAPI.deleteFileBoth(targetPath);
      if (res && res.success) {
        if (showToast) showToast(t('files.deleteBothSuccess', { name: entryName }), 'success');
        refreshVisible();
      } else {
        const errMsg = res?.error || 'Unknown';
        if (showToast) showToast(t('files.deleteBothFailed', { error: errMsg }), 'error');
        else alert(t('files.deleteBothFailed', { error: errMsg }));
      }
    } catch (err) {
      if (showToast) showToast(t('files.deleteBothFailed', { error: err.message }), 'error');
      else alert(t('files.deleteBothFailed', { error: err.message }));
    } finally {
      setBusyPath(null);
    }
  };

  // ---------- Row Actions ----------

  const renderFileActions = (folder, entry) => {
    const fullPath = resolveEntryPath(folder, entry);
    const progress = progressMap[fullPath];
    const isBusy = busyPath === fullPath;
    return (
      <div className="flex items-center gap-1">
        {(entry.status === 'failed' || entry.status === 'cloud_missing') && (
          <button
            onClick={() => handleRetry(fullPath)}
            disabled={isBusy}
            className="btn btn-ghost btn-icon"
            title={entry.status === 'cloud_missing' ? t('files.reuploadToCloudTip') : t('files.retryTip')}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
          </button>
        )}
        {entry.driveFileId && entry.status !== 'cloud_missing' && (
          <button
            onClick={() => handleRestore(fullPath)}
            disabled={isBusy}
            className="btn btn-ghost btn-icon"
            title={t('files.restoreTip')}
          >
            <DownloadCloud className={`w-3.5 h-3.5 ${progress && progress.restoring ? 'animate-pulse' : ''}`} />
          </button>
        )}
        <button
          onClick={() => onOpenInExplorer(fullPath)}
          className="btn btn-ghost btn-icon"
          title={t('files.openTip')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => handleDeleteBoth(entry, folder)}
          disabled={isBusy}
          className="btn btn-ghost btn-icon text-danger hover:bg-danger-soft"
          title={t('files.deleteBothTip')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const renderEntry = (folder, entry, depth) => {
    const key = `${folder.id}:${entry.relativePath}`;
    const isOpen = !!expanded[key];
    const children = childrenByFolder[key];
    const fullPath = resolveEntryPath(folder, entry);
    const progress = !entry.isDir ? progressMap[fullPath] : null;
    const showProgress = !entry.isDir && (entry.status === 'syncing' || (progress && progress.percent < 100));

    return (
      <React.Fragment key={key}>
        <div
          className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-surface-hover)]"
          style={{
            borderTop: '1px solid var(--border-color)',
            paddingInlineStart: `${20 + depth * 22}px`
          }}
        >
          {/* Chevron */}
          <span className="w-5 shrink-0 flex justify-center">
            {entry.isDir ? (
              <button
                onClick={() => toggleExpand(folder.id, entry)}
                className="w-5 h-5 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--border-color)]"
                title={isOpen ? t('files.collapseTip') : t('files.expandTip')}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isOpen ? '' : 'rtl:rotate-90 ltr:-rotate-90'}`}
                  style={{ color: 'var(--text-dim)' }}
                />
              </button>
            ) : (
              <span className="w-1" />
            )}
          </span>

          {/* Icon & Name */}
          <span className="flex items-center gap-2.5 min-w-0 flex-1">
            {entry.isDir ? (
              isOpen ? (
                <FolderOpen className="w-4 h-4 shrink-0 text-cyan-400" />
              ) : (
                <Folder className="w-4 h-4 shrink-0 text-cyan-400" />
              )
            ) : (
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--text-dim)' }} />
            )}
            <span className="text-[12.5px] font-semibold truncate text-slate-200" title={entry.relativePath}>
              {entry.name}
            </span>
          </span>

          {/* Size */}
          <span className="w-[90px] shrink-0 text-[11px] dim font-mono text-end" dir="ltr">
            {entry.totalSize != null ? formatBytes(entry.totalSize) : '—'}
          </span>

          {/* File Count for subdirectories */}
          <span className="w-[92px] shrink-0 text-[11px] dim text-end hidden md:block">
            {entry.isDir ? t('files.filesCount', { count: entry.fileCount }) : '—'}
          </span>

          {/* Date */}
          <span className="w-[130px] shrink-0 text-[10.5px] dim hidden lg:block" dir="ltr" style={{ textAlign: 'start' }}>
            {formatDate(entry.lastUpdated)}
          </span>

          {/* Status */}
          <span className="w-[130px] shrink-0 hidden sm:flex justify-start">
            {renderStatus(entry.status)}
          </span>

          {/* Actions */}
          <span className="w-[104px] shrink-0 flex items-center justify-end">
            {entry.isDir ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDeleteBoth(entry, folder)}
                  className="btn btn-ghost btn-icon text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  title={t('files.deleteBothTip')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onOpenInExplorer && onOpenInExplorer(fullPath)}
                  className="btn btn-ghost btn-icon"
                  title={t('files.openTip')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              renderFileActions(folder, entry)
            )}
          </span>
        </div>

        {/* Live progress */}
        {!entry.isDir && showProgress && (
          <div className="px-4 pb-2" style={{ paddingInlineStart: `${20 + depth * 22 + 42}px` }}>
            <div className="flex items-center gap-2.5 max-w-md">
              <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress ? progress.percent : 0}%`,
                    background: progress && progress.restoring ? 'var(--success)' : 'var(--accent)'
                  }}
                />
              </div>
              <span className="text-[9.5px] font-mono dim shrink-0">
                {progress && progress.restoring
                  ? t('files.restoring', { percent: progress.percent })
                  : `${progress ? progress.percent : 0}%`}
              </span>
            </div>
          </div>
        )}

        {/* Subdirectory children */}
        {entry.isDir && isOpen && (
          children === undefined ? (
            <div className="px-4 py-2.5 text-[11px] dim" style={{ paddingInlineStart: `${20 + (depth + 1) * 22}px` }}>
              <RefreshCw className="w-3 h-3 animate-spin inline" /> {t('files.loading')}
            </div>
          ) : children.length === 0 ? (
            <div className="px-4 py-2.5 text-[11px] dim" style={{ paddingInlineStart: `${20 + (depth + 1) * 22}px` }}>
              {t('files.emptyFolder')}
            </div>
          ) : (
            children.map((child) => renderEntry(folder, child, depth + 1))
          )
        )}
      </React.Fragment>
    );
  };

  const ColumnHeader = () => (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider dim"
      style={{ background: 'rgba(255, 255, 255, 0.02)', borderTop: '1px solid var(--border-color)' }}
    >
      <span className="w-5 shrink-0" />
      <span className="flex-1">{t('files.colName')}</span>
      <span className="w-[90px] shrink-0 text-end">{t('files.colSize')}</span>
      <span className="w-[92px] shrink-0 text-end hidden md:block">{t('files.colCount')}</span>
      <span className="w-[130px] shrink-0 hidden lg:block">{t('files.colDate')}</span>
      <span className="w-[130px] shrink-0 hidden sm:block">{t('files.colStatus')}</span>
      <span className="w-[104px] shrink-0 text-end">{t('files.colActions')}</span>
    </div>
  );

  return (
    <div className="fade-in flex flex-col gap-5 pb-12">
      {/* Unified Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Primary Add Folder Button */}
          <button
            onClick={onAddFolder}
            className="btn btn-primary shadow-lg shadow-blue-500/20"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{t('files.addFolder') || t('folders.add')}</span>
          </button>

          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 dim pointer-events-none" />
            <input
              type="text"
              placeholder={t('files.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input ps-9"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto min-w-[160px]"
          >
            <option value="">{t('files.allStatuses')}</option>
            <option value="synced">{t('files.syncedOnly')}</option>
            <option value="preserved_on_drive">{t('files.preservedOnly')}</option>
            <option value="cloud_missing">{t('files.statusCloudMissing')}</option>
            <option value="deleted_on_drive">{t('files.statusDeleted')}</option>
            <option value="pending">{t('files.pendingOnly')}</option>
            <option value="failed">{t('files.failedOnly')}</option>
          </select>
        </div>

        {/* Toolbar Secondary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={refreshVisible}
            className="btn btn-ghost btn-icon border border-[var(--border-color)]"
            title={t('files.refreshTip')}
          >
            <RefreshCw className={`w-4 h-4 ${flatLoading || treeLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Preserved bulk operations: Download All & Purge All */}
          {(statusFilter === 'preserved_on_drive' || preservedCount > 0) && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRestoreAllPreserved}
                disabled={bulkBusy}
                className="btn border transition-all text-xs font-bold gap-1.5 px-3 py-1.5 rounded-xl shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.22) 100%)',
                  borderColor: 'rgba(16, 185, 129, 0.45)',
                  color: '#34d399'
                }}
                title={t('files.restoreAllTip')}
              >
                <DownloadCloud className={`w-4 h-4 ${bulkAction === 'restoring' ? 'animate-bounce' : ''}`} />
                <span>{bulkAction === 'restoring' ? t('files.restoringAll') : t('files.restoreAll')}</span>
              </button>

              <button
                type="button"
                onClick={handlePurgeAllPreserved}
                disabled={bulkBusy}
                className="btn border transition-all text-xs font-bold gap-1.5 px-3 py-1.5 rounded-xl shadow-sm hover:scale-[1.02] active:scale-[0.98] hover:bg-rose-500/20"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.22) 100%)',
                  borderColor: 'rgba(239, 68, 68, 0.45)',
                  color: '#f87171'
                }}
                title={t('files.purgeAllTip')}
              >
                <Trash2 className={`w-4 h-4 ${bulkAction === 'purging' ? 'animate-spin' : ''}`} />
                <span>{bulkAction === 'purging' ? t('files.purgingAll') : t('files.purgeAll')}</span>
              </button>
            </div>
          )}

          {failedCount > 0 && (
            <button
              onClick={() => handleRetryAll(null)}
              disabled={busyPath !== null}
              className="btn btn-danger"
            >
              <RotateCcw className={`w-4 h-4 ${busyPath === '__all__' ? 'animate-spin' : ''}`} />
              {t('files.retryAll', { count: failedCount })}
            </button>
          )}
        </div>
      </div>

      {/* Bulk Operation Live Progress Indicator */}
      {bulkBusy && bulkProgress && (
        <div
          className="surface p-3.5 rounded-2xl border flex flex-col gap-2"
          style={{
            borderColor: 'var(--border-strong)',
            backgroundColor: 'var(--bg-surface)'
          }}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
              {bulkAction === 'restoring' ? t('files.restoringProgress') : t('files.purgingProgress')}
            </span>
            <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>
              {bulkProgress.done} / {bulkProgress.total}
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                background: 'var(--accent-gradient)',
                width: `${bulkProgress.total > 0 ? Math.min(100, Math.round((bulkProgress.done / bulkProgress.total) * 100)) : 0}%`
              }}
            />
          </div>
          {bulkProgress.name && (
            <div className="text-[11px] font-mono truncate" dir="ltr" style={{ color: 'var(--text-muted)' }}>
              {bulkProgress.name}
            </div>
          )}
        </div>
      )}

      {/* Summary line */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] dim px-1">
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {t('files.summaryLine', {
              folders: folders.length,
              files: grandTotals.files,
              size: formatBytes(grandTotals.size)
            })}
          </span>
          {isFlat && (
            <span className="badge badge-accent ms-2">{t('files.flatMode')}</span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isFlat ? (
        /* Flat Search / Filter Mode */
        flatLoading && flatFiles.length === 0 ? (
          <div className="surface py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-3 text-cyan-400" />
            <span className="text-xs dim">{t('files.loading')}</span>
          </div>
        ) : flatFiles.length === 0 ? (
          <div className="surface py-16 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3 dim" />
            <span className="text-xs dim">{t('files.empty')}</span>
          </div>
        ) : (
          <div className="surface overflow-hidden">
            {flatFiles.map((file, i) => {
              const progress = progressMap[file.local_path];
              const isBusy = busyPath === file.local_path;
              const showProgress = file.status === 'syncing' || (progress && progress.percent < 100);
              return (
                <div
                  key={file.id}
                  className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{ borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold truncate max-w-full text-slate-100">
                        {file.relative_path}
                      </span>
                      {renderStatus(file.status)}
                    </div>
                    <div
                      className="text-[10.5px] dim font-mono truncate mt-1"
                      dir="ltr"
                      style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}
                    >
                      {file.local_path}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] dim">
                      <span>{t('files.size', { size: formatBytes(file.file_size) })}</span>
                      {file.file_hash && <span className="font-mono">MD5: {file.file_hash.slice(0, 10)}…</span>}
                      {file.updated_at && (
                        <span>
                          {t('files.syncedAtLabel')} <span dir="ltr">{file.updated_at}</span>
                        </span>
                      )}
                    </div>
                    {showProgress && (
                      <div className="mt-2 flex items-center gap-2.5 max-w-md">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress ? progress.percent : 0}%`,
                              background: progress && progress.restoring ? 'var(--success)' : 'var(--accent)'
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono dim shrink-0">
                          {progress && progress.restoring
                            ? t('files.restoring', { percent: progress.percent })
                            : `${progress ? progress.percent : 0}%`}
                        </span>
                      </div>
                    )}
                    {file.error_message && (
                      <div
                        className="mt-2 text-[11px] p-2.5 rounded-xl flex items-center gap-2"
                        style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('files.error', { error: file.error_message })}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-center">
                    {(file.status === 'failed' || file.status === 'cloud_missing') && (
                      <button
                        onClick={() => handleRetry(file.local_path)}
                        disabled={isBusy}
                        className="btn btn-ghost btn-icon"
                        title={file.status === 'cloud_missing' ? t('files.reuploadToCloudTip') : t('files.retryTip')}
                      >
                        <RotateCcw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    {file.drive_file_id && file.status !== 'cloud_missing' && (
                      <button
                        onClick={() => handleRestore(file.local_path)}
                        disabled={isBusy}
                        className="btn btn-ghost btn-icon"
                        title={t('files.restoreTip')}
                      >
                        <DownloadCloud className={`w-4 h-4 ${isBusy ? 'animate-pulse' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={() => onOpenInExplorer(file.local_path)}
                      className="btn btn-ghost btn-icon"
                      title={t('files.openTip')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBoth({ local_path: file.local_path, relative_path: file.relative_path })}
                      disabled={isBusy}
                      className="btn btn-ghost btn-icon text-danger hover:bg-danger-soft"
                      title={t('files.deleteBothTip')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : folders.length === 0 ? (
        /* Empty State */
        <div
          className="surface py-20 px-6 text-center border-dashed"
          style={{ borderStyle: 'dashed' }}
        >
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 shadow-xl"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <FolderPlus className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold mb-1.5 text-slate-100">
            {t('folders.emptyTitle')}
          </h3>
          <p className="text-xs dim max-w-md mx-auto mb-6 leading-relaxed">
            {t('folders.emptyDesc')}
          </p>
          <button onClick={onAddFolder} className="btn btn-primary px-6 h-10 shadow-lg shadow-blue-500/25">
            <FolderPlus className="w-4 h-4" />
            <span>{t('folders.emptyButton')}</span>
          </button>
        </div>
      ) : (
        /* Tree Mode: Hierarchical folder cards */
        folders.map((folder) => {
          const entries = treeByFolder[folder.id] || [];
          const totals = folderTotals[folder.id] || { files: 0, size: 0 };
          const isPaused = folder.is_paused === 1;
          const isBusy = syncingFolderId === folder.id;
          const isCollapsed = !!collapsedFolders[folder.id];
          const failed = folder.failed_files || 0;

          return (
            <section
              key={folder.id}
              className="surface overflow-hidden transition-all duration-200"
              style={{
                borderColor: isBusy ? 'rgba(56, 189, 248, 0.4)' : undefined,
                boxShadow: isBusy ? '0 0 20px -5px rgba(56, 189, 248, 0.2)' : undefined
              }}
            >
              {/* Folder Header Bar */}
              <header className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 bg-white/[0.015]">
                {/* Expand / Collapse Chevron */}
                <button
                  onClick={() => toggleFolderCollapse(folder.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 shrink-0"
                  title={isCollapsed ? t('files.expandFolder') || 'Expand' : t('files.collapseFolder') || 'Collapse'}
                >
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                      isCollapsed ? 'rtl:rotate-90 ltr:-rotate-90' : 'rotate-0'
                    }`}
                  />
                </button>

                {/* Folder Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: isPaused ? 'var(--bg-surface-hover)' : 'var(--accent-soft)',
                    color: isPaused ? 'var(--text-dim)' : 'var(--accent)'
                  }}
                >
                  <Folder className="w-5 h-5" strokeWidth={2.2} />
                </div>

                {/* Folder Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-extrabold text-white truncate">{folder.name}</span>
                    <span className="badge badge-accent">{providerLabel(folder.provider)}</span>

                    {isPaused ? (
                      <span className="badge badge-warning">{t('folders.paused')}</span>
                    ) : (
                      <span className="badge badge-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {t('folders.watching')}
                      </span>
                    )}

                    {failed > 0 && (
                      <button
                        onClick={() => onRetryAll && onRetryAll(folder.id)}
                        className="badge badge-danger cursor-pointer hover:opacity-80"
                        title={t('files.retryTip')}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>{failed} {t('files.statusFailed')}</span>
                      </button>
                    )}
                  </div>

                  <div
                    className="text-[10.5px] dim font-mono truncate mt-1 select-all"
                    dir="ltr"
                    style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}
                  >
                    {folder.path}
                  </div>
                </div>

                {/* Folder Metrics & Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {/* File & Size Badges */}
                  <span className="badge badge-neutral hidden sm:inline-flex">
                    {t('files.filesCount', { count: totals.files || folder.total_files || 0 })}
                  </span>
                  <span className="badge badge-accent font-mono hidden md:inline-flex">
                    {formatBytes(totals.size)}
                  </span>

                  {/* Actions Group */}
                  <div className="flex items-center gap-1 ms-1">
                    {/* Badge */}
                    <button
                      onClick={() => onReapplyBadge && onReapplyBadge(folder.id)}
                      className="btn btn-ghost btn-icon"
                      title={t('folders.badgeTip')}
                    >
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                    </button>

                    {/* Open in Explorer */}
                    <button
                      onClick={() => onOpenInExplorer(folder.path)}
                      className="btn btn-ghost btn-icon"
                      title={t('folders.openTip')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>

                    {/* Sync Folder */}
                    <button
                      onClick={() => onSyncFolder(folder.id)}
                      disabled={isBusy || isPaused}
                      className="btn btn-ghost btn-icon"
                      title={t('folders.syncTip')}
                    >
                      <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>

                    {/* Pause / Resume */}
                    <button
                      onClick={() => onTogglePause(folder.id, !isPaused)}
                      className="btn btn-ghost btn-icon"
                      title={isPaused ? t('folders.resumeTip') : t('folders.pauseTip')}
                      style={{ color: isPaused ? 'var(--warning)' : undefined }}
                    >
                      {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => onRemoveFolder(folder.id, folder.name)}
                      className="btn btn-ghost btn-icon text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title={t('folders.removeTip')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </header>

              {/* Folder Nested Files Tree (visible when NOT collapsed) */}
              {!isCollapsed && (
                entries.length === 0 ? (
                  <div className="px-5 py-6 text-center text-[12px] dim" style={{ borderTop: '1px solid var(--border-color)' }}>
                    {treeLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        {t('files.loading')}
                      </span>
                    ) : (
                      t('files.emptyFolder')
                    )}
                  </div>
                ) : (
                  <>
                    <ColumnHeader />
                    {(() => {
                      const limit = displayedLimits[folder.id] || 80;
                      const visible = entries.slice(0, limit);
                      const hasMore = entries.length > limit;
                      return (
                        <>
                          {visible.map((entry) => renderEntry(folder, entry, 0))}
                          {hasMore && (
                            <div className="py-2.5 px-4 text-center bg-white/[0.015] border-t border-[var(--border-color)]">
                              <button
                                onClick={() => setDisplayedLimits((prev) => ({ ...prev, [folder.id]: (prev[folder.id] || 80) + 150 }))}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-cyan-400 hover:text-cyan-300 transition-all border border-white/10 cursor-pointer"
                              >
                                عرض المزيد (+{Math.min(150, entries.length - limit)} من أصل {entries.length - limit} ملف متبقي) 📂
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                )
              )}
            </section>
          );
        })
      )}

      {/* Zero-Deletion Guarantee Banner */}
      <div
        className="surface p-4 flex items-start gap-3 rounded-2xl"
        style={{ background: 'var(--success-soft)', borderColor: 'rgba(52, 211, 153, 0.15)' }}
      >
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
        <p className="text-[12px] leading-relaxed text-slate-300">
          {t('files.zeroDeleteBanner') || t('settings.securityDesc')}
        </p>
      </div>
    </div>
  );
}
