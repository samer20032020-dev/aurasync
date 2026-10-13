import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch,
  Plus,
  RefreshCw,
  Download,
  Trash2,
  Cloud,
  Clock,
  FolderOpen,
  Sparkles
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

export default function SnapshotsPage({ folders = [], providers = [], showToast }) {
  const { t } = useI18n();
  const [snapshotList, setSnapshotList] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(null); // { type: 'create'|'restore'|'delete', snapshotId? }
  const [progress, setProgress] = useState(null);
  const mountedRef = useRef(true);

  const connectedIds = new Set(providers.filter((p) => p.connected).map((p) => p.id));
  const usableFolders = folders.filter((f) => connectedIds.has(f.provider || 'google'));

  const refresh = async () => {
    try {
      const list = await window.electronAPI.listSnapshots();
      if (mountedRef.current) setSnapshotList(list || []);
    } catch (_) {}
  };

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    if (usableFolders.length > 0 && !selectedFolderId) {
      setSelectedFolderId(String(usableFolders[0].id));
    }
    let cleanup;
    if (window.electronAPI?.onSnapshotProgress) {
      cleanup = window.electronAPI.onSnapshotProgress((data) => {
        if (mountedRef.current) setProgress(data);
      });
    }
    return () => {
      mountedRef.current = false;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!selectedFolderId || busy) return;
    setBusy({ type: 'create' });
    setProgress(null);
    try {
      const res = await window.electronAPI.createSnapshot(Number(selectedFolderId), label.trim() || null);
      if (res && res.success) {
        showToast(t('snapshots.doneCreate', { count: res.snapshot?.file_count || 0 }), 'success');
        setLabel('');
        await refresh();
      } else {
        showToast(t('snapshots.failed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('snapshots.failed', { error: err.message }), 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const handleRestore = async (snap, mode) => {
    if (busy) return;
    setBusy({ type: 'restore', snapshotId: snap.id, mode });
    setProgress(null);
    try {
      const res = await window.electronAPI.restoreSnapshot(snap.id, mode);
      if (res && res.success) {
        showToast(
          t(mode === 'device' ? 'snapshots.doneRestoreDevice' : 'snapshots.doneRestoreCloud', {
            count: res.restored || 0
          }),
          'success'
        );
        await refresh();
      } else if (res && res.canceled) {
        showToast(t('app.restoreCanceled'), 'info');
      } else {
        showToast(t('snapshots.failed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('snapshots.failed', { error: err.message }), 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const handleDelete = async (snap) => {
    if (busy) return;
    const confirmed = window.confirm(
      t('snapshots.confirmDelete', { label: snap.label || snap.folder_name || '' })
    );
    if (!confirmed) return;
    setBusy({ type: 'delete', snapshotId: snap.id });
    try {
      const res = await window.electronAPI.deleteSnapshot(snap.id);
      if (res && res.success) {
        showToast(t('snapshots.deleted'), 'info');
        await refresh();
      } else {
        showToast(t('snapshots.failed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('snapshots.failed', { error: err.message }), 'error');
    } finally {
      setBusy(null);
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="fade-in flex flex-col gap-5 max-w-4xl">
      {/* Create card */}
      <section className="surface p-5">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)'
            }}
          >
            <GitBranch className="w-[17px] h-[17px]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[13.5px] font-extrabold tracking-tight">{t('snapshots.title')}</h2>
            <p className="text-[11px] dim leading-relaxed mt-0.5">{t('snapshots.subtitle')}</p>
          </div>
        </div>

        {usableFolders.length === 0 ? (
          <div
            className="p-3.5 rounded-xl text-[11.5px] font-bold"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            {t('snapshots.noFolders')}
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="input flex-1"
                disabled={!!busy}
              >
                {usableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.path})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('snapshots.labelPlaceholder')}
                className="input flex-1"
                disabled={!!busy}
              />
              <button
                onClick={handleCreate}
                disabled={!!busy || !selectedFolderId}
                className="btn btn-primary shrink-0 h-10"
              >
                {busy?.type === 'create' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t('snapshots.creating')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {t('snapshots.create')}
                  </>
                )}
              </button>
            </div>

            {progress && busy?.type === 'create' && (
              <div className="mt-4">
                <div className="h-[7px] rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${percent}%`, background: 'var(--accent-gradient)' }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10.5px] dim">
                  <span className="truncate">{progress.name || ''}</span>
                  <span className="font-mono shrink-0" dir="ltr">
                    {progress.current}/{progress.total}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* List */}
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-[13px] font-extrabold flex items-center gap-2">
            <Clock className="w-4 h-4 accent-text" />
            {t('snapshots.listTitle')}
          </h2>
          <span className="text-[10.5px] font-bold dim font-mono">{snapshotList.length}</span>
        </div>

        {snapshotList.length === 0 ? (
          <div className="py-14 text-center flex flex-col items-center gap-2">
            <Sparkles className="w-5 h-5 dim" />
            <span className="text-[11.5px] dim">{t('snapshots.empty')}</span>
            <span className="text-[10.5px] dim opacity-70">{t('snapshots.emptyHint')}</span>
          </div>
        ) : (
          <div className="px-5 pb-2">
            {snapshotList.map((snap, i) => {
              const isBusyRow = busy && busy.snapshotId === snap.id;
              return (
                <div
                  key={snap.id}
                  className="flex items-center gap-3 py-3.5"
                  style={{ borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}
                >
                  <FolderOpen className="w-[16px] h-[16px] shrink-0 accent-text" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[12.5px] font-bold truncate">{snap.folder_name}</span>
                      <span className="badge badge-accent">{snap.label}</span>
                    </div>
                    <div className="text-[10.5px] dim mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{snap.created_at}</span>
                      <span>{t('snapshots.files', { count: snap.file_count || 0 })}</span>
                      <span className="font-mono" dir="ltr">{formatBytes(snap.total_size || 0)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(snap, 'cloud')}
                      disabled={!!busy}
                      className="btn h-8 px-3 text-[11px]"
                      title={t('snapshots.restoreCloud')}
                    >
                      {isBusyRow && busy?.type === 'restore' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Cloud className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden md:inline">{t('snapshots.restoreCloud')}</span>
                    </button>
                    <button
                      onClick={() => handleRestore(snap, 'device')}
                      disabled={!!busy}
                      className="btn h-8 px-3 text-[11px]"
                      title={t('snapshots.restoreDevice')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">{t('snapshots.restoreDevice')}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(snap)}
                      disabled={!!busy}
                      className="btn btn-danger h-8 px-3 text-[11px]"
                      title={t('snapshots.delete')}
                    >
                      {isBusyRow && busy?.type === 'delete' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {progress && busy?.type === 'restore' && (
              <div className="py-3">
                <div className="h-[7px] rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${percent}%`, background: 'var(--success)' }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10.5px] dim">
                  <span className="truncate">
                    {t(busy.mode === 'device' ? 'snapshots.restoringDevice' : 'snapshots.restoringCloud')}
                  </span>
                  <span className="font-mono shrink-0" dir="ltr">
                    {progress.current}/{progress.total}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-3 text-[10px] dim leading-relaxed" style={{ borderTop: '1px solid var(--border-color)' }}>
          {t('snapshots.restoreNote')}
        </div>
      </section>
    </div>
  );
}
