import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowDownCircle, Trash2, History } from 'lucide-react';
import { useI18n } from '../i18n';

export default function ActivityPage({ logs, onClearLogs }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef(null);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'uploads' && log.type !== 'success') return false;
    if (filter === 'deletes' && log.type !== 'delete_ignored' && log.type !== 'delete_propagated') return false;
    if (filter === 'errors' && log.type !== 'error') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.message?.toLowerCase().includes(q) ||
        (log.file_path && log.file_path.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const badge = (type) => {
    switch (type) {
      case 'success':
        return <span className="badge badge-success">{t('console.badgeUploaded')}</span>;
      case 'delete_ignored':
        return <span className="badge badge-warning">{t('console.badgePreserved')}</span>;
      case 'delete_propagated':
        return <span className="badge badge-danger">{t('console.badgeDeleteSynced')}</span>;
      case 'error':
        return <span className="badge badge-danger">{t('console.badgeError')}</span>;
      case 'warning':
        return <span className="badge badge-warning">{t('console.badgeWarn')}</span>;
      default:
        return <span className="badge badge-neutral">{t('console.badgeInfo')}</span>;
    }
  };

  const filters = [
    { id: 'all', label: t('console.all') },
    { id: 'uploads', label: t('console.uploads') },
    { id: 'deletes', label: t('console.deletes') },
    { id: 'errors', label: t('console.errors') }
  ];

  return (
    <div className="fade-in flex flex-col pb-6" style={{ height: 'calc(100vh - 170px)', minHeight: '440px' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 h-8 rounded-lg text-[11.5px] font-bold transition-colors"
              style={
                filter === f.id
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 dim" />
          <input
            type="text"
            placeholder={t('console.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input ps-9"
          />
        </div>

        <span className="badge badge-accent">{t('console.events', { count: filteredLogs.length })}</span>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className="btn btn-icon"
          title={t('console.autoScroll')}
          style={autoScroll ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
        >
          <ArrowDownCircle className="w-4 h-4" />
        </button>

        <button onClick={onClearLogs} className="btn btn-icon" title={t('console.clear')} style={{ color: 'var(--danger)' }}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Log list */}
      <div ref={listRef} className="surface scroll-area flex-1 p-3">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <History className="w-7 h-7 dim" />
            <span className="text-xs dim">{t('console.empty')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredLogs.map((log, i) => (
              <div
                key={log.id || i}
                className="flex items-start gap-3 px-3 py-2 rounded-lg"
                style={{
                  background:
                    log.type === 'error'
                      ? 'var(--danger-soft)'
                      : log.type === 'delete_propagated'
                      ? 'var(--danger-soft)'
                      : log.type === 'delete_ignored'
                      ? 'var(--warning-soft)'
                      : 'transparent'
                }}
              >
                <span className="text-[10.5px] font-mono dim shrink-0 mt-0.5 w-[70px]">
                  {log.timestamp ? String(log.timestamp).split(' ')[1] || log.timestamp : ''}
                </span>
                <span className="shrink-0 mt-0.5">{badge(log.type)}</span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[11.5px] leading-relaxed break-words"
                    style={{ color: 'var(--text-main)', unicodeBidi: 'plaintext' }}
                  >
                    {log.message}
                  </div>
                  {log.file_path && (
                    <div
                      className="text-[10px] dim font-mono break-all mt-0.5 text-start"
                      dir="ltr"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {log.file_path}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
