import React from 'react';
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Rocket,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';

export default function UpdateModal({
  updateInfo,
  isDownloading,
  progress,
  onStartUpdate,
  onClose
}) {
  if (!updateInfo || !updateInfo.updateAvailable) return null;

  const {
    latestVersion,
    currentVersion,
    releaseName,
    releaseNotes,
    assetSizeMB,
    htmlUrl,
    downloadUrl
  } = updateInfo;

  const percent = progress?.percent || 0;
  const transferredMB = progress?.transferredMB || '0';
  const totalMB = progress?.totalMB || assetSizeMB || '0';
  const speedMBs = progress?.speedMBs || '0';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{
        background: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <div
        className="surface w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl relative fade-in"
        style={{
          border: '1.5px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px -5px color-mix(in srgb, var(--accent) 30%, transparent)'
        }}
      >
        {/* Top Gradient Banner */}
        <div
          className="relative px-6 py-5 flex items-center justify-between border-b"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 100%)',
            borderColor: 'var(--border-color)'
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center shrink-0 shadow-lg"
              style={{
                background: 'var(--accent-gradient)',
                color: '#fff'
              }}
            >
              <Rocket className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-black tracking-tight text-white">
                  تحديث جديد متوفر
                </h3>
                <span className="badge badge-accent font-mono text-[11px] px-2 py-0.5">
                  v{latestVersion}
                </span>
              </div>
              <p className="text-[11px] dim mt-0.5 truncate">
                الإصدار الحالي لديك: <span className="font-mono font-bold">v{currentVersion}</span>
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Release Highlights */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                أبرز المميزات والإصلاحات في هذا التحديث:
              </span>
              {htmlUrl && (
                <a
                  href={htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10.5px] font-bold dim hover:text-accent flex items-center gap-1 transition-colors"
                >
                  عرض على GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div
              className="p-3.5 rounded-xl text-[11.5px] leading-relaxed max-h-48 overflow-y-auto font-sans"
              style={{
                background: 'color-mix(in srgb, var(--bg-main) 70%, transparent)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)'
              }}
            >
              {releaseNotes ? (
                <div className="whitespace-pre-wrap dir-rtl">{releaseNotes}</div>
              ) : (
                <p className="dim text-center py-2">تحسينات شاملة للأداء وسرعة الرفع واستقرار المزامنة وحماية المتصفح.</p>
              )}
            </div>
          </div>

          {/* Download Progress State */}
          {isDownloading ? (
            <div
              className="p-4 rounded-xl flex flex-col gap-3"
              style={{
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-2 text-white">
                  <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
                  جاري تحميل التحديث تلقائياً...
                </span>
                <span className="font-mono font-black text-accent text-[13px]">
                  {percent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-2.5 w-full rounded-full overflow-hidden bg-slate-800 border border-slate-700/60 p-[1px]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${percent}%`,
                    background: 'var(--accent-gradient)'
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] dim font-mono" dir="ltr">
                <span>{transferredMB} MB / {totalMB} MB</span>
                <span>{speedMBs} MB/s</span>
              </div>

              <p className="text-[11px] dim leading-relaxed text-center mt-1">
                بمجرد اكتمال التحميل، سيتم إغلاق التطبيق وتثبيت الإصدار الجديد فوراً وإعادة التشغيل تلقائياً.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onStartUpdate(downloadUrl)}
                className="btn btn-primary w-full py-3 text-[13px] font-extrabold flex items-center justify-center gap-2.5 shadow-lg cursor-pointer"
                style={{
                  boxShadow: '0 10px 25px -5px color-mix(in srgb, var(--accent) 50%, transparent)'
                }}
              >
                <Download className="w-4 h-4" strokeWidth={2.4} />
                <span>تحديث البرنامج تلقائياً الآن بنقرة واحدة</span>
                {assetSizeMB && <span className="font-mono font-normal opacity-85 text-[11px]">({assetSizeMB} MB)</span>}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn w-full py-2 text-[11.5px] font-bold dim hover:text-white transition-colors cursor-pointer"
              >
                تذكيري لاحقاً
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
