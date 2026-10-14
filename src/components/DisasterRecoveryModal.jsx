import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Cloud,
  Folder,
  CheckCircle2,
  AlertTriangle,
  FolderSync,
  ArrowRight,
  HardDrive,
  Laptop,
  X,
  Loader2,
  ChevronRight,
  Sparkles,
  DownloadCloud,
  FolderOpen,
  ArrowDownToLine,
  Check,
  ExternalLink
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

export default function DisasterRecoveryModal({
  isOpen,
  onClose,
  providers = [],
  onRestoredSuccess,
  showToast
}) {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';

  const [step, setStep] = useState('scanning'); // 'scanning' | 'configure' | 'restoring' | 'completed'
  const [backups, setBackups] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState(new Set());
  const [folderTargetPaths, setFolderTargetPaths] = useState({});
  const [autoWatch, setAutoWatch] = useState(true);
  const [skipExisting, setSkipExisting] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState('smart'); // 'smart' | 'consolidated' | 'custom'
  const [consolidatedBaseDir, setConsolidatedBaseDir] = useState('');
  const [manifestMachine, setManifestMachine] = useState(null);

  // Progress state
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Load backups when modal opens
  useEffect(() => {
    if (!isOpen) {
      setStep('scanning');
      setBackups([]);
      setProgress(null);
      setResult(null);
      setIsCancelling(false);
      return;
    }

    let isMounted = true;
    const fetchBackups = async () => {
      setStep('scanning');
      try {
        if (!window.electronAPI?.disasterRecoveryScan) {
          throw new Error('Disaster Recovery API not available');
        }
        const res = await window.electronAPI.disasterRecoveryScan();
        if (!isMounted) return;

        if (res && res.success && Array.isArray(res.backups)) {
          setBackups(res.backups);
          const defaultSelected = new Set();
          const targetPaths = {};

          let foundMachine = null;
          for (const b of res.backups) {
            defaultSelected.add(b.cloudFolderId);
            targetPaths[b.cloudFolderId] = b.suggestedPath || '';
            if (b.originalMachine && !foundMachine) {
              foundMachine = b.originalMachine;
            }
          }
          setManifestMachine(foundMachine);
          setSelectedFolderIds(defaultSelected);
          setFolderTargetPaths(targetPaths);
          setStep('configure');
        } else {
          setBackups([]);
          setStep('configure');
          if (res?.error) {
            showToast?.(res.error, 'error');
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setStep('configure');
        showToast?.(err.message, 'error');
      }
    };

    fetchBackups();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Listen to live progress from Electron backend
  useEffect(() => {
    if (!isOpen || !window.electronAPI?.onDisasterRecoveryProgress) return;
    const unsub = window.electronAPI.onDisasterRecoveryProgress((data) => {
      setProgress(data);
      if (data.status === 'completed') {
        setStep('completed');
      } else if (data.status === 'aborted') {
        showToast?.(t('recovery.cancelling'), 'info');
        setStep('configure');
      } else if (data.status === 'error') {
        showToast?.(data.error || 'Recovery failed', 'error');
      }
    });
    return unsub;
  }, [isOpen, t, showToast]);

  if (!isOpen) return null;

  const toggleSelectFolder = (folderId) => {
    const next = new Set(selectedFolderIds);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setSelectedFolderIds(next);
  };

  const handleSelectAll = (select) => {
    if (select) {
      setSelectedFolderIds(new Set(backups.map((b) => b.cloudFolderId)));
    } else {
      setSelectedFolderIds(new Set());
    }
  };

  const handleChangeCustomPath = async (backupItem) => {
    if (!window.electronAPI?.disasterRecoverySelectPath) return;
    try {
      const current = folderTargetPaths[backupItem.cloudFolderId] || backupItem.suggestedPath;
      const chosen = await window.electronAPI.disasterRecoverySelectPath(backupItem.folderName, current);
      if (chosen) {
        setFolderTargetPaths((prev) => ({
          ...prev,
          [backupItem.cloudFolderId]: chosen
        }));
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const handleChooseConsolidatedBase = async () => {
    if (!window.electronAPI?.disasterRecoverySelectPath) return;
    try {
      const chosen = await window.electronAPI.disasterRecoverySelectPath('AuraSync-Restore', consolidatedBaseDir);
      if (chosen) {
        setConsolidatedBaseDir(chosen);
        // Apply base dir to all folders
        setFolderTargetPaths((prev) => {
          const updated = { ...prev };
          for (const b of backups) {
            updated[b.cloudFolderId] = `${chosen}\\${b.folderName}`;
          }
          return updated;
        });
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const handleModeChange = (mode) => {
    setRecoveryMode(mode);
    if (mode === 'smart') {
      const resetPaths = {};
      for (const b of backups) {
        resetPaths[b.cloudFolderId] = b.suggestedPath;
      }
      setFolderTargetPaths(resetPaths);
    } else if (mode === 'consolidated' && consolidatedBaseDir) {
      const consolidatedPaths = {};
      for (const b of backups) {
        consolidatedPaths[b.cloudFolderId] = `${consolidatedBaseDir}\\${b.folderName}`;
      }
      setFolderTargetPaths(consolidatedPaths);
    }
  };

  const handleStartRecovery = async () => {
    const selectedBackups = backups.filter((b) => selectedFolderIds.has(b.cloudFolderId));
    if (selectedBackups.length === 0) {
      showToast?.(t('recovery.noBackups'), 'warning');
      return;
    }

    const plan = selectedBackups.map((b) => ({
      providerId: b.providerId,
      cloudFolderId: b.cloudFolderId,
      folderName: b.folderName,
      targetPath: folderTargetPaths[b.cloudFolderId] || b.suggestedPath,
      autoWatch
    }));

    setStep('restoring');
    setIsCancelling(false);

    try {
      const res = await window.electronAPI.disasterRecoveryStart(plan, {
        skipExisting,
        concurrency: 4
      });

      if (res && res.success) {
        setResult(res);
        setStep('completed');
        onRestoredSuccess?.();
      } else if (res && res.aborted) {
        setStep('configure');
      } else {
        showToast?.(res?.error || 'Recovery error', 'error');
        setStep('configure');
      }
    } catch (err) {
      showToast?.(err.message, 'error');
      setStep('configure');
    }
  };

  const handleCancel = async () => {
    if (!window.electronAPI?.disasterRecoveryCancel) return;
    setIsCancelling(true);
    try {
      await window.electronAPI.disasterRecoveryCancel();
    } catch (_) {}
  };

  const handleOpenFolder = (targetPath) => {
    if (window.electronAPI?.openPath && targetPath) {
      window.electronAPI.openPath(targetPath);
    }
  };

  const selectedCount = selectedFolderIds.size;
  const selectedBytes = backups
    .filter((b) => selectedFolderIds.has(b.cloudFolderId))
    .reduce((sum, b) => sum + (b.totalBytes || 0), 0);
  const selectedFiles = backups
    .filter((b) => selectedFolderIds.has(b.cloudFolderId))
    .reduce((sum, b) => sum + (b.fileCount || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(5, 10, 20, 0.78)',
        backdropFilter: 'blur(10px)'
      }}
    >
      <div
        className="surface w-full max-w-2xl fade-in rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border"
        style={{
          borderColor: 'rgba(6, 182, 212, 0.35)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 35px rgba(6, 182, 212, 0.15)'
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4.5 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(59, 130, 246, 0.2) 100%)',
                borderColor: 'rgba(6, 182, 212, 0.45)',
                color: '#38bdf8'
              }}
            >
              <RotateCcw className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-extrabold text-slate-100 tracking-tight">
                  {t('recovery.title')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  1-Click Migration
                </span>
              </div>
              <p className="text-[11px] dim mt-0.5">
                {t('recovery.subtitle')}
              </p>
            </div>
          </div>
          {step !== 'restoring' && (
            <button
              onClick={onClose}
              className="btn btn-ghost btn-icon hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 scroll-area">
          {/* STEP 1: SCANNING */}
          {step === 'scanning' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center border animate-pulse"
                  style={{
                    background: 'rgba(6, 182, 212, 0.15)',
                    borderColor: 'rgba(6, 182, 212, 0.4)',
                    color: '#38bdf8'
                  }}
                >
                  <Cloud className="w-8 h-8" />
                </div>
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400 absolute -bottom-1 -right-1" />
              </div>
              <h4 className="text-[14.5px] font-extrabold text-slate-100 mb-1">
                {t('recovery.scanning')}
              </h4>
              <p className="text-[11.5px] dim max-w-sm">
                جارٍ الاتصال بالسحابة والبحث عن نسخ جهازك السابق ومجلدات النسخ الاحتياطي...
              </p>
            </div>
          )}

          {/* STEP 2: CONFIGURE & SELECT */}
          {step === 'configure' && (
            <div className="space-y-5">
              {/* Previous Machine Manifest Detected Banner */}
              {manifestMachine && (
                <div
                  className="p-3.5 rounded-xl border flex items-center gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.12) 100%)',
                    borderColor: 'rgba(16, 185, 129, 0.35)'
                  }}
                >
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-extrabold text-emerald-300">
                      {t('recovery.manifestBadge', { machine: manifestMachine })}
                    </div>
                    <div className="text-[11px] dim mt-0.5">
                      تم العثور على البصمة الكاملة لجهازك السابق، وتم التعرف على المسارات الأصلية تلقائياً.
                    </div>
                  </div>
                </div>
              )}

              {/* Mode Selection Chips */}
              <div>
                <label className="text-[11.5px] font-bold block mb-2 text-slate-300">
                  نوع الاستعادة المقترح:
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Mode 1: Smart Native */}
                  <button
                    type="button"
                    onClick={() => handleModeChange('smart')}
                    className={`p-3 rounded-xl border text-start transition-all ${
                      recoveryMode === 'smart'
                        ? 'border-cyan-400 bg-cyan-500/15 shadow-sm'
                        : 'border-white/10 bg-surface-flat hover:bg-surface-hover'
                    }`}
                  >
                    <div className="text-[12px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{t('recovery.modeSmart')}</span>
                    </div>
                    <div className="text-[10px] dim mt-1 leading-snug">
                      {t('recovery.modeSmartDesc')}
                    </div>
                  </button>

                  {/* Mode 2: Consolidated */}
                  <button
                    type="button"
                    onClick={() => handleModeChange('consolidated')}
                    className={`p-3 rounded-xl border text-start transition-all ${
                      recoveryMode === 'consolidated'
                        ? 'border-cyan-400 bg-cyan-500/15 shadow-sm'
                        : 'border-white/10 bg-surface-flat hover:bg-surface-hover'
                    }`}
                  >
                    <div className="text-[12px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{t('recovery.modeConsolidated')}</span>
                    </div>
                    <div className="text-[10px] dim mt-1 leading-snug">
                      {t('recovery.modeConsolidatedDesc')}
                    </div>
                  </button>

                  {/* Mode 3: Custom */}
                  <button
                    type="button"
                    onClick={() => handleModeChange('custom')}
                    className={`p-3 rounded-xl border text-start transition-all ${
                      recoveryMode === 'custom'
                        ? 'border-cyan-400 bg-cyan-500/15 shadow-sm'
                        : 'border-white/10 bg-surface-flat hover:bg-surface-hover'
                    }`}
                  >
                    <div className="text-[12px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{t('recovery.modeCustom')}</span>
                    </div>
                    <div className="text-[10px] dim mt-1 leading-snug">
                      {t('recovery.modeCustomDesc')}
                    </div>
                  </button>
                </div>
              </div>

              {/* If consolidated mode selected, show base folder selector */}
              {recoveryMode === 'consolidated' && (
                <div className="p-3 rounded-xl border border-white/10 bg-surface-flat flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-slate-300 block">
                      {t('recovery.chooseBaseDir')}:
                    </span>
                    <span className="text-[11px] font-mono dim truncate block" dir="ltr">
                      {consolidatedBaseDir || 'لم يتم تحديد مجلد بعد...'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleChooseConsolidatedBase}
                    className="btn btn-secondary h-8 px-3 text-[11px]"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>تحديد مجلد الحفظ</span>
                  </button>
                </div>
              )}

              {/* Folders List Header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-extrabold text-slate-200">
                    {t('recovery.discoveredCount', { count: backups.length })}
                  </span>
                  <span className="text-[11px] dim font-mono">
                    ({selectedFiles} ملف • {formatBytes(selectedBytes)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(selectedCount !== backups.length)}
                    className="btn btn-ghost h-6 px-2 text-[10.5px] text-cyan-400"
                  >
                    {selectedCount === backups.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                  </button>
                </div>
              </div>

              {/* Folders List */}
              {backups.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-white/10 bg-surface-flat flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                  <span className="text-[12px] dim">{t('recovery.noBackups')}</span>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {backups.map((item) => {
                    const isSelected = selectedFolderIds.has(item.cloudFolderId);
                    const targetPath = folderTargetPaths[item.cloudFolderId] || item.suggestedPath;

                    return (
                      <div
                        key={item.cloudFolderId}
                        className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                          isSelected
                            ? 'border-cyan-500/30 bg-surface-hover/80'
                            : 'border-white/5 opacity-60 bg-surface-flat'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFolder(item.cloudFolderId)}
                              className="rounded border-white/20 text-cyan-500 focus:ring-0 cursor-pointer"
                            />
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                              <Folder className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold text-slate-100 truncate">
                                  {item.folderName}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-white/10 text-slate-300">
                                  {item.providerLabel}
                                </span>
                                {item.alreadyWatched && (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-500/20 text-emerald-300">
                                    مربوط حالياً
                                  </span>
                                )}
                              </div>
                              <div className="text-[10.5px] dim font-mono mt-0.5">
                                {item.fileCount} ملف • {formatBytes(item.totalBytes)}
                              </div>
                            </div>
                          </label>

                          <button
                            type="button"
                            onClick={() => handleChangeCustomPath(item)}
                            className="btn btn-ghost h-7 px-2.5 text-[10.5px] text-cyan-300 hover:text-cyan-200"
                            title="تغيير مكان الاسترجاع على الكمبيوتر"
                          >
                            <FolderOpen className="w-3 h-3" />
                            <span>{t('recovery.changePath')}</span>
                          </button>
                        </div>

                        {/* Target destination path preview */}
                        <div
                          className="px-2.5 py-1.5 rounded-lg bg-black/25 border border-white/5 flex items-center gap-2 text-[10.5px] font-mono dim truncate"
                          dir="ltr"
                        >
                          <span className="text-cyan-400 font-bold shrink-0">➔</span>
                          <span className="truncate">{targetPath}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Toggles */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoWatch}
                    onChange={(e) => setAutoWatch(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-[11.5px] font-bold text-slate-200">
                      {t('recovery.autoWatchLabel')}
                    </div>
                    <div className="text-[10.5px] dim">
                      {t('recovery.autoWatchHint')}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-[11.5px] font-bold text-slate-200">
                      {t('recovery.skipExistingLabel')}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: LIVE RESTORING */}
          {step === 'restoring' && (
            <div className="py-6 space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto mb-3">
                  <DownloadCloud className="w-7 h-7 animate-bounce" />
                </div>
                <h4 className="text-[15px] font-extrabold text-slate-100">
                  {t('recovery.restoringTitle')}
                </h4>
                <p className="text-[11.5px] dim mt-1">
                  جاري تنزيل ملفاتك وبناء مجلدات النظام بسرعة التوربو الكاملة...
                </p>
              </div>

              {/* Progress Bar & Percent */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span className="text-slate-300">
                    {progress?.percent || 0}% مكتمل
                  </span>
                  {progress?.speedBytesPerSec > 0 && (
                    <span className="text-cyan-400 font-mono" dir="ltr">
                      ⚡ {formatBytes(progress.speedBytesPerSec)}/s
                    </span>
                  )}
                </div>

                <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300 relative"
                    style={{ width: `${progress?.percent || 0}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] dim font-mono">
                  <span>
                    الملفات: {progress?.processedFiles || 0} / {progress?.totalFiles || 0}
                  </span>
                  <span>
                    البيانات: {formatBytes(progress?.downloadedBytes || 0)} / {formatBytes(progress?.totalBytes || 0)}
                  </span>
                </div>
              </div>

              {/* Current Active File Info */}
              <div className="p-3.5 rounded-xl border border-white/10 bg-surface-flat space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <span className="dim">{t('recovery.currentFolderLabel')}</span>
                  <span className="font-bold text-slate-200">
                    {progress?.currentFolder || '...'} ({progress?.folderIndex || 1} من {progress?.totalFolders || 1})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="dim">{t('recovery.currentFileLabel')}</span>
                  <span className="font-mono text-cyan-300 truncate max-w-[280px]" dir="ltr">
                    {progress?.currentFile || '...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 'completed' && (
            <div className="py-6 text-center space-y-6">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border"
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                  color: '#34d399'
                }}
              >
                <Check className="w-8 h-8" strokeWidth={3} />
              </div>

              <div>
                <h4 className="text-[16px] font-extrabold text-emerald-400">
                  {t('recovery.successTitle')}
                </h4>
                <p className="text-[12px] dim mt-1 max-w-md mx-auto">
                  {t('recovery.successDesc')}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="p-3 rounded-xl border border-white/10 bg-surface-flat">
                  <div className="text-[10px] dim">{t('recovery.statFolders')}</div>
                  <div className="text-[16px] font-extrabold text-slate-100 mt-0.5">
                    {result?.restoredFolders?.length || selectedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-surface-flat">
                  <div className="text-[10px] dim">{t('recovery.statFiles')}</div>
                  <div className="text-[16px] font-extrabold text-slate-100 mt-0.5 font-mono">
                    {result?.downloadedFiles || progress?.downloadedFiles || selectedFiles}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-white/10 bg-surface-flat">
                  <div className="text-[10px] dim">{t('recovery.statBytes')}</div>
                  <div className="text-[16px] font-extrabold text-cyan-400 mt-0.5 font-mono">
                    {formatBytes(result?.downloadedBytes || progress?.downloadedBytes || selectedBytes)}
                  </div>
                </div>
              </div>

              {/* Restored folders list with direct open buttons */}
              {result?.restoredFolders && result.restoredFolders.length > 0 && (
                <div className="max-w-md mx-auto space-y-2 text-start">
                  <div className="text-[11px] font-bold text-slate-300">
                    المجلدات المستعادة على جهازك:
                  </div>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {result.restoredFolders.map((rf) => (
                      <div
                        key={rf.id || rf.path}
                        className="p-2 rounded-lg bg-surface-flat border border-white/5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="text-[11.5px] font-bold text-slate-200 block truncate">
                            📁 {rf.name}
                          </span>
                          <span className="text-[10px] font-mono dim truncate block" dir="ltr">
                            {rf.path}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(rf.path)}
                          className="btn btn-ghost h-6 px-2 text-[10px] text-cyan-300 hover:text-cyan-200"
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>فتح</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between gap-3 bg-black/10"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {step === 'configure' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost text-[12px]"
              >
                {t('files.close')}
              </button>
              <button
                type="button"
                onClick={handleStartRecovery}
                disabled={selectedCount === 0}
                className="btn btn-primary px-6 text-[12.5px] font-bold"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('recovery.startBtn', { count: selectedCount })}</span>
              </button>
            </>
          )}

          {step === 'restoring' && (
            <>
              <div className="text-[11px] dim animate-pulse">
                جارٍ التنزيل والحفظ، يرجى عدم إغلاق التطبيق...
              </div>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="btn btn-danger h-8 px-4 text-[11.5px]"
              >
                {isCancelling ? t('recovery.cancelling') : t('recovery.cancelBtn')}
              </button>
            </>
          )}

          {step === 'completed' && (
            <div className="w-full flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary px-6 text-[12.5px] font-bold"
              >
                {t('recovery.finishBtn')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
