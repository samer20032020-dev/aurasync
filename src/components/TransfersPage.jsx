import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Cloud,
  FolderOpen,
  ArrowLeftRight,
  Play,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Ban,
  Trash2
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';
import CloudBrowser from './CloudBrowser';

function statusBadge(status, t) {
  switch (status) {
    case 'running':
      return (
        <span className="badge badge-accent">
          <RefreshCw className="w-3 h-3 animate-spin" />
          {t('transfers.running')}
        </span>
      );
    case 'done':
      return (
        <span className="badge badge-success">
          <CheckCircle2 className="w-3 h-3" />
          {t('transfers.done')}
        </span>
      );
    case 'failed':
      return (
        <span className="badge badge-danger">
          <AlertTriangle className="w-3 h-3" />
          {t('transfers.failed')}
        </span>
      );
    default:
      return (
        <span className="badge badge-neutral">
          <Ban className="w-3 h-3" />
          {t('transfers.canceled')}
        </span>
      );
  }
}

function SidePanel({ title, side, value, providers, onPickDevice, onPickCloud, onClear }) {
  const { t } = useI18n();
  return (
    <div className="surface p-4 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wide dim">{title}</span>
        {value && (
          <button onClick={onClear} className="btn btn-ghost btn-icon" title={t('files.close')}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Current value */}
      {value ? (
        <div
          className="p-3 rounded-xl mb-3 flex items-start gap-2.5"
          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
        >
          {value.kind === 'device' ? (
            <Monitor className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          ) : (
            <Cloud className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          )}
          <div className="min-w-0">
            <div className="text-[11.5px] font-bold truncate">{value.label}</div>
            <div className="text-[10px] dim font-mono truncate mt-0.5" dir="ltr" style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}>
              {value.kind === 'device' ? value.path : `${t('transfers.folderPrefix')} ${value.folderId}`}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[11px] dim mb-3">{t('transfers.notSelected')}</div>
      )}

      {/* Choices */}
      <div className="flex flex-wrap gap-2">
        <button onClick={onPickDevice} className="btn">
          <FolderOpen className="w-4 h-4" />
          {t('transfers.pickDevice')}
        </button>

        {providers
          .filter((p) => p.connected)
          .map((p) => (
            <button key={p.id} onClick={() => onPickCloud(p)} className="btn">
              <Cloud className="w-4 h-4" />
              {p.label}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function TransfersPage({ providers = [], showToast }) {
  const { t } = useI18n();
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [browser, setBrowser] = useState(null); // { side, provider }
  const [transfers, setTransfers] = useState([]);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);

  const anyConnected = providers.some((p) => p.connected);

  const refresh = async () => {
    if (!window.electronAPI?.getTransfers) return;
    try {
      const list = await window.electronAPI.getTransfers();
      if (mounted.current) setTransfers(list || []);
    } catch (_) {}
  };

  useEffect(() => {
    mounted.current = true;
    refresh();
    let cleanup;
    if (window.electronAPI?.onTransferProgress) {
      cleanup = window.electronAPI.onTransferProgress((transfer) => {
        setTransfers((prev) => {
          const index = prev.findIndex((x) => x.id === transfer.id);
          if (index === -1) return [transfer, ...prev];
          const copy = [...prev];
          copy[index] = transfer;
          return copy;
        });
      });
    }
    return () => {
      mounted.current = false;
      if (cleanup) cleanup();
    };
  }, []);

  const pickDevice = async (side) => {
    if (!window.electronAPI?.selectFolderDialog) return;
    const selected = await window.electronAPI.selectFolderDialog();
    if (!selected) return;
    const descriptor = { kind: 'device', path: selected.path, label: selected.path };
    if (side === 'source') setSource(descriptor);
    else setDestination(descriptor);
  };

  const handleCloudPick = (side, selection) => {
    const descriptor = { ...selection };
    if (side === 'source') setSource(descriptor);
    else setDestination(descriptor);
    setBrowser(null);
  };

  const startTransfer = async () => {
    if (!source || !destination) return;
    setStarting(true);
    try {
      const res = await window.electronAPI.startTransfer({ source, destination });
      if (res && res.success) {
        await refresh();
      } else if (showToast) {
        showToast(t('transfers.startFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      if (showToast) {
        showToast(t('transfers.startFailed', { error: err.message }), 'error');
      }
    } finally {
      setStarting(false);
    }
  };

  const cancelTransfer = async (id) => {
    if (window.electronAPI?.cancelTransfer) {
      await window.electronAPI.cancelTransfer(id);
    }
  };

  const clearFinished = async () => {
    if (window.electronAPI?.clearTransfers) {
      await window.electronAPI.clearTransfers();
      await refresh();
    }
  };

  const canStart =
    source &&
    destination &&
    !starting &&
    !(source.kind === 'device' && destination.kind === 'device' && source.path === destination.path) &&
    !(source.kind === 'cloud' && destination.kind === 'cloud' &&
      source.provider === destination.provider && source.folderId === destination.folderId);

  return (
    <div className="fade-in">
      {!anyConnected && (
        <div className="surface p-4 mb-4 flex items-start gap-3" style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--warning)' }}>
            {t('transfers.needProviders')}
          </span>
        </div>
      )}

      {/* Source / Destination */}
      <div className="flex flex-col lg:flex-row items-stretch gap-3 mb-4">
        <SidePanel
          title={t('transfers.source')}
          side="source"
          value={source}
          providers={providers}
          onPickDevice={() => pickDevice('source')}
          onPickCloud={(p) => setBrowser({ side: 'source', provider: p })}
          onClear={() => setSource(null)}
        />

        <div className="flex items-center justify-center shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <ArrowLeftRight className="w-4 h-4" />
          </div>
        </div>

        <SidePanel
          title={t('transfers.destination')}
          side="destination"
          value={destination}
          providers={providers}
          onPickDevice={() => pickDevice('destination')}
          onPickCloud={(p) => setBrowser({ side: 'destination', provider: p })}
          onClear={() => setDestination(null)}
        />
      </div>

      {/* Start */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1.5 text-[10.5px] dim">
          <Info className="w-3.5 h-3.5" />
          <span>{t('transfers.notice')}</span>
        </div>
        <button onClick={startTransfer} disabled={!canStart} className="btn btn-primary">
          {starting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {t('transfers.start')}
        </button>
      </div>

      {/* Transfers list */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wide dim">{t('transfers.title')}</span>
        {transfers.some((x) => x.status !== 'running') && (
          <button onClick={clearFinished} className="btn btn-ghost h-7 px-2 text-[11px]">
            <Trash2 className="w-3.5 h-3.5" />
            {t('transfers.clear')}
          </button>
        )}
      </div>

      {transfers.length === 0 ? (
        <div className="surface py-14 text-center">
          <ArrowLeftRight className="w-6 h-6 mx-auto mb-3 dim" />
          <span className="text-[11.5px] dim">{t('transfers.empty')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {transfers.map((transfer) => {
            const folder = transfer.filesTotal > 0 ? Math.round((transfer.filesDone / transfer.filesTotal) * 100) : 0;
            const bytes = transfer.bytesTotal > 0
              ? Math.min(100, Math.round((transfer.bytesDone / transfer.bytesTotal) * 100))
              : folder;
            const percent = transfer.bytesTotal > 0 ? bytes : folder;

            return (
              <div key={transfer.id} className="surface p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {statusBadge(transfer.status, t)}
                  <span className="text-[11.5px] font-bold truncate">
                    {transfer.source?.label} → {transfer.destination?.label}
                  </span>
                  <span className="flex-1" />
                  {transfer.status === 'running' && (
                    <button onClick={() => cancelTransfer(transfer.id)} className="btn btn-ghost h-7 px-2 text-[11px]" style={{ color: 'var(--danger)' }}>
                      <Ban className="w-3.5 h-3.5" />
                      {t('transfers.cancel')}
                    </button>
                  )}
                </div>

                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-color)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${percent}%`,
                      background:
                        transfer.status === 'failed'
                          ? 'var(--danger)'
                          : transfer.status === 'done'
                          ? 'var(--success)'
                          : 'var(--accent)'
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] dim">
                  <span>{t('transfers.filesProgress', { done: transfer.filesDone, total: transfer.filesTotal })}</span>
                  <span className="font-mono" dir="ltr">
                    {formatBytes(transfer.bytesDone)} / {formatBytes(transfer.bytesTotal)}
                  </span>
                  <span>{percent}%</span>
                </div>

                {transfer.currentFile && transfer.status === 'running' && (
                  <div className="text-[10px] dim font-mono truncate mt-1.5" dir="ltr" style={{ textAlign: 'start', unicodeBidi: 'plaintext' }}>
                    {t('transfers.current', { name: transfer.currentFile })}
                  </div>
                )}

                {transfer.error && (
                  <div className="mt-2 text-[10.5px] p-2 rounded-lg" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    {transfer.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {browser && (
        <CloudBrowser
          provider={browser.provider}
          onClose={() => setBrowser(null)}
          onSelect={(selection) => handleCloudPick(browser.side, selection)}
        />
      )}
    </div>
  );
}
