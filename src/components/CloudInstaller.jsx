import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Minus,
  FolderOpen,
  Check,
  RefreshCw,
  CloudDownload,
  ArrowLeft
} from 'lucide-react';

export default function CloudInstaller() {
  const [step, setStep] = useState(1); // 1: Ready, 2: Installing, 3: Completed
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('جاهز للبدء');
  const [installPath, setInstallPath] = useState('C:\\Users\\samer\\AppData\\Local\\Programs\\AuraSync');
  const [errorText, setErrorText] = useState(null);
  const [version, setVersion] = useState('1.7.86');
  const [isAutoUpdate, setIsAutoUpdate] = useState(false);
  const unsubscribeRef = useRef(null);
  const intervalRef = useRef(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (window.electronAPI?.getInstallerInfo) {
      window.electronAPI.getInstallerInfo().then((info) => {
        if (info?.defaultInstallDir) {
          setInstallPath(info.defaultInstallDir);
        }
        if (info?.appVersion) {
          setVersion(info.appVersion);
        }
        if (info?.isAutoUpdate && !autoStartedRef.current) {
          autoStartedRef.current = true;
          setIsAutoUpdate(true);
          setTimeout(() => {
            startInstallation(info.defaultInstallDir || installPath, true);
          }, 350);
        }
      }).catch(() => {});
    } else if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setVersion(v);
      }).catch(() => {});
    }
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    } else {
      window.close();
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const pickInstallDir = async () => {
    if (!window.electronAPI?.selectFolderDialog) return;
    try {
      const picked = await window.electronAPI.selectFolderDialog();
      if (!picked?.path) return;
      const base = picked.path.replace(/[\\/]+$/, '');
      const target = /[\\/]AuraSync$/i.test(base) ? base : `${base}\\AuraSync`;
      setInstallPath(target);
    } catch (_) {}
  };

  const startInstallation = async (overridePath = null, isAuto = false) => {
    setErrorText(null);
    setStep(2);
    setProgress(4);
    setStatusText(isAuto || isAutoUpdate ? 'جاري تحديث ملفات البرنامج تلقائياً...' : 'جاري التحضير...');

    const targetDirectory = overridePath || installPath;

    try {
      if (window.electronAPI?.runInstall) {
        if (window.electronAPI.onInstallProgress) {
          if (unsubscribeRef.current) unsubscribeRef.current();
          unsubscribeRef.current = window.electronAPI.onInstallProgress((data) => {
            if (data?.percent != null) setProgress(data.percent);
            if (data?.status) setStatusText(data.status);
          });
        }

        const res = await window.electronAPI.runInstall({
          installDir: targetDirectory,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          autoStart: true
        });

        if (res?.success) {
          setProgress(100);
          setStatusText(isAuto || isAutoUpdate ? 'تم التحديث بنجاح! جاري تشغيل AuraSync...' : 'تم التثبيت');
          setTimeout(() => {
            setStep(3);
            if (isAuto || isAutoUpdate) {
              setTimeout(() => {
                if (window.electronAPI?.launchInstalledApp) {
                  window.electronAPI.launchInstalledApp(targetDirectory);
                }
                handleClose();
              }, 800);
            }
          }, 600);
        } else {
          setErrorText(`تعذّر إكمال التثبيت: ${res?.error || 'سبب غير معروف'}`);
          setStep(1);
          setProgress(0);
          setStatusText('جاهز للبدء');
        }
      } else {
        // Fallback simulation for live preview
        let p = 4;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          p += 8;
          if (p >= 100) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setProgress(100);
            setStatusText('تم التثبيت');
            setTimeout(() => setStep(3), 600);
          } else {
            setProgress(p);
            if (p < 30) setStatusText('جاري التحضير...');
            else if (p < 80) setStatusText('جاري نسخ الملفات...');
            else setStatusText('جاري الإنهاء...');
          }
        }, 220);
      }
    } catch (err) {
      console.error('Installation error:', err);
      setErrorText(`تعذّر إكمال التثبيت: ${err.message}`);
      setStep(1);
      setProgress(0);
      setStatusText('جاهز للبدء');
    }
  };

  const handleFinish = async () => {
    if (window.electronAPI?.launchInstalledApp) {
      await window.electronAPI.launchInstalledApp(installPath);
    }
    handleClose();
  };

  const title = isAutoUpdate
    ? (step === 3 ? 'تم تحديث AuraSync بنجاح!' : 'تحديث AuraSync التلقائي')
    : (step === 1 ? 'جاهز لتثبيت AuraSync' : step === 2 ? 'جاري تثبيت AuraSync' : 'تم التثبيت بنجاح');
  const subtitle = isAutoUpdate
    ? (step === 3 ? 'جاري إعادة تشغيل النسخة الجديدة تلقائياً...' : 'جاري تثبيت التحديث الأخير دون أي تدخل...')
    : (step === 1
      ? 'اختر مسار التثبيت على جهازك للمتابعة.'
      : step === 2
      ? 'جاري نسخ ملفات البرنامج وإعداد التشغيل...'
      : 'أصبح AuraSync جاهزاً لحماية ملفاتك فوراً.');

  const progressWidth = step === 1 ? 0 : step === 3 ? 100 : Math.max(progress, 3);

  return (
    <div
      dir="rtl"
      className="w-screen h-screen flex items-center justify-center bg-transparent select-none overflow-hidden"
      style={{ fontFamily: "'Cairo', 'Segoe UI', system-ui, sans-serif", padding: 10 }}
    >
      <div
        className="window-drag-region relative w-full h-full flex flex-col overflow-hidden fade-in bg-white"
        style={{
          borderRadius: 20,
          background: 'linear-gradient(180deg, #ffffff 0%, #f6faff 55%, #eaf4fd 100%)',
          border: '1px solid #dbeafe',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(186, 230, 253, 0.5)'
        }}
      >
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 h-[48px] shrink-0 border-b border-sky-100 bg-white">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-sky-50 border border-sky-200/70 grid place-items-center shadow-xs">
              <CloudDownload className="w-3.5 h-3.5 text-sky-600" strokeWidth={2.2} />
            </span>
            <span className="text-[13px] font-bold text-slate-800 tracking-tight">
              AuraSync
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-sky-50 border border-sky-200/60 text-sky-700 shadow-2xs">
              v{version}
            </span>
          </div>

          <div className="flex items-center gap-1 window-no-drag">
            <button
              onClick={handleMinimize}
              className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-sky-50 transition-colors cursor-pointer"
              title="تصغير"
            >
              <Minus className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
            <button
              onClick={handleClose}
              disabled={step === 2}
              className="w-7 h-7 rounded-lg grid place-items-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
              title={step === 2 ? 'لا يمكن الإغلاق أثناء التثبيت' : 'إغلاق'}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 min-h-0">
          {/* Hero Icon */}
          <div className="mb-3">
            <div
              className={`w-[54px] h-[54px] rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm ${
                step === 3
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-600'
                  : 'bg-white border border-sky-200 text-sky-600 shadow-sky-100'
              }`}
            >
              {step === 3 ? (
                <Check className="w-7 h-7 text-emerald-600" strokeWidth={2.6} />
              ) : step === 2 ? (
                <RefreshCw className="w-6 h-6 text-sky-600 animate-spin" strokeWidth={2.2} />
              ) : (
                <CloudDownload className="w-7 h-7 text-sky-600" strokeWidth={2} />
              )}
            </div>
          </div>

          <h2 className="text-[18px] font-bold text-slate-900 tracking-tight text-center">
            {title}
          </h2>
          <p className="text-[12px] mt-1 text-slate-500 text-center font-normal max-w-[360px]">
            {subtitle}
          </p>

          {/* Step 1: Install Location Card */}
          {step === 1 && (
            <div className="w-full max-w-[420px] mt-4 window-no-drag">
              <div className="rounded-xl p-3 border border-sky-200/80 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11.5px]">
                    <FolderOpen className="w-3.5 h-3.5 text-sky-600" />
                    <span>مسار التثبيت</span>
                  </div>
                  <button
                    type="button"
                    onClick={pickInstallDir}
                    className="text-sky-600 hover:text-sky-700 text-[11px] font-semibold transition-colors cursor-pointer hover:underline"
                  >
                    تغيير المسار
                  </button>
                </div>
                <div
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 truncate dir-ltr select-all"
                  dir="ltr"
                  title={installPath}
                >
                  {installPath}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Progress Bar */}
          {step === 2 && (
            <div className="w-full max-w-[400px] mt-6 window-no-drag">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-300"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-sky-600 animate-pulse" />
                  <span>{statusText}</span>
                </div>
                <span className="font-mono font-bold text-sky-600" dir="ltr">
                  {progressWidth}%
                </span>
              </div>
            </div>
          )}

          {/* Step 3: Success Card */}
          {step === 3 && (
            <div className="w-full max-w-[400px] mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center shadow-xs">
              <p className="text-xs font-semibold text-emerald-800">
                تم تثبيت AuraSync v{version} بنجاح
              </p>
              <p className="text-[11px] font-mono text-emerald-700/90 truncate mt-1" dir="ltr">
                {installPath}
              </p>
            </div>
          )}

          {step === 1 && errorText && (
            <div className="mt-3 w-full max-w-[400px] text-[11px] font-semibold text-center text-rose-700 bg-rose-50 py-1.5 px-3 rounded-lg border border-rose-200">
              {errorText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between px-6 h-[58px] shrink-0 border-t border-sky-100 bg-white window-no-drag">
          <button
            onClick={handleClose}
            disabled={step === 2}
            className="h-8 px-3.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-30 cursor-pointer"
          >
            إلغاء
          </button>

          <button
            onClick={() => {
              if (step === 1) startInstallation();
              else if (step === 3) handleFinish();
            }}
            disabled={step === 2}
            className={`h-8 px-4 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-75 cursor-pointer shadow-md ${
              step === 3
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 shadow-blue-500/25'
            }`}
          >
            {step === 3 ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                <span>تشغيل البرنامج</span>
              </>
            ) : step === 2 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>جاري التثبيت...</span>
              </>
            ) : (
              <>
                <span>التالي</span>
                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
