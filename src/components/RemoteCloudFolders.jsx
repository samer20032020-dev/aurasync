import React, { useState } from 'react';
import {
  Cloud,
  Folder,
  RefreshCw,
  Eye,
  DownloadCloud,
  Trash2,
  HardDrive,
  Laptop,
  Globe,
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowDownToLine,
  FolderSync
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

function formatDate(value) {
  if (!value) return '—';
  const str = String(value);
  const [date, time] = str.split('T');
  if (!time) return date;
  return `${date} ${time.slice(0, 5)}`;
}

export default function RemoteCloudFolders({
  remoteFolders = [],
  loading = false,
  onRefresh,
  onLinkFolder,
  onTrashFolder,
  showToast
}) {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';

  const [inspectFolder, setInspectFolder] = useState(null);
  const [inspectFiles, setInspectFiles] = useState([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState(null);
  const [linkingFolderId, setLinkingFolderId] = useState(null);
  const [linkingAll, setLinkingAll] = useState(false);

  const handleLinkAll = async () => {
    if (!window.electronAPI?.linkAllRemoteFolders) return;
    if (!remoteFolders || remoteFolders.length === 0) return;
    setLinkingAll(true);
    try {
      let chosenDir = null;
      if (window.electronAPI?.selectDownloadDir) {
        chosenDir = await window.electronAPI.selectDownloadDir('AuraSync');
      }
      if (!chosenDir) {
        setLinkingAll(false);
        return;
      }
      const res = await window.electronAPI.linkAllRemoteFolders(null, chosenDir);
      if (res && res.success) {
        showToast?.(t('remote.allSyncedSuccess', { count: res.count || remoteFolders.length }), 'success');
        onLinkFolder?.();
      } else {
        showToast?.(t('remote.linkFailed', { error: res?.error || 'Unknown' }), 'error');
      }
    } catch (err) {
      showToast?.(t('remote.linkFailed', { error: err.message }), 'error');
    } finally {
      setLinkingAll(false);
    }
  };

  const handleOpenInspect = async (folder) => {
    setInspectFolder(folder);
    setInspectFiles([]);
    setInspectLoading(true);
    try {
      if (window.electronAPI?.listRemoteFolderFiles) {
        const res = await window.electronAPI.listRemoteFolderFiles(folder.provider, folder.id);
        if (res && res.success) {
          setInspectFiles(res.files || []);
        } else {
          showToast?.(res?.error || t('remote.downloadFailed', { error: 'Unknown' }), 'error');
        }
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleDownloadFile = async (file) => {
    if (!inspectFolder || !window.electronAPI?.downloadRemoteFile) return;
    setDownloadingFileId(file.id);
    try {
      const res = await window.electronAPI.downloadRemoteFile(inspectFolder.provider, file.id, file.name);
      if (res && res.success) {
        showToast?.(t('remote.downloadSuccess'), 'success');
      } else if (!res?.canceled) {
        showToast?.(t('remote.downloadFailed', { error: res?.error || 'Unknown' }), 'error');
      }
    } catch (err) {
      showToast?.(t('remote.downloadFailed', { error: err.message }), 'error');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleLink = async (folder) => {
    if (!window.electronAPI) return;
    setLinkingFolderId(folder.id);
    try {
      const selectedPath = await window.electronAPI.selectDownloadDir(folder.name);
      if (!selectedPath) {
        setLinkingFolderId(null);
        return;
      }
      const res = await window.electronAPI.linkRemoteFolder(
        folder.provider,
        folder.id,
        folder.name,
        selectedPath
      );
      if (res && res.success) {
        showToast?.(t('remote.linkSuccess'), 'success');
        if (inspectFolder?.id === folder.id) setInspectFolder(null);
        onLinkFolder?.();
      } else {
        showToast?.(t('remote.linkFailed', { error: res?.error || 'Unknown' }), 'error');
      }
    } catch (err) {
      showToast?.(t('remote.linkFailed', { error: err.message }), 'error');
    } finally {
      setLinkingFolderId(null);
    }
  };

  const handleDelete = async (folder) => {
    if (!window.electronAPI?.trashRemoteFolder) return;
    const confirmed = window.confirm(t('remote.confirmDelete', { name: folder.name }));
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.trashRemoteFolder(folder.provider, folder.id);
      if (res && res.success) {
        showToast?.(t('app.folderRemoved', { name: folder.name }), 'info');
        if (inspectFolder?.id === folder.id) setInspectFolder(null);
        onTrashFolder?.();
      } else {
        showToast?.(res?.error || 'Failed to delete folder', 'error');
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  return (
    <section className="surface overflow-hidden flex flex-col fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13.5px] font-extrabold">{t('remote.sectionTitle')}</h2>
              <span className="badge badge-primary text-[10px] py-0.5">
                {t('remote.zeroDiskBadge')}
              </span>
              <span className="badge badge-success text-[10px] py-0.5">
                {t('remote.multiDeviceBadge')}
              </span>
            </div>
            <p className="text-[11px] dim mt-0.5 max-w-xl leading-relaxed">
              {t('remote.sectionSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          {remoteFolders.length > 0 && (
            <button
              onClick={handleLinkAll}
              disabled={linkingAll || loading}
              className="btn btn-primary h-8 px-3 text-[11px] flex items-center gap-1.5"
              title={t('remote.syncAllTooltip')}
            >
              <FolderSync className={`w-3.5 h-3.5 ${linkingAll ? 'animate-spin' : ''}`} />
              <span>{t('remote.syncAll')}</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={loading || linkingAll}
            className="btn btn-outline h-8 px-3 text-[11px] flex items-center gap-1.5"
            title={t('remote.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('remote.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center flex flex-col items-center justify-center gap-2.5">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-[12px] muted">{t('remote.scanning')}</span>
        </div>
      ) : remoteFolders.length === 0 ? (
        <div className="p-6 text-center flex flex-col items-center justify-center gap-2">
          <Cloud className="w-8 h-8 opacity-30" style={{ color: 'var(--accent)' }} />
          <p className="text-[11.5px] dim max-w-md leading-relaxed">{t('remote.empty')}</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {remoteFolders.map((folder) => {
            const isLinking = linkingFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className="surface-flat p-4 flex flex-col justify-between gap-3 rounded-xl border border-[var(--border-color)] transition-all hover:border-[var(--accent)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Folder className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold truncate" title={folder.name}>
                        {folder.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] dim mt-1 flex-wrap">
                        <span className="badge py-0 px-1.5 font-mono text-[9.5px]">
                          {folder.providerLabel || folder.provider}
                        </span>
                        <span>•</span>
                        <span>{t('remote.fileCount', { count: folder.fileCount || 0 })}</span>
                        <span>•</span>
                        <span dir="ltr">{formatBytes(folder.totalBytes || 0)}</span>
                      </div>
                    </div>
                  </div>

                  <span className="badge badge-ghost text-[10px] shrink-0 font-medium" dir="ltr">
                    {lang === 'ar' ? '0 بايت محلي' : '0 B Disk'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]">
                  <button
                    onClick={() => handleOpenInspect(folder)}
                    className="btn btn-ghost h-7 px-2.5 text-[11px] flex items-center gap-1.5"
                    title={t('remote.browse')}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('remote.browse')}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleLink(folder)}
                      disabled={isLinking}
                      className="btn btn-primary h-7 px-3 text-[11px] flex items-center gap-1.5"
                      title={t('remote.syncToThisDevice')}
                    >
                      <ArrowDownToLine className={`w-3.5 h-3.5 ${isLinking ? 'animate-bounce' : ''}`} />
                      <span>{t('remote.syncToThisDevice')}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(folder)}
                      className="btn btn-ghost btn-icon h-7 w-7 text-danger hover:bg-danger-soft"
                      title={t('remote.deleteFromCloud')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Files Modal (Cloud-only files inspector) */}
      {inspectFolder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
        >
          <div
            className="surface w-full max-w-2xl flex flex-col overflow-hidden rounded-2xl fade-in"
            style={{ maxHeight: '82vh', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <Cloud className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-extrabold truncate">
                    {t('remote.modalTitle', { name: inspectFolder.name })}
                  </div>
                  <div className="text-[10.5px] dim">
                    {inspectFolder.providerLabel} • {t('remote.zeroDiskBadge')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setInspectFolder(null)}
                className="btn btn-ghost btn-icon h-8 w-8"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Note banner */}
            <div className="px-5 py-2.5 bg-[var(--accent-soft)] text-[11px] flex items-center gap-2 border-b border-[var(--border-color)]">
              <Laptop className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="muted">{t('remote.modalSubtitle')}</span>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
              {inspectLoading ? (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs dim">{t('remote.scanning')}</span>
                </div>
              ) : inspectFiles.length === 0 ? (
                <div className="p-8 text-center text-xs dim">{t('remote.emptyFolder')}</div>
              ) : (
                inspectFiles.map((file) => {
                  const isDownloading = downloadingFileId === file.id;
                  return (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg surface-hover text-start"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {file.isDir ? (
                          <Folder className="w-4 h-4 shrink-0 text-accent" />
                        ) : (
                          <FileText className="w-4 h-4 shrink-0 text-muted" />
                        )}
                        <span className="text-[12px] font-medium truncate" title={file.name}>
                          {file.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] dim font-mono" dir="ltr">
                          {formatBytes(file.size || 0)}
                        </span>
                        {!file.isDir && (
                          <button
                            onClick={() => handleDownloadFile(file)}
                            disabled={isDownloading}
                            className="btn btn-outline h-6 px-2 text-[10.5px] flex items-center gap-1"
                            title={t('remote.downloadFile')}
                          >
                            <DownloadCloud className={`w-3 h-3 ${isDownloading ? 'animate-bounce' : ''}`} />
                            <span>{t('remote.downloadFile')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--surface-flat)]">
              <span className="text-[11px] dim">
                {t('remote.fileCount', { count: inspectFiles.length })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLink(inspectFolder)}
                  disabled={linkingFolderId === inspectFolder.id}
                  className="btn btn-primary h-8 px-4 text-[11.5px] flex items-center gap-1.5"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{t('remote.downloadEntire')}</span>
                </button>
                <button onClick={() => setInspectFolder(null)} className="btn h-8 px-3 text-[11.5px]">
                  {t('files.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
