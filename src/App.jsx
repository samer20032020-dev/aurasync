import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
const DashboardPage = lazy(() => import('./components/DashboardPage'));
const FilesPage = lazy(() => import('./components/FilesPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AccountsPage = lazy(() => import('./components/AccountsPage'));
const ProtectionPage = lazy(() => import('./components/ProtectionPage'));
const ActivityHubPage = lazy(() => import('./components/ActivityHubPage'));
const CloudWebPage = lazy(() => import('./components/CloudWebPage'));
import QuickSearch from './components/QuickSearch';
import CloudTitleBar from './components/CloudTitleBar';
const CloudInstaller = lazy(() => import('./components/CloudInstaller'));
const VaultPage = lazy(() => import('./components/VaultPage'));
const MobileApp = lazy(() => import('./components/mobile/MobileApp'));
import UpdateModal from './components/UpdateModal';
import DisasterRecoveryModal from './components/DisasterRecoveryModal';
import { I18nProvider, translate } from './i18n';
import { Info, CheckCircle2, AlertCircle, ShieldCheck, ArrowLeftRight, X, Trash2, Cloud, CloudCog, CloudOff, Loader2, Check, FolderCog, Flame } from 'lucide-react';

export default function App() {
  const isInstaller =
    typeof window !== 'undefined' &&
    (window.location.hash === '#installer' ||
      window.location.search.includes('installer') ||
      window.location.search.includes('setup'));

  if (isInstaller) {
    return <Suspense fallback={<div className="p-8 text-center">Loading…</div>}><CloudInstaller /></Suspense>;
  }

  const [folders, setFolders] = useState([]);
  const [stats, setStats] = useState({
    totalFolders: 0,
    totalFiles: 0,
    syncedFiles: 0,
    pendingFiles: 0,
    preservedFiles: 0,
    failedFiles: 0,
    deletedFiles: 0,
    totalBytes: 0,
    syncMode: 'safe',
    zeroDeletePolicyActive: true,
  });
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    theme: 'dark',
    minimizeToTray: 'true',
    startOnBoot: 'false',
    notifications: 'true',
    language: 'ar',
    excludePatterns: '',
    maxFileSizeMB: '0',
    syncMode: 'safe'
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingFolderId, setSyncingFolderId] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [vaultNavParams, setVaultNavParams] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingSyncMode, setPendingSyncMode] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeProgress, setWipeProgress] = useState(null);
  const [wipeResetApp, setWipeResetApp] = useState(true);
  const [showFormatCloudModal, setShowFormatCloudModal] = useState(false);
  const [formatProviderId, setFormatProviderId] = useState('all');
  const [formatConfirmationText, setFormatConfirmationText] = useState('');
  const [formatAcknowledge, setFormatAcknowledge] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatProgress, setFormatProgress] = useState(null);
  const [formatResult, setFormatResult] = useState(null);
  const DEFAULT_PROVIDERS = [
    { id: 'google', type: 'google', label: 'Google Drive', configured: false, connected: false },
    { id: 'onedrive', type: 'onedrive', label: 'OneDrive', configured: false, connected: false },
    { id: 'dropbox', type: 'dropbox', label: 'Dropbox', configured: false, connected: false }
  ];
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);
  const [busyProvider, setBusyProvider] = useState(null);
  const [pendingFolder, setPendingFolder] = useState(null);
  const [nameConflict, setNameConflict] = useState(null);
  const [overlapConflict, setOverlapConflict] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDeleteModal, setFolderDeleteModal] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('1.7.102');
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [remoteFolders, setRemoteFolders] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDisasterRecoveryModal, setShowDisasterRecoveryModal] = useState(false);

  // Ctrl+K global quick search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (window.electronAPI.isWindowMaximized) {
      window.electronAPI.isWindowMaximized().then((max) => setIsMaximized(!!max)).catch(() => {});
    }
    if (window.electronAPI.getAppVersion) {
      window.electronAPI.getAppVersion().then((v) => v && setAppVersion(String(v))).catch(() => {});
    }
    if (window.electronAPI.onMaximizedChange) {
      const unsub = window.electronAPI.onMaximizedChange((max) => {
        setIsMaximized(!!max);
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onVaultNavigate) {
      const unsub = window.electronAPI.onVaultNavigate((params) => {
        setVaultNavParams(params);
        setActivePage('vault');
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    let unsubAvailable;
    let unsubProgress;
    if (window.electronAPI.onUpdateAvailable) {
      unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
        if (info && info.updateAvailable && !info.isMobileRelease) {
          setUpdateInfo(info);
        }
      });
    }
    if (window.electronAPI.onUpdateProgress) {
      unsubProgress = window.electronAPI.onUpdateProgress((prog) => {
        if (prog) setUpdateProgress(prog);
      });
    }
    // Check GitHub releases quietly 15 seconds after launch (only for desktop)
    const t = setTimeout(() => {
      if (window.electronAPI?.checkForUpdates) {
        window.electronAPI.checkForUpdates().then((res) => {
          if (res && res.updateAvailable && !res.isMobileRelease) {
            setUpdateInfo(res);
          }
        }).catch(() => {});
      }
    }, 15000);
    return () => {
      clearTimeout(t);
      if (unsubAvailable) unsubAvailable();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  const handleCheckForUpdates = async (interactive = false) => {
    if (!window.electronAPI?.checkForUpdates) {
      if (interactive) showToast('خدمة التحديث غير متاحة خارج تطبيق سطح المكتب', 'warning');
      return null;
    }
    try {
      if (interactive) showToast('جارٍ فحص التحديثات من GitHub...', 'info');
      const res = await window.electronAPI.checkForUpdates();
      if (res && res.updateAvailable && !res.isMobileRelease) {
        setUpdateInfo(res);
        if (interactive) setShowUpdateModal(true);
        showToast(`يتوفر تحديث جديد للكمبيوتر: v${res.latestVersion}`, 'success');
      } else if (res && res.isMobileRelease) {
        setUpdateInfo({ ...res, updateAvailable: false });
        if (interactive) showToast('نسخة الكمبيوتر محدثة بالكامل (التحديث المنشور مخصص لتطبيق الهاتف فقط)', 'info');
      } else if (res && res.success === false) {
        setUpdateInfo(res);
        if (interactive) showToast(`تعذر فحص التحديثات من الخادم: ${res.error || 'خطأ في الشبكة'}`, 'error');
      } else {
        setUpdateInfo(res);
        if (interactive) showToast('أنت تستخدم أحدث إصدار للكمبيوتر بالفعل!', 'success');
      }
      return res;
    } catch (err) {
      if (interactive) showToast(`فشل فحص التحديثات: ${err.message}`, 'error');
      return null;
    }
  };

  const handleStartUpdate = async (downloadUrlOverride = null) => {
    const targetUrl = downloadUrlOverride || updateInfo?.downloadUrl;
    if (!targetUrl || !window.electronAPI?.startUpdateDownload) {
      showToast('رابط ملف التحديث غير متوفر', 'error');
      return;
    }
    try {
      setIsDownloadingUpdate(true);
      showToast('بدأ تحميل التحديث وتثبيته تلقائياً...', 'info');
      const res = await window.electronAPI.startUpdateDownload(targetUrl);
      if (!res || !res.success) {
        setIsDownloadingUpdate(false);
        showToast(`فشل تثبيت التحديث: ${res?.error || 'خطأ غير معروف'}`, 'error');
      }
    } catch (err) {
      setIsDownloadingUpdate(false);
      showToast(`خطأ أثناء التحديث: ${err.message}`, 'error');
    }
  };

  const mainScrollRef = useRef(null);
  const languageRef = useRef('ar');
  const toastTimerRef = useRef(null);
  const activeUploadsRef = useRef(0);
  const lastSentRef = useRef(new Map());
  const speedSamplesRef = useRef([]);

  useEffect(() => {
    languageRef.current = settings.language || 'ar';
  }, [settings.language]);

  const t = (key, vars) => translate(settings.language, key, vars);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 4000);
  };

  const fetchRemoteFolders = async (silent = false) => {
    if (!window.electronAPI?.getRemoteCloudFolders) return;
    if (!silent) setRemoteLoading(true);
    try {
      const res = await window.electronAPI.getRemoteCloudFolders();
      if (res && res.success) {
        setRemoteFolders(res.remoteFolders || []);
      }
    } catch (e) {
      console.warn('Failed to fetch remote cloud folders:', e.message);
    } finally {
      if (!silent) setRemoteLoading(false);
    }
  };

  const refreshAllData = async () => {
    if (!window.electronAPI) return;

    try {
      const [foldersRes, statsRes, logsRes, settingsRes, providersRes, remoteRes] = await Promise.allSettled([
        window.electronAPI.getFolders ? window.electronAPI.getFolders() : Promise.resolve(null),
        window.electronAPI.getAppStats ? window.electronAPI.getAppStats() : Promise.resolve(null),
        window.electronAPI.getLogs ? window.electronAPI.getLogs(200) : Promise.resolve(null),
        window.electronAPI.getSettings ? window.electronAPI.getSettings() : Promise.resolve(null),
        window.electronAPI.getProviders ? window.electronAPI.getProviders() : Promise.resolve(null),
        window.electronAPI.getRemoteCloudFolders ? window.electronAPI.getRemoteCloudFolders() : Promise.resolve(null),
      ]);

      if (foldersRes.status === 'fulfilled' && foldersRes.value) setFolders(foldersRes.value);
      if (statsRes.status === 'fulfilled' && statsRes.value) setStats(statsRes.value);
      if (logsRes.status === 'fulfilled' && logsRes.value) setLogs(logsRes.value);
      if (settingsRes.status === 'fulfilled' && settingsRes.value) setSettings(settingsRes.value);
      if (providersRes.status === 'fulfilled' && Array.isArray(providersRes.value)) {
        setProviders(providersRes.value);
      }
      if (remoteRes.status === 'fulfilled' && remoteRes.value && remoteRes.value.success) {
        setRemoteFolders(remoteRes.value.remoteFolders || []);
      }
    } catch (err) {
      console.error('Error refreshing app data:', err);
    }
  };

  // Sync theme changes with DOM
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-midnight', 'theme-dark', 'theme-light', 'dark');
    if (settings.theme === 'light') {
      root.classList.add('theme-light');
    } else if (settings.theme === 'midnight') {
      root.classList.add('theme-midnight', 'dark');
    } else {
      root.classList.add('theme-dark', 'dark');
    }
  }, [settings.theme]);

  // Sync language/direction with DOM
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', settings.language === 'en' ? 'en' : 'ar');
    root.setAttribute('dir', settings.language === 'en' ? 'ltr' : 'rtl');
  }, [settings.language]);

  // Reset scroll position to top whenever active page changes
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activePage]);

  // Keyboard navigation & Zoom Lock listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (
          ['=', '+', '-', '_', '0', 'Add', 'Subtract'].includes(e.key) ||
          ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code)
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

      const container = mainScrollRef.current;
      if (!container) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        container.scrollBy({ top: 120, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        container.scrollBy({ top: -120, behavior: 'smooth' });
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        container.scrollBy({ top: container.clientHeight * 0.75, behavior: 'smooth' });
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        container.scrollBy({ top: -container.clientHeight * 0.75, behavior: 'smooth' });
      } else if (e.key === 'Home') {
        e.preventDefault();
        container.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'End') {
        e.preventDefault();
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('gesturestart', preventGesture);
    window.addEventListener('gesturechange', preventGesture);
    window.addEventListener('gestureend', preventGesture);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
      window.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  useEffect(() => {
    refreshAllData();

    if (!window.electronAPI) return;

    let pendingLogs = [];
    let logFlushTimer = null;
    const cleanupLog = window.electronAPI.onNewLog((newLog) => {
      pendingLogs.unshift(newLog);
      if (!logFlushTimer) {
        logFlushTimer = setTimeout(() => {
          logFlushTimer = null;
          const toAdd = pendingLogs;
          pendingLogs = [];
          setLogs((prev) => [...toAdd, ...prev].slice(0, 500));
        }, 120);
      }
    });

    let folderRefreshTimer = null;
    const cleanupStats = window.electronAPI.onStatsUpdated((newStats) => {
      setStats(newStats);
      if (folderRefreshTimer) clearTimeout(folderRefreshTimer);
      folderRefreshTimer = setTimeout(() => {
        folderRefreshTimer = null;
        window.electronAPI.getFolders().then((f) => f && setFolders(f)).catch(() => {});
      }, 350);
    });

    const cleanupSyncing = window.electronAPI.onFileSyncing(() => {
      activeUploadsRef.current += 1;
      setIsSyncing(true);
    });

    const cleanupSynced = window.electronAPI.onFileSynced(() => {
      activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
      if (activeUploadsRef.current === 0) setIsSyncing(false);
    });

    const cleanupFailed = window.electronAPI.onFileFailed((data) => {
      activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
      if (activeUploadsRef.current === 0) setIsSyncing(false);
      showToast(translate(languageRef.current, 'app.uploadFailed', { error: data.error }), 'error');
    });

    // Live upload speed (MB/s) from per-file progress deltas
    const cleanupProgress = window.electronAPI.onFileProgress
      ? window.electronAPI.onFileProgress((data) => {
          if (!data || data.restoring || typeof data.sent !== 'number') return;
          const key = data.filePath || data.relativePath || 'file';
          const prev = lastSentRef.current.get(key) || 0;
          const delta = Math.max(0, data.sent - prev);
          lastSentRef.current.set(key, data.sent);
          const now = Date.now();
          speedSamplesRef.current.push({ t: now, bytes: delta });
          const cutoff = now - 3000;
          if (speedSamplesRef.current.length > 400) {
            speedSamplesRef.current = speedSamplesRef.current.filter((s) => s.t >= cutoff);
          }
        })
      : null;

    const speedInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 3000;
      const samples = speedSamplesRef.current.filter((s) => s.t >= cutoff);
      speedSamplesRef.current = samples;
      const bytes = samples.reduce((sum, s) => sum + s.bytes, 0);
      setUploadSpeed(bytes > 0 ? Math.round(bytes / 3) : 0);
    }, 900);

    const cleanupQuota = window.electronAPI.onQuotaWarning
      ? window.electronAPI.onQuotaWarning(() => {
          showToast(translate(languageRef.current, 'app.quotaFull'), 'error');
        })
      : null;

    const cleanupFoldersUpdated = window.electronAPI.onFoldersUpdated
      ? window.electronAPI.onFoldersUpdated(() => {
          refreshAllData();
        })
      : null;

    const cleanupFormatProgress = window.electronAPI.onCloudFormatProgress
      ? window.electronAPI.onCloudFormatProgress((progress) => {
          setFormatProgress(progress);
        })
      : null;

    const cleanupWipeProgress = window.electronAPI.onCloudWipeProgress
      ? window.electronAPI.onCloudWipeProgress((progress) => {
          setWipeProgress(progress);
        })
      : null;

    const interval = setInterval(refreshAllData, 15000);

    return () => {
      if (logFlushTimer) clearTimeout(logFlushTimer);
      if (folderRefreshTimer) clearTimeout(folderRefreshTimer);
      cleanupLog();
      cleanupStats();
      cleanupSyncing();
      cleanupSynced();
      cleanupFailed();
      if (cleanupProgress) cleanupProgress();
      if (cleanupQuota) cleanupQuota();
      if (cleanupFoldersUpdated) cleanupFoldersUpdated();
      if (cleanupFormatProgress) cleanupFormatProgress();
      if (cleanupWipeProgress) cleanupWipeProgress();
      clearInterval(interval);
      clearInterval(speedInterval);
    };
  }, []);

  const handleQuickConnect = async (providerId) => {
    if (!window.electronAPI?.connectProvider) return;
    setBusyProvider(providerId);
    showToast(t('app.openingBrowser'), 'info');
    try {
      const res = await window.electronAPI.connectProvider(providerId);
      if (res && res.success) {
        showToast(t('accounts.connectSuccess'), 'success');
        await refreshAllData();
      } else {
        showToast(t('accounts.connectFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('accounts.connectFailed', { error: err.message }), 'error');
    } finally {
      setBusyProvider(null);
    }
  };

  const addFolderNow = async (selected, providerId, cloudName, options = {}) => {
    try {
      const res = await window.electronAPI.addFolder(selected.path, cloudName, providerId, options);
      if (res.success) {
        showToast(t('app.folderAdded', { name: cloudName }), 'success');
        setPendingFolder(null);
        setNameConflict(null);
        await refreshAllData();
      } else {
        showToast(t('app.folderAddFailed', { error: res.error }), 'error');
      }
    } catch (err) {
      showToast(t('app.folderAddError', { error: err.message }), 'error');
    }
  };

  const addFolderWithProvider = async (selected, providerId, skipOverlap = false) => {
    // Guard: nested folders upload the same files twice
    if (!skipOverlap) {
      const normalize = (p) => String(p || '').toLowerCase().replace(/[\\/]+$/, '');
      const np = normalize(selected.path);
      const overlap = folders.find((f) => {
        const fp = normalize(f.path);
        return fp && np && fp !== np && (np.startsWith(fp + '\\') || fp.startsWith(np + '\\'));
      });
      if (overlap) {
        setOverlapConflict({ selected, providerId, otherName: overlap.name, otherPath: overlap.path });
        return;
      }
    }

    // If the cloud already has a folder with this name (from another device),
    // let the user choose: merge into it, or add under a new name.
    try {
      if (window.electronAPI.checkCloudFolderName) {
        const check = await window.electronAPI.checkCloudFolderName(selected.name, providerId);
        if (check && check.success && check.exists) {
          setNewFolderName(`${selected.name}-2`);
          setNameConflict({
            selected,
            providerId,
            itemCount: check.itemCount || 0,
            folderId: check.folderId || null
          });
          return;
        }
      }
    } catch (_) {}
    await addFolderNow(selected, providerId, selected.name);
  };

  const handleAddFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const selected = await window.electronAPI.selectFolderDialog();
      if (!selected) return;

      const connected = providers.filter((p) => p.connected);
      if (connected.length === 0) {
        showToast(t('app.providerNotConnected'), 'error');
        setActivePage('accounts');
        return;
      }

      if (connected.length > 1) {
        setPendingFolder(selected);
        return;
      }

      await addFolderWithProvider(selected, connected[0].id);
    } catch (err) {
      showToast(t('app.folderAddError', { error: err.message }), 'error');
    }
  };

  const handleRemoveFolder = async (folderId, folderName) => {
    if (!window.electronAPI) return;
    const folder = folders.find((f) => f.id === folderId);
    setFolderDeleteModal({
      folderId,
      folderName,
      folderPath: folder?.path || ''
    });
  };

  const handleTogglePause = async (folderId, isPaused) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.togglePauseFolder(folderId, isPaused);
      showToast(isPaused ? t('app.paused') : t('app.resumed'), 'info');
      await refreshAllData();
    } catch (err) {
      showToast(t('app.pauseError', { error: err.message }), 'error');
    }
  };

  const handleSyncFolder = async (folderId) => {
    if (!window.electronAPI) return;
    setSyncingFolderId(folderId);
    showToast(t('app.scanningFolder'), 'info');
    try {
      await window.electronAPI.syncFolderNow(folderId);
    } catch (err) {
      showToast(t('app.syncError', { error: err.message }), 'error');
    } finally {
      setTimeout(() => setSyncingFolderId(null), 1500);
    }
  };

  const handleSyncAll = async () => {
    if (!window.electronAPI) return;
    setIsSyncing(true);
    showToast(t('app.syncingAll'), 'info');
    try {
      await window.electronAPI.syncAllNow();
    } catch (err) {
      showToast(t('app.syncError', { error: err.message }), 'error');
    } finally {
      setTimeout(() => {
        if (activeUploadsRef.current === 0) setIsSyncing(false);
      }, 2000);
    }
  };

  const handleClearLogs = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.clearLogs();
      setLogs([]);
      showToast(t('app.logsCleared'), 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenInExplorer = async (filePath) => {
    if (!window.electronAPI || !filePath) return;
    try {
      const res = await window.electronAPI.openPath(filePath);
      if (res && !res.success) {
        showToast(t('app.openPathError', { error: res.error }), 'error');
      }
    } catch (err) {
      showToast(t('app.openPathError', { error: err.message }), 'error');
    }
  };

  const handleReapplyBadge = async (folderId) => {
    if (!window.electronAPI || !window.electronAPI.reapplyFolderBadge) return;
    try {
      const res = await window.electronAPI.reapplyFolderBadge(folderId);
      if (res && res.success) {
        showToast(t('app.badgeUpdated'), 'success');
      } else {
        showToast(t('app.badgeUpdatedInfo'), 'info');
      }
    } catch (err) {
      showToast(t('app.badgeError', { error: err.message }), 'error');
    }
  };

  const handleRetryFile = async (filePath) => {
    if (!window.electronAPI?.retryFile) return;
    try {
      const res = await window.electronAPI.retryFile(filePath);
      if (res && res.success) {
        showToast(t('app.retryQueued', { count: res.queued || 1 }), 'success');
        await refreshAllData();
      } else {
        showToast(t('app.retryFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.retryFailed', { error: err.message }), 'error');
    }
  };

  const handleRetryAllFailed = async (folderId = null) => {
    if (!window.electronAPI?.retryAllFailed) return;
    try {
      const res = await window.electronAPI.retryAllFailed(folderId);
      if (res && res.success) {
        if (res.queued > 0) {
          showToast(t('app.retryQueued', { count: res.queued }), 'success');
        } else {
          showToast(t('app.retryNone'), 'info');
        }
        await refreshAllData();
      } else {
        showToast(t('app.retryFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.retryFailed', { error: err.message }), 'error');
    }
  };

  const handleRestoreFile = async (filePath) => {
    if (!window.electronAPI?.restoreFile) return;
    try {
      const res = await window.electronAPI.restoreFile(filePath);
      if (res && res.success) {
        showToast(t('app.restoreSuccess', { path: res.destPath }), 'success');
      } else if (res && res.canceled) {
        showToast(t('app.restoreCanceled'), 'info');
      } else {
        showToast(t('app.restoreFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.restoreFailed', { error: err.message }), 'error');
    }
  };

  const persistSetting = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (window.electronAPI?.saveSetting) {
      await window.electronAPI.saveSetting(key, value);
    }
  };

  const handleUpdateSetting = async (key, value) => {
    if (key === 'syncMode' && value === 'mirror') {
      setPendingSyncMode('mirror');
      return;
    }

    await persistSetting(key, value);

    if (key === 'syncMode') {
      showToast(value === 'mirror' ? t('app.deleteModeMirror') : t('app.deleteModeSafe'), value === 'mirror' ? 'error' : 'success');
    } else {
      showToast(t('app.settingsSaved'), 'success');
    }
  };

  const confirmMirrorMode = async () => {
    setPendingSyncMode(null);
    await persistSetting('syncMode', 'mirror');
    showToast(t('app.deleteModeMirror'), 'error');
  };

  const confirmResetApp = async () => {
    setShowResetConfirm(false);
    let succeeded = false;
    try {
      const res = await window.electronAPI?.resetApp?.();
      if (res && res.success) {
        succeeded = true;
        showToast(t('app.resetDone'), 'success');
      } else {
        showToast(t('app.resetFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.resetFailed', { error: err.message }), 'error');
    }
    if (succeeded) {
      setTimeout(() => window.location.reload(), 1300);
    }
  };

  const handleUninstallApp = async () => {
    try {
      const res = await window.electronAPI?.uninstallApp?.();
      if (res && res.success) {
        showToast(t('app.uninstallStarted'), 'success');
      } else {
        showToast(t('app.uninstallFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.uninstallFailed', { error: err.message }), 'error');
    }
  };

  const handleWipeAll = async () => {
    setWipeBusy(true);
    setWipeProgress({ current: 1, total: 3, name: 'جاري بدء الإزالة من السحابة...' });
    try {
      const wipePromise = window.electronAPI?.wipeCloudAll?.();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('استغرقت العملية وقتاً أطول من المتوقع، تم إلغاء الانتظار')), 300000)
      );
      const res = await Promise.race([wipePromise, timeoutPromise]);
      if (res && res.success) {
        showToast(t('app.wipeDone'), 'success');
        await refreshAllData();
        if (wipeResetApp) {
          try {
            const rr = await window.electronAPI?.resetApp?.();
            if (rr && rr.success) {
              setTimeout(() => window.location.reload(), 1400);
              return;
            }
          } catch (_) {}
        }
        setShowWipeConfirm(false);
      } else {
        showToast(t('app.wipeFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
    } catch (err) {
      showToast(t('app.wipeFailed', { error: err.message }), 'error');
    } finally {
      setWipeBusy(false);
      setWipeProgress(null);
    }
  };

  const handleQuitApp = () => {
    if (window.electronAPI?.quitApp) {
      window.electronAPI.quitApp();
    }
  };

  const handleExecuteFormatCloud = async () => {
    setIsFormatting(true);
    setFormatProgress({ current: 0, total: 0, name: '' });
    try {
      const res = await window.electronAPI.formatCloud(formatProviderId);
      if (res && res.success) {
        setFormatResult(res);
        showToast(t('app.formatCloudDone'), 'success');
        await refreshAllData();
      } else {
        const errMsg = res?.error || 'Unknown error';
        showToast(t('app.formatCloudFailed', { error: errMsg }), 'error');
        setFormatResult({ error: errMsg });
      }
    } catch (err) {
      showToast(t('app.formatCloudFailed', { error: err.message }), 'error');
      setFormatResult({ error: err.message });
    } finally {
      setIsFormatting(false);
    }
  };

  const hasAccounts = providers.some((p) => p.connected);

  const [isMobileMode, setIsMobileMode] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.AuraSyncAndroid) return true;
      const stored = localStorage.getItem('aurasync_mobile_mode');
      if (stored !== null) return stored === 'true';
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    }
    return false;
  });

  const toastIcon = toast?.type === 'error' ? AlertCircle : toast?.type === 'success' ? CheckCircle2 : Info;
  const ToastIcon = toastIcon;
  const toastColor = toast?.type === 'error' ? 'var(--danger)' : toast?.type === 'success' ? 'var(--success)' : 'var(--accent)';

  if (isMobileMode) {
    return (
      <I18nProvider lang={settings.language || 'ar'}>
        <Suspense fallback={<div className="p-8 text-center text-white bg-black min-h-screen flex items-center justify-center">Loading AuraSync Mobile...</div>}>
          <MobileApp
            version={appVersion}
            accounts={providers}
            storage={{
              google: providers.find((p) => p.id === 'google')?.storage,
              onedrive: providers.find((p) => p.id === 'onedrive')?.storage
            }}
            stats={stats}
            files={[]}
            onTriggerSync={handleSyncAll}
            onSwitchToDesktop={() => {
              setIsMobileMode(false);
              localStorage.setItem('aurasync_mobile_mode', 'false');
            }}
            isSyncing={isSyncing}
          />
        </Suspense>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={settings.language || 'ar'}>
      <div
        dir={settings.language === 'en' ? 'ltr' : 'rtl'}
        className={`cloud-window-shell ${isMaximized ? 'is-maximized' : 'is-floating'}`}
      >
        <div
          className="cloud-window-frame"
          style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
        >
          {/* Floating Cloud TitleBar with window dragging and controls */}
          <CloudTitleBar
            stats={stats}
            isSyncing={isSyncing}
            isMaximized={isMaximized}
          />

          <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
            <Sidebar
              activePage={activePage}
              onNavigate={setActivePage}
              providers={providers}
              stats={stats}
              isSyncing={isSyncing}
              version={appVersion}
              updateInfo={updateInfo}
              onOpenUpdate={() => setShowUpdateModal(true)}
            />

            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
              <TopBar
                page={activePage}
                stats={stats}
                hasAccounts={hasAccounts}
                isSyncing={isSyncing}
                onSyncAll={handleSyncAll}
                uploadSpeed={uploadSpeed}
                onOpenSearch={() => setSearchOpen(true)}
                updateInfo={updateInfo}
                onOpenUpdate={() => setShowUpdateModal(true)}
                onToggleMobileMode={() => {
                  setIsMobileMode(true);
                  try { localStorage.setItem('aurasync_mobile_mode', 'true'); } catch (_) {}
                }}
              />

          <main
            ref={mainScrollRef}
            tabIndex="0"
            className="flex-1 min-h-0 overflow-y-auto scroll-area px-6 py-5 focus:outline-none overscroll-contain"
          >
            <Suspense fallback={<div className="p-8 text-center muted">جارٍ تحميل الصفحة…</div>}>
            {activePage === 'dashboard' && (
              <DashboardPage
                providers={providers}
                stats={stats}
                folders={folders}
                onNavigate={setActivePage}
                onSyncFolder={handleSyncFolder}
                syncingFolderId={syncingFolderId}
                onSyncAll={handleSyncAll}
                isSyncing={isSyncing}
                onAddFolder={handleAddFolder}
                remoteFolders={remoteFolders}
                remoteLoading={remoteLoading}
                onRefreshRemote={() => fetchRemoteFolders(false)}
                onLinkRemoteFolder={refreshAllData}
                onTrashRemoteFolder={refreshAllData}
                showToast={showToast}
              />
            )}

            {(activePage === 'files' || activePage === 'folders') && (
              <FilesPage
                folders={folders}
                providers={providers}
                onAddFolder={handleAddFolder}
                onRemoveFolder={handleRemoveFolder}
                onTogglePause={handleTogglePause}
                onSyncFolder={handleSyncFolder}
                onOpenInExplorer={handleOpenInExplorer}
                onReapplyBadge={handleReapplyBadge}
                onRestore={handleRestoreFile}
                onRetry={handleRetryFile}
                onRetryAll={handleRetryAllFailed}
                syncingFolderId={syncingFolderId}
                failedCount={stats.failedFiles || 0}
                preservedCount={stats.preservedFiles || 0}
                stats={stats}
                showToast={showToast}
              />
            )}

            {(activePage === 'activity' || activePage === 'transfers') && (
              <ActivityHubPage
                key={activePage}
                initialTab={activePage === 'transfers' ? 'transfers' : 'log'}
                logs={logs}
                onClearLogs={handleClearLogs}
                providers={providers}
                showToast={showToast}
              />
            )}

            {activePage === 'accounts' && (
              <AccountsPage
                providers={providers}
                folders={folders}
                onChanged={refreshAllData}
                showToast={showToast}
              />
            )}

            {activePage === 'cloudweb' && (
              <CloudWebPage providers={providers} onNavigate={setActivePage} />
            )}

            {(activePage === 'protection' || activePage === 'stats' || activePage === 'snapshots' || activePage === 'archive') && (
              <ProtectionPage
                key={activePage}
                initialTab={activePage === 'snapshots' ? 'snapshots' : activePage === 'archive' ? 'archive' : 'stats'}
                stats={stats}
                folders={folders}
                providers={providers}
                showToast={showToast}
              />
            )}

            {activePage === 'vault' && (
              <VaultPage
                key={activePage}
                initialAction={vaultNavParams?.pendingAction}
                initialTarget={vaultNavParams?.targetPath}
                onShowToast={showToast}
              />
            )}

            {activePage === 'settings' && (
              <SettingsPage
                settings={settings}
                onUpdateSetting={handleUpdateSetting}
                onClearLogs={handleClearLogs}
                onQuitApp={handleQuitApp}
                onResetApp={() => setShowResetConfirm(true)}
                onUninstallApp={handleUninstallApp}
                onFormatCloud={() => {
                  setFormatConfirmationText('');
                  setFormatAcknowledge(false);
                  setFormatProgress(null);
                  setFormatResult(null);
                  setIsFormatting(false);
                  setShowFormatCloudModal(true);
                }}
                onWipeCloud={() => setShowWipeConfirm(true)}
                providers={providers}
                folders={folders}
                showToast={showToast}
                appVersion={appVersion}
                updateInfo={updateInfo}
                isDownloadingUpdate={isDownloadingUpdate}
                updateProgress={updateProgress}
                onCheckUpdates={handleCheckForUpdates}
                onStartUpdate={handleStartUpdate}
                onOpenDisasterRecovery={() => setShowDisasterRecoveryModal(true)}
              />
            )}
            </Suspense>
          </main>
        </div>
      </div>

      {/* Global quick search (Ctrl+K) */}
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} showToast={showToast} />

      {/* Toast */}
        {toast && (
          <div
            className="toast-card"
            style={{ color: toastColor }}
          >
            <ToastIcon className="w-4 h-4 shrink-0" />
            <span className="leading-relaxed">{toast.message}</span>
          </div>
        )}

        {/* Mirror mode confirmation */}
        {pendingSyncMode === 'mirror' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                  >
                    <ArrowLeftRight className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-extrabold">{t('settings.modeMirrorTitle')}</h3>
                    <p className="text-[11px] dim">{t('settings.modeMirrorBadge')}</p>
                  </div>
                </div>
                <button onClick={() => setPendingSyncMode(null)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-3">{t('settings.modeMirrorDesc')}</p>

              <div
                className="p-3 rounded-xl flex items-start gap-2.5 text-[11.5px] leading-relaxed mb-5"
                style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('settings.modeMirrorWarning')}</span>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => setPendingSyncMode(null)} className="btn">
                  {t('files.close')}
                </button>
                <button onClick={confirmMirrorMode} className="btn btn-primary">
                  {t('settings.done')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Format Cloud Confirmation & Progress Modal */}
        {showFormatCloudModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
            <div className="surface p-6 w-full max-w-lg fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <CloudOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--danger)' }}>
                      {t('settings.formatModalTitle')}
                    </h3>
                    <p className="text-[11px] dim">{t('settings.formatModalSubtitle')}</p>
                  </div>
                </div>
                {!isFormatting && (
                  <button onClick={() => setShowFormatCloudModal(false)} className="btn btn-ghost btn-icon">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* In-progress state */}
              {isFormatting ? (
                <div className="py-6 flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 relative" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                  <h4 className="text-[14px] font-extrabold mb-1">{t('settings.formattingTitle')}</h4>
                  <p className="text-[12px] muted mb-4 max-w-sm">{t('settings.formattingDesc')}</p>
                  
                  {formatProgress && (
                    <div className="w-full bg-surface-flat p-3 rounded-xl border border-border-color">
                      <div className="flex justify-between text-[11px] mb-1.5">
                        <span className="dim">{t('settings.formatCurrentFile')}</span>
                        <span className="font-mono font-bold truncate max-w-[200px]" dir="ltr">{formatProgress.name || '...'}</span>
                      </div>
                      <div className="text-[11px] text-danger font-bold text-end">
                        {formatProgress.current > 0
                          ? t('settings.formatDeletingCount', { count: formatProgress.current })
                          : t('settings.formatScanning')}
                      </div>
                    </div>
                  )}
                </div>
              ) : formatResult ? (
                /* Completed state */
                <div className="py-4">
                  {formatResult.error ? (
                    <div className="p-4 rounded-xl flex items-start gap-3 mb-4" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-[13px] mb-1">{t('settings.formatFailedTitle')}</div>
                        <div className="text-[11.5px] opacity-90">{formatResult.error}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                        <Check className="w-7 h-7" strokeWidth={3} />
                      </div>
                      <h4 className="text-[15px] font-extrabold mb-2" style={{ color: 'var(--success)' }}>
                        {t('settings.formatCompleteTitle')}
                      </h4>
                      <p className="text-[12px] muted leading-relaxed mb-4">
                        {t('settings.formatCompleteDesc')}
                      </p>
                      <div className="inline-block p-3 rounded-xl surface-flat border border-border-color text-[12px] font-mono mb-2">
                        {t('settings.formatDeletedCount', { count: formatResult.deletedCount || 0 })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => {
                        setShowFormatCloudModal(false);
                        setFormatResult(null);
                      }}
                      className="btn btn-primary"
                    >
                      {t('files.close')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Confirmation input state */
                <div>
                  <div
                    className="p-3.5 rounded-xl flex items-start gap-2.5 text-[11.5px] leading-relaxed mb-4"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{t('settings.formatModalWarning')}</span>
                  </div>

                  <div className="flex flex-col gap-2 mb-4 text-[11.5px]">
                    <div className="p-2.5 rounded-lg flex items-center gap-2" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                      <span>{t('settings.formatModalLocalSafe')}</span>
                    </div>
                    <div className="p-2.5 rounded-lg flex items-center gap-2" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                      <span>{t('settings.formatModalSyncPausedNotice')}</span>
                    </div>
                  </div>

                  {/* Provider selection if multiple accounts */}
                  {providers.filter((p) => p.connected).length > 1 && (
                    <div className="mb-4">
                      <label className="text-[11.5px] font-bold block mb-2">{t('settings.formatSelectProvider')}</label>
                      <select
                        value={formatProviderId}
                        onChange={(e) => setFormatProviderId(e.target.value)}
                        className="input"
                      >
                        <option value="all">{t('settings.formatAllProviders')}</option>
                        {providers.filter((p) => p.connected).map((p) => (
                          <option key={p.id} value={p.id}>{p.label} ({p.user?.email || p.id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Type confirmation safeguard */}
                  <div className="mb-4">
                    <label className="text-[11.5px] font-bold block mb-2">
                      {t('settings.formatTypeConfirm')}
                    </label>
                    <input
                      type="text"
                      value={formatConfirmationText}
                      onChange={(e) => setFormatConfirmationText(e.target.value)}
                      placeholder={t('settings.formatInputPlaceholder')}
                      className="input font-mono text-center tracking-wider font-bold"
                      dir="ltr"
                    />
                  </div>

                  <label
                    className="flex items-start gap-2.5 p-3 rounded-xl mb-5 cursor-pointer"
                    style={{ background: 'var(--danger-soft)' }}
                  >
                    <input
                      type="checkbox"
                      checked={formatAcknowledge}
                      onChange={(e) => setFormatAcknowledge(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--danger)' }}>
                      {t('settings.formatAcknowledge')}
                    </span>
                  </label>

                  <div className="flex items-center gap-3 justify-end">
                    <button onClick={() => setShowFormatCloudModal(false)} className="btn">
                      {t('files.close')}
                    </button>
                    <button
                      onClick={handleExecuteFormatCloud}
                      disabled={
                        !formatAcknowledge ||
                        (formatConfirmationText.trim().toLowerCase() !== 'format' &&
                          formatConfirmationText.trim() !== 'فورمات')
                      }
                      className="btn btn-danger font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('settings.formatConfirmBtn')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full cloud trace removal (as if the app was never installed) */}
        {showWipeConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div
              className="surface p-6 w-full max-w-md fade-in"
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.6)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-extrabold" style={{ color: 'var(--danger)' }}>
                      {t('settings.wipeModalTitle')}
                    </h3>
                    <p className="text-[11px] dim">{t('settings.dangerZone')}</p>
                  </div>
                </div>
                {!wipeBusy && (
                  <button onClick={() => setShowWipeConfirm(false)} className="btn btn-ghost btn-icon">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {wipeBusy ? (
                <div className="py-6 flex flex-col items-center text-center">
                  <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: 'var(--danger)' }} />
                  <p className="text-[13px] font-bold mb-1" style={{ color: 'var(--danger)' }}>
                    {t('settings.wiping')}
                  </p>
                  {wipeProgress && wipeProgress.total > 0 ? (
                    <div className="w-full mt-3">
                      <div className="flex items-center justify-between text-[11px] muted mb-1.5 font-mono" dir="ltr">
                        <span className="truncate max-w-[200px]">{wipeProgress.name || ''}</span>
                        <span>{wipeProgress.current} / {wipeProgress.total}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.round((wipeProgress.current / wipeProgress.total) * 100))}%`,
                            background: 'var(--danger)'
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] dim mt-1">{t('settings.wipeDesc')}</p>
                  )}
                  <button
                    onClick={() => { setWipeBusy(false); setShowWipeConfirm(false); }}
                    className="btn btn-ghost text-[11px] mt-4"
                  >
                    {t('files.close')}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[12px] muted leading-relaxed mb-3">{t('settings.wipeModalDesc')}</p>

                  <label
                    className="flex items-start gap-2.5 p-3 rounded-xl mb-5 cursor-pointer"
                    style={{ background: 'var(--bg-surface-hover)' }}
                  >
                    <input
                      type="checkbox"
                      checked={wipeResetApp}
                      onChange={(e) => setWipeResetApp(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[11.5px] leading-relaxed">{t('settings.wipeResetOption')}</span>
                  </label>

                  <div className="flex items-center gap-3 justify-end">
                    <button onClick={() => setShowWipeConfirm(false)} className="btn">
                      {t('files.close')}
                    </button>
                    <button onClick={handleWipeAll} className="btn btn-danger font-bold">
                      <Flame className="w-4 h-4" />
                      {t('settings.wipeConfirmBtn')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Full reset confirmation */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-extrabold">{t('settings.resetTitle')}</h3>
                    <p className="text-[11px] dim">{t('settings.dangerZone')}</p>
                  </div>
                </div>
                <button onClick={() => setShowResetConfirm(false)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-3">{t('settings.resetDesc')}</p>

              <div
                className="p-3 rounded-xl flex items-start gap-2.5 text-[11.5px] leading-relaxed mb-5"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('settings.resetWarning')}</span>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => setShowResetConfirm(false)} className="btn">
                  {t('files.close')}
                </button>
                <button onClick={confirmResetApp} className="btn btn-danger">
                  {t('settings.resetConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Folder target (cloud provider) selection */}
        {pendingFolder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    <CloudCog className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-extrabold">{t('folders.chooseTarget')}</h3>
                    <p className="text-[11px] dim truncate max-w-[220px]">{pendingFolder.name}</p>
                  </div>
                </div>
                <button onClick={() => setPendingFolder(null)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-4 mt-3">
                {t('folders.chooseTargetDesc', { name: pendingFolder.name })}
              </p>

              <div className="flex flex-col gap-2 mb-5">
                {providers
                  .filter((p) => p.connected)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addFolderWithProvider(pendingFolder, p.id)}
                      className="surface-flat surface-hover px-4 py-3 flex items-center gap-3 text-start"
                    >
                      <Cloud className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      <span className="text-[12.5px] font-bold flex-1">{p.label}</span>
                      <span className="text-[10.5px] dim truncate max-w-[130px]">{p.user?.email || ''}</span>
                    </button>
                  ))}
              </div>

              <div className="flex justify-end">
                <button onClick={() => setPendingFolder(null)} className="btn">
                  {t('files.close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cloud name conflict: merge into existing folder or add under a new name */}
        {nameConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                  >
                    <FolderCog className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-extrabold">{t('folders.nameConflictTitle')}</h3>
                    <p className="text-[11px] dim truncate max-w-[240px]">{nameConflict.selected.name}</p>
                  </div>
                </div>
                <button onClick={() => setNameConflict(null)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-4 mt-3">
                {t('folders.nameConflictDesc', {
                  name: nameConflict.selected.name,
                  count: nameConflict.itemCount
                })}
              </p>

              <div className="flex flex-col gap-2.5 mb-4">
                <button
                  onClick={() =>
                    addFolderNow(nameConflict.selected, nameConflict.providerId, nameConflict.selected.name, {
                      driveFolderId: nameConflict.folderId,
                      reverseSync: true
                    })
                  }
                  className="surface-flat surface-hover px-4 py-3 text-start"
                >
                  <div className="text-[12.5px] font-bold mb-0.5">{t('folders.nameMergeTitle')}</div>
                  <div className="text-[11px] dim leading-relaxed">{t('folders.nameMergeDesc')}</div>
                </button>

                <div className="surface-flat px-4 py-3">
                  <div className="text-[12.5px] font-bold mb-0.5">{t('folders.nameSeparateTitle')}</div>
                  <div className="text-[11px] dim leading-relaxed mb-2.5">{t('folders.nameSeparateDesc')}</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder={t('folders.newNamePlaceholder')}
                      className="input flex-1"
                      dir="auto"
                    />
                    <button
                      onClick={() =>
                        newFolderName.trim() &&
                        addFolderNow(nameConflict.selected, nameConflict.providerId, newFolderName.trim())
                      }
                      disabled={!newFolderName.trim()}
                      className="btn btn-primary shrink-0"
                    >
                      {t('folders.addSeparate')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={() => setNameConflict(null)} className="btn">
                  {t('files.close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nested-folder warning: the same files would upload twice */}
        {overlapConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                  >
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-extrabold">{t('folders.overlapTitle')}</h3>
                    <p className="text-[11px] dim truncate max-w-[240px]">{overlapConflict.selected.name}</p>
                  </div>
                </div>
                <button onClick={() => setOverlapConflict(null)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-4 mt-3">
                {t('folders.overlapDesc', {
                  name: overlapConflict.selected.name,
                  other: overlapConflict.otherName
                })}
              </p>

              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => setOverlapConflict(null)} className="btn">
                  {t('files.close')}
                </button>
                <button
                  onClick={() => {
                    const { selected, providerId } = overlapConflict;
                    setOverlapConflict(null);
                    addFolderWithProvider(selected, providerId, true);
                  }}
                  className="btn btn-primary"
                >
                  {t('folders.overlapAddAnyway')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Folder Deletion & Removal Choice Modal */}
        {folderDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="surface p-6 w-full max-w-lg fade-in rounded-2xl shadow-2xl border border-white/10" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-extrabold text-slate-100">
                      {t('app.folderDeleteModalTitle')}: «{folderDeleteModal.folderName}»
                    </h3>
                    <p className="text-[11px] dim font-mono truncate max-w-[280px] mt-0.5" dir="ltr">
                      {folderDeleteModal.folderPath}
                    </p>
                  </div>
                </div>
                <button onClick={() => setFolderDeleteModal(null)} className="btn btn-ghost btn-icon">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[12px] muted leading-relaxed mb-5 mt-2">
                {t('app.folderDeleteModalDesc')}
              </p>

              <div className="flex flex-col gap-3">
                {/* Option 1: Permanent simultaneous deletion */}
                <button
                  onClick={async () => {
                    const target = folderDeleteModal;
                    setFolderDeleteModal(null);
                    try {
                      showToast(t('files.statusSyncing'), 'info');
                      let res = null;
                      if (window.electronAPI?.deleteFileBoth && target.folderPath) {
                        res = await window.electronAPI.deleteFileBoth(target.folderPath);
                      } else {
                        res = await window.electronAPI.removeFolder(target.folderId);
                      }
                      if (res && res.success === false) {
                        showToast(t('app.folderDeleteBothError', { error: res.error || 'Failed' }), 'error');
                      } else {
                        showToast(t('app.folderDeleteBothSuccess', { name: target.folderName }), 'success');
                      }
                      await refreshAllData();
                    } catch (err) {
                      showToast(t('app.folderDeleteBothError', { error: err.message }), 'error');
                    }
                  }}
                  className="btn btn-danger w-full py-3 px-4 justify-start text-start flex items-center gap-3.5 shadow-lg shadow-red-500/20"
                >
                  <Trash2 className="w-5 h-5 shrink-0 text-white" />
                  <div className="text-start flex-1 min-w-0">
                    <div className="font-bold text-[13px]">{t('app.deleteBothOption')}</div>
                    <div className="text-[10.5px] opacity-80 font-normal mt-0.5">{t('app.deleteBothOptionDesc')}</div>
                  </div>
                </button>

                {/* Option 2: Unwatch only (Zero Deletion Protection) */}
                <button
                  onClick={async () => {
                    const target = folderDeleteModal;
                    setFolderDeleteModal(null);
                    try {
                      const res = await window.electronAPI.removeFolder(target.folderId);
                      if (res && res.success) {
                        showToast(t('app.folderRemoved', { name: target.folderName }), 'info');
                        await refreshAllData();
                      } else {
                        showToast(t('app.folderRemoveError', { error: res?.error || 'Failed' }), 'error');
                      }
                    } catch (err) {
                      showToast(t('app.folderRemoveError', { error: err.message }), 'error');
                    }
                  }}
                  className="btn btn-secondary w-full py-3 px-4 justify-start text-start flex items-center gap-3.5 border border-white/10"
                >
                  <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400" />
                  <div className="text-start flex-1 min-w-0">
                    <div className="font-bold text-[13px]">{t('app.unwatchOption')}</div>
                    <div className="text-[10.5px] dim font-normal mt-0.5">{t('app.unwatchOptionDesc')}</div>
                  </div>
                </button>

                <div className="flex justify-end mt-2">
                  <button onClick={() => setFolderDeleteModal(null)} className="btn px-5">
                    {t('files.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GitHub 1-Click Auto-Update Modal */}
        {showUpdateModal && updateInfo?.updateAvailable && (
          <UpdateModal
            updateInfo={updateInfo}
            isDownloading={isDownloadingUpdate}
            progress={updateProgress}
            onStartUpdate={handleStartUpdate}
            onClose={() => setShowUpdateModal(false)}
          />
        )}

        {/* 1-Click Disaster Recovery & PC Migration Modal */}
        <DisasterRecoveryModal
          isOpen={showDisasterRecoveryModal}
          onClose={() => setShowDisasterRecoveryModal(false)}
          providers={providers}
          onRestoredSuccess={refreshAllData}
          showToast={showToast}
        />

        </div>
      </div>
    </I18nProvider>
  );
}
