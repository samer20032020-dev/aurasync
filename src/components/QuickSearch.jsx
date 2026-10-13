import React, { useEffect, useRef, useState } from 'react';
import { Search, FileText, RotateCcw, FolderOpen, X } from 'lucide-react';
import { useI18n } from '../i18n';

const STATUS_BADGE = {
  synced: 'badge-success',
  pending: 'badge-warning',
  syncing: 'badge-warning',
  failed: 'badge-danger',
  preserved_on_drive: 'badge-accent',
  deleted_on_drive: 'badge-neutral'
};

export default function QuickSearch({ open, onClose, showToast }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await window.electronAPI.getFiles({ search: q, limit: 40, offset: 0 });
        setResults(list || []);
      } catch (_) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  if (!open) return null;

  const handleOpen = async (file) => {
    try {
      await window.electronAPI.openPath(file.local_path);
    } catch (_) {}
  };

  const handleRestore = async (file) => {
    try {
      const res = await window.electronAPI.restoreFile(file.local_path);
      if (res && res.success) {
        if (showToast) showToast(t('app.restoreSuccess', { path: res.destPath }), 'success');
      } else if (res && res.canceled) {
        if (showToast) showToast(t('app.restoreCanceled'), 'info');
      } else if (showToast) {
        showToast(t('app.restoreFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) showToast(t('app.restoreFailed', { error: err.message }), 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="surface w-full max-w-xl overflow-hidden rise-in"
        style={{ boxShadow: 'var(--shadow-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-[54px]" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Search className="w-4 h-4 dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && results.length > 0) handleOpen(results[0]);
            }}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-semibold"
            style={{ color: 'var(--text-main)' }}
          />
          <button onClick={onClose} className="btn btn-ghost btn-icon h-8 w-8 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[46vh] overflow-y-auto scroll-area">
          {!query.trim() ? (
            <div className="py-10 text-center text-[11.5px] dim">{t('search.empty')}</div>
          ) : loading ? (
            <div className="py-10 text-center text-[11.5px] dim">{t('files.loading')}</div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-[11.5px] dim">{t('search.noResults')}</div>
          ) : (
            <div className="p-2">
              {results.map((file, i) => (
                <div
                  key={`${file.local_path}-${i}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl surface-hover"
                >
                  <FileText className="w-4 h-4 shrink-0 dim" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold truncate" dir="auto">
                      {file.relative_path || file.local_path}
                    </div>
                    <div className="text-[10px] dim font-mono truncate mt-0.5" dir="ltr" style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}>
                      {file.local_path}
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[file.status] || 'badge-neutral'} shrink-0`}>
                    {file.status}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpen(file)}
                      className="btn btn-ghost btn-icon h-7 w-7"
                      title={t('search.open')}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    {file.status === 'preserved_on_drive' && (
                      <button
                        onClick={() => handleRestore(file)}
                        className="btn btn-ghost btn-icon h-7 w-7"
                        title={t('search.restore')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 h-9 text-[9.5px] dim"
          style={{ borderTop: '1px solid var(--border-color)', background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)' }}
        >
          <span>{t('search.tipOpen')}</span>
          <span className="font-mono">Enter ↵</span>
        </div>
      </div>
    </div>
  );
}
