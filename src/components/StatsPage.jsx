import React, { useEffect, useState } from 'react';
import { BarChart3, UploadCloud, Database, ShieldCheck, Archive, Activity } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

const STATUS_COLORS = {
  synced: '#34d399',
  pending: '#fbbf24',
  syncing: '#fbbf24',
  failed: '#fb7185',
  preserved_on_drive: '#60a5fa',
  deleted_on_drive: '#94a3b8'
};

export default function StatsPage({ stats }) {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState({ uploadedBytesTotal: 0, uploadsCount: 0, daily: [] });
  const [files, setFiles] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.electronAPI?.getMetrics) {
          const m = await window.electronAPI.getMetrics();
          if (alive && m) setMetrics(m);
        }
        const list = await window.electronAPI.getFiles({ limit: 800, offset: 0 });
        if (alive && list) setFiles(list);
      } catch (_) {}
    })();
    return () => {
      alive = false;
    };
  }, [stats]);

  const maxDaily = Math.max(1, ...(metrics.daily || []).map((d) => d.bytes || 0));

  const cards = [
    {
      icon: UploadCloud,
      label: t('stats.uploadedTotal'),
      value: formatBytes(metrics.uploadedBytesTotal || 0),
      color: 'var(--accent)'
    },
    {
      icon: Activity,
      label: t('stats.uploadsCount'),
      value: String(metrics.uploadsCount || 0),
      color: '#8b5cf6'
    },
    {
      icon: Database,
      label: t('stats.protectedNow'),
      value: formatBytes(stats.totalBytes || 0),
      color: '#22d3ee'
    },
    {
      icon: ShieldCheck,
      label: t('stats.preservedFiles'),
      value: String(stats.preservedFiles || 0),
      color: '#60a5fa'
    }
  ];

  return (
    <div className="fade-in flex flex-col gap-5 max-w-4xl">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="surface p-4 flex flex-col gap-2.5">
            <span
              className="w-9 h-9 rounded-xl grid place-items-center"
              style={{ background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color }}
            >
              <c.icon className="w-[17px] h-[17px]" strokeWidth={2.2} />
            </span>
            <div className="text-[19px] font-black tracking-tight" dir="ltr" style={{ textAlign: 'start' }}>
              {c.value}
            </div>
            <div className="text-[10.5px] font-bold dim">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Protection mosaic */}
      <section className="surface p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)'
            }}
          >
            <BarChart3 className="w-[17px] h-[17px]" strokeWidth={2.2} />
          </div>
          <div>
            <h2 className="text-[13.5px] font-extrabold tracking-tight">{t('stats.mosaicTitle')}</h2>
            <p className="text-[10.5px] dim mt-0.5">{t('stats.mosaicDesc')}</p>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="py-8 text-center text-[11.5px] dim">{t('stats.mosaicEmpty')}</div>
        ) : (
          <>
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(13px, 1fr))' }}
            >
              {files.slice(0, 700).map((f, i) => (
                <span
                  key={i}
                  title={`${f.relative_path} — ${f.status}`}
                  className="rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    background: STATUS_COLORS[f.status] || '#64748b',
                    opacity: 0.9
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] dim">
              {[
                ['synced', t('stats.legendSynced')],
                ['pending', t('stats.legendPending')],
                ['failed', t('stats.legendFailed')],
                ['preserved_on_drive', t('stats.legendPreserved')],
                ['deleted_on_drive', t('stats.legendDeleted')]
              ].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: STATUS_COLORS[key] }} />
                  {label}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Weekly uploads */}
      <section className="surface p-5">
        <h2 className="text-[13.5px] font-extrabold tracking-tight mb-4">{t('stats.weekTitle')}</h2>
        <div className="flex items-end justify-between gap-2 h-[130px]">
          {(metrics.daily || []).map((d, i) => {
            const h = Math.max(3, Math.round(((d.bytes || 0) / maxDaily) * 100));
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-[9px] font-mono dim" dir="ltr">
                  {d.bytes > 0 ? formatBytes(d.bytes) : ''}
                </span>
                <div
                  className="w-full max-w-[46px] rounded-t-lg transition-all"
                  style={{
                    height: `${h}%`,
                    background: 'var(--accent-gradient)',
                    boxShadow: '0 6px 16px -8px color-mix(in srgb, var(--accent) 80%, transparent)'
                  }}
                />
                <span className="text-[9.5px] font-bold dim" dir="ltr">
                  {d.date}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
