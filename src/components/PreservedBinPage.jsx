import React, { useEffect, useState } from 'react';
import { Archive, Search, RotateCcw, Trash2, FileQuestion, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

export default function PreservedBinPage({ showToast }) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [busyPath, setBusyPath] = useState(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeProgress, setPurgeProgress] = useState(null);

  const load = async () => {
    try {
      const [list, statsData] = await Promise.all([
        window.electronAPI.getFiles({
          status: 'preserved_on_drive',
          limit: 500,
          offset: 0
        }),
        window.electronAPI.getAppStats ? window.electronAPI.getAppStats() : Promise.resolve(null)
      ]);
      setFiles(list || []);
      if (statsData) setTotal(statsData.preservedFiles || 0);
      else setTotal((list || []).length);
    } catch (_) {}
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPurgeProgress) return undefined;
    const unsub = window.electronAPI.onPurgeProgress((data) => {
      setPurgeProgress(data);
    });
    return unsub;
  }, []);

  const filtered = query.trim()
    ? files.filter((f) =>
        (f.relative_path || f.local_path || '').toLowerCase().includes(query.trim().toLowerCase())
      )
    : files;

  const handleRestore = async (file) => {
    if (busyPath) return;
    setBusyPath(file.local_path);
    try {
      const res = await window.electronAPI.restoreFile(file.local_path);
      if (res && res.success) {
        if (showToast) showToast(t('app.restoreSuccess', { path: res.destPath }), 'success');
        await load();
      } else if (res && res.canceled) {
        if (showToast) showToast(t('app.restoreCanceled'), 'info');
      } else if (showToast) {
        showToast(t('app.restoreFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('app.restoreFailed', { error: err.message }), 'error');
    } finally {
      setBusyPath(null);
    }
  };

  const handlePurge = async (file) => {
    if (busyPath) return;
    const name = file.relative_path || file.local_path;
    if (!window.confirm(t('archive.purgeConfirm', { name }))) return;
    setBusyPath(file.local_path);
    try {
      const res = await window.electronAPI.purgeFile(file.local_path);
      if (res && res.success) {
        if (showToast) showToast(t('archive.purged'), 'info');
        await load();
      } else if (showToast) {
        showToast(t('snapshots.failed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('snapshots.failed', { error: err.message }), 'error');
    } finally {
      setBusyPath(null);
    }
  };

  const handlePurgeAll = async () => {
    if (purgeBusy || total === 0) return;
    if (!window.confirm(t('archive.purgeAllConfirm', { count: total }))) return;
    setPurgeBusy(true);
    setPurgeProgress({ done: 0, total });
    try {
      const res = await window.electronAPI.purgeAllPreserved();
      if (res && res.success) {
        if (res.failed > 0) {
          if (showToast) showToast(t('archive.purgeAllPartial', { deleted: res.deleted, failed: res.failed }), 'info');
        } else if (showToast) {
          showToast(t('archive.purgeAllDone', { count: res.deleted }), 'success');
        }
        await load();
      } else if (showToast) {
        showToast(t('snapshots.failed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('snapshots.failed', { error: err.message }), 'error');
    } finally {
      setPurgeBusy(false);
      setPurgeProgress(null);
    }
  };

  return (
    <div className="fade-in flex flex-col gap-5 max-w-4xl">
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
            <Archive className="w-[17px] h-[17px]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[13.5px] font-extrabold tracking-tight">{t('archivePage.cardTitle')}</h2>
            <p className="text-[11px] dim leading-relaxed mt-0.5">{t('archivePage.cardDesc')}</p>
          </div>
          <div className="ms-auto shrink-0 flex items-center gap-2">
            <span className="badge badge-accent font-mono">{total}</span>
            {total > 0 && (
              <button
                onClick={handlePurgeAll}
                disabled={purgeBusy}
                className="btn btn-danger h-8 px-3 text-[11px]"
              >
                {purgeBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {t('archive.purgeAll')}
              </button>
            )}
          </div>
        </div>

        {purgeBusy && purgeProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10.5px] dim mb-1.5">
              <span>{t('archive.purging')}</span>
              <span className="font-mono" dir="ltr">
                {purgeProgress.done} / {purgeProgress.total}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-surface-hover)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${purgeProgress.total ? Math.round((purgeProgress.done / purgeProgress.total) * 100) : 0}%`,
                  background: 'var(--danger)'
                }}
              />
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('archive.search')}
            className="input ps-9"
          />
        </div>
      </section>

      <section className="surface overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-2 text-center">
            <FileQuestion className="w-6 h-6 dim" />
            <span className="text-[11.5px] dim">{files.length === 0 ? t('archive.empty') : t('search.noResults')}</span>
          </div>
        ) : (
          <div className="px-5 pb-2 max-h-[62vh] overflow-y-auto scroll-area">
            {filtered.map((file, i) => (
              <div
                key={file.local_path}
                className="flex items-center gap-3 py-3"
                style={{ borderTop: i > 0 ? '1px solid var(--border-color)' : 'none' }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#60a5fa' }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold truncate" dir="auto">
                    {file.relative_path || file.local_path}
                  </div>
                  <div className="text-[10px] dim font-mono truncate mt-0.5" dir="ltr" style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}>
                    {file.local_path}
                  </div>
                </div>
                <span className="text-[10.5px] dim font-mono shrink-0 hidden sm:block" dir="ltr">
                  {formatBytes(file.file_size || 0)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(file)}
                    disabled={!!busyPath}
                    className="btn h-8 px-3 text-[11px]"
                    title={t('archive.restore')}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${busyPath === file.local_path ? 'animate-spin' : ''}`} />
                    <span className="hidden md:inline">{t('archive.restore')}</span>
                  </button>
                  <button
                    onClick={() => handlePurge(file)}
                    disabled={!!busyPath}
                    className="btn btn-danger h-8 px-3 text-[11px]"
                    title={t('archive.purge')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
