import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  ChevronLeft,
  Check,
  RefreshCw,
  HardDrive,
  Cloud
} from 'lucide-react';
import { useI18n } from '../i18n';

export default function CloudBrowser({ provider, onClose, onSelect }) {
  const { t } = useI18n();
  const [stack, setStack] = useState([]); // [{ id, name }]
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const current = stack[stack.length - 1] || null;

  const loadFolder = async (folderId) => {
    if (!window.electronAPI?.listProviderFolder) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.listProviderFolder(provider.id, folderId);
      if (res && res.success) {
        setItems(res.items || []);
      } else {
        setError((res && res.error) || t('browser.unknownError'));
        setItems([]);
      }
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const root = await window.electronAPI.getProviderRoot(provider.id);
        if (root && root.success) {
          const rootEntry = { id: root.id, name: root.name };
          setStack([rootEntry]);
          await loadFolder(root.id);
        } else {
          setError((root && root.error) || t('browser.rootError'));
          setLoading(false);
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const enterFolder = async (item) => {
    setStack((prev) => [...prev, { id: item.id, name: item.name }]);
    await loadFolder(item.id);
  };

  const jumpTo = async (index) => {
    const entry = stack[index];
    setStack((prev) => prev.slice(0, index + 1));
    await loadFolder(entry.id);
  };

  const goUp = async () => {
    if (stack.length <= 1) return;
    await jumpTo(stack.length - 2);
  };

  const choose = () => {
    if (!current) return;
    const pathLabel = stack.map((s) => s.name).join(' / ');
    onSelect({
      kind: 'cloud',
      accountId: provider.id,
      provider: provider.id,
      folderId: current.id,
      label: `${provider.label} • ${pathLabel}`
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="surface w-full max-w-xl flex flex-col overflow-hidden fade-in" style={{ maxHeight: '80vh', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2.5">
            <Cloud className="w-[18px] h-[18px]" style={{ color: 'var(--accent)' }} />
            <div>
              <div className="text-[13px] font-extrabold">{t('browser.title')}</div>
              <div className="text-[10.5px] dim">{provider.label}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
          <button
            onClick={goUp}
            disabled={stack.length <= 1}
            className="btn btn-ghost btn-icon shrink-0"
            title={t('browser.up')}
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
          {stack.map((entry, index) => (
            <React.Fragment key={`${entry.id}-${index}`}>
              {index > 0 && <span className="dim text-[10px] shrink-0">/</span>}
              <button
                onClick={() => jumpTo(index)}
                className="text-[11.5px] font-semibold px-2 py-1 rounded-lg shrink-0 transition-colors hover:bg-[var(--bg-surface-hover)]"
                style={{ color: index === stack.length - 1 ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {index === 0 ? t('browser.root') : entry.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Items */}
        <div className="flex-1 scroll-area p-3">
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 accent-text" />
              <span className="text-[11px] dim">{t('files.loading')}</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-[11.5px]" style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[11.5px] dim">{t('browser.empty')}</div>
          ) : (
            <div className="flex flex-col gap-1">
              {items
                .filter((item) => item.isDir)
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => enterFolder(item)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors hover:bg-[var(--bg-surface-hover)]"
                  >
                    <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span className="text-[12px] font-semibold truncate flex-1">{item.name}</span>
                    <ChevronLeft className="w-3.5 h-3.5 dim rtl:rotate-180" />
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-1.5 text-[10.5px] dim truncate">
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{stack.map((s) => s.name).join(' / ')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="btn">
              {t('files.close')}
            </button>
            <button onClick={choose} disabled={!current} className="btn btn-primary">
              <Check className="w-4 h-4" />
              {t('browser.select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
