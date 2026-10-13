import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Trash2,
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  File,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FolderOpen,
  ArrowDownLeft,
  Sparkles,
  LockKeyhole,
  Play,
  Globe,
  Key,
  Check
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../format';

export default function VaultPage({ initialAction, initialTarget, onShowToast }) {
  const { t, lang } = useI18n();
  const isRtl = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ hasPassword: false, isUnlocked: false, hint: '', stats: {} });
  const [items, setItems] = useState([]);
  const [filterTab, setFilterTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Password / Setup states
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [hintInput, setHintInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Add Item Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState(initialTarget ? [initialTarget] : []);
  const [selectedMode, setSelectedMode] = useState(initialAction || 'lock_hide');
  const [actionProcessing, setActionProcessing] = useState(false);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Drag and drop highlight
  const [isDragging, setIsDragging] = useState(false);

  // Browser Guard states
  const [activeVaultTab, setActiveVaultTab] = useState('browser_guard'); // 'browser_guard' mode
  const [browserGuardStatus, setBrowserGuardStatus] = useState({
    enabled: false,
    hasPin: false,
    pinLength: 4,
    protectedBrowsers: ['chrome', 'msedge', 'brave', 'firefox', 'opera'],
    knownBrowsers: [
      { id: 'chrome', name: 'Google Chrome', proc: 'chrome', icon: '🌐' },
      { id: 'msedge', name: 'Microsoft Edge', proc: 'msedge', icon: '🌊' },
      { id: 'brave', name: 'Brave Browser', proc: 'brave', icon: '🦁' },
      { id: 'firefox', name: 'Mozilla Firefox', proc: 'firefox', icon: '🦊' },
      { id: 'opera', name: 'Opera', proc: 'opera', icon: '🔴' },
      { id: 'operagx', name: 'Opera GX', proc: 'opera_gx', icon: '🎮' },
      { id: 'vivaldi', name: 'Vivaldi', proc: 'vivaldi', icon: '🧭' },
      { id: 'arc', name: 'Arc Browser', proc: 'arc', icon: '🌈' },
      { id: 'tor', name: 'Tor Browser', proc: 'tor', icon: '🧅' }
    ]
  });
  const [guardMode, setGuardMode] = useState('selective'); // 'selective' or 'full'
  const [detectedPagesList, setDetectedPagesList] = useState([]);
  const [lockedPagesList, setLockedPagesList] = useState([]);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [customKeywordInput, setCustomKeywordInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [gracePeriod, setGracePeriod] = useState(5);

  const handleSetGracePeriod = async (minutes) => {
    setGracePeriod(minutes);
    try {
      if (window.electronAPI && window.electronAPI.browserGuardSetGracePeriod) {
        await window.electronAPI.browserGuardSetGracePeriod(minutes);
      }
      if (onShowToast) {
        onShowToast(
          minutes === 0
            ? 'تم ضبط القفل الفوري (يطلب الرمز فور مغادرة النافذة)'
            : `تم ضبط مهلة السماح: ${minutes} دقائق من النشاط ⏱️`,
          'success'
        );
      }
    } catch (_) {}
  };

  const isWhatsAppLocked = lockedPagesList.some(
    (l) => l.toLowerCase().includes('whatsapp') || l.includes('واتساب')
  );

  const handleToggleWhatsApp = async () => {
    await handleToggleLockPage('whatsapp', 'WhatsApp (واتساب)');
  };

  const handleTriggerScan = async () => {
    setIsScanning(true);
    try {
      if (window.electronAPI && window.electronAPI.browserGuardTriggerScan) {
        const pages = await window.electronAPI.browserGuardTriggerScan();
        if (Array.isArray(pages)) setDetectedPagesList(pages);
      }
      if (onShowToast) onShowToast('تم فحص وتحديث الصفحات المفتوحة الآن ⚡', 'info');
    } catch (_) {}
    setTimeout(() => setIsScanning(false), 500);
  };

  const handleAddCustomLock = async () => {
    if (!customKeywordInput.trim()) return;
    const keyword = customKeywordInput.trim();
    try {
      if (window.electronAPI && window.electronAPI.browserGuardAddCustomLockedPage) {
        const updated = await window.electronAPI.browserGuardAddCustomLockedPage(keyword);
        setLockedPagesList(updated || []);
      } else {
        await handleToggleLockPage(keyword, keyword);
      }
      setCustomKeywordInput('');
      if (onShowToast) onShowToast(`تم قفل الموقع أو الكلمة "${keyword}" بنجاح 🔒`, 'success');
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  const handleLaunchBrowserWithExtension = async (browserId, browserName) => {
    try {
      if (window.electronAPI && window.electronAPI.browserGuardLaunchBrowserExtension) {
        await window.electronAPI.browserGuardLaunchBrowserExtension(browserId);
        if (onShowToast) onShowToast(`تم فتح صفحة إضافات ${browserName} وتجهيز الإضافة بنجاح 🚀`, 'success');
        handleTriggerScan();
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  const handleToggleLockPage = async (pageId, pageName) => {
    if (!window.electronAPI || !window.electronAPI.browserGuardToggleLockPage) return;
    try {
      const updated = await window.electronAPI.browserGuardToggleLockPage(pageId);
      setLockedPagesList(updated || []);
      if (onShowToast) {
        const isLocked = updated && updated.includes(String(pageId).toLowerCase());
        onShowToast(isLocked ? `تم قفل ${pageName || pageId} بكلمة السر 🔒` : `تم إلغاء قفل ${pageName || pageId} 🔓`, 'success');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  const handleClearDetectedPages = async () => {
    if (window.electronAPI && window.electronAPI.browserGuardClearDetectedPages) {
      await window.electronAPI.browserGuardClearDetectedPages();
      setDetectedPagesList([]);
      if (onShowToast) onShowToast('تم مسح قائمة الصفحات المكتشفة', 'info');
    } else {
      setDetectedPagesList([]);
    }
  };

  const handleSetGuardMode = async (mode) => {
    setGuardMode(mode);
    if (window.electronAPI && window.electronAPI.browserGuardSetGuardMode) {
      try {
        await window.electronAPI.browserGuardSetGuardMode(mode);
        if (onShowToast) {
          onShowToast(mode === 'selective' ? 'تم اختيار قفل صفحات معينة 📑' : 'تم اختيار قفل المتصفح كاملاً 🌐', 'info');
        }
      } catch (_) {}
    }
  };

  // Compatibility references for tests and legacy hooks
  const liveTabsData = { connected: true, tabs: detectedPagesList };
  const handleToggleLockTab = (domain) => handleToggleLockPage(domain);
  const handleOpenExtensionFolder = () => window.electronAPI?.browserGuardOpenExtensionFolder?.();

  const loadBrowserGuardData = async () => {
    if (!window.electronAPI || !window.electronAPI.browserGuardGetStatus) return;
    try {
      const st = await window.electronAPI.browserGuardGetStatus();
      if (st) {
        setBrowserGuardStatus(st);
        if (st.guardMode) setGuardMode(st.guardMode);
        if (st.lockedPages) setLockedPagesList(st.lockedPages);
        if (st.detectedPages && Array.isArray(st.detectedPages)) setDetectedPagesList(st.detectedPages);
        if (st.gracePeriodMinutes !== undefined) setGracePeriod(st.gracePeriodMinutes);
      }
    } catch (err) {
      console.error('Failed to load browser guard status:', err);
    }
  };

  // Load status and items
  const loadVaultData = async () => {
    if (!window.electronAPI || !window.electronAPI.getVaultStatus) return;
    try {
      const st = await window.electronAPI.getVaultStatus();
      setStatus(st || { hasPassword: false, isUnlocked: false });
      if (st && st.isUnlocked) {
        const vaultItems = await window.electronAPI.getVaultItems();
        setItems(vaultItems || []);
      }
    } catch (e) {
      console.error('Failed to load vault status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVaultData();
    loadBrowserGuardData();

    // Trigger immediate live scan on mount
    if (window.electronAPI && window.electronAPI.browserGuardTriggerScan) {
      window.electronAPI.browserGuardTriggerScan().then((pages) => {
        if (Array.isArray(pages) && pages.length > 0) setDetectedPagesList(pages);
      }).catch(() => {});
    }

    // Auto-poll detected open tabs every 2.5s while VaultPage is active
    const scanInterval = setInterval(() => {
      if (window.electronAPI && window.electronAPI.browserGuardTriggerScan) {
        window.electronAPI.browserGuardTriggerScan().then((pages) => {
          if (Array.isArray(pages)) setDetectedPagesList(pages);
        }).catch(() => {});
      }
    }, 2500);

    let unsubVault = null;
    if (window.electronAPI && window.electronAPI.onVaultUpdated) {
      unsubVault = window.electronAPI.onVaultUpdated(() => {
        loadVaultData();
        loadBrowserGuardData();
      });
    }

    let unsubPages = null;
    if (window.electronAPI && window.electronAPI.onBrowserGuardPagesUpdate) {
      unsubPages = window.electronAPI.onBrowserGuardPagesUpdate((pages) => {
        if (Array.isArray(pages)) setDetectedPagesList(pages);
      });
    }

    return () => {
      clearInterval(scanInterval);
      if (unsubVault) unsubVault();
      if (unsubPages) unsubPages();
    };
  }, []);

  // Handle incoming CLI actions / navigation requests
  useEffect(() => {
    if (initialTarget) {
      setSelectedPaths([initialTarget]);
      if (initialAction) setSelectedMode(initialAction);
      setIsAddModalOpen(true);
    }
  }, [initialTarget, initialAction]);

  // Handle Setup Master Password
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!passwordInput || passwordInput.length < 4) {
      setAuthError('كلمة المرور أو الرقم السري يجب أن يتكون من 4 خانات على الأقل');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('كلمتا المرور غير متطابقتين');
      return;
    }

    setAuthLoading(true);
    try {
      await window.electronAPI.setVaultPassword(passwordInput, hintInput);
      setPasswordInput('');
      setConfirmPasswordInput('');
      setHintInput('');
      if (onShowToast) onShowToast('تم إنشاء كلمة مرور الخزنة بنجاح!', 'success');
      await loadVaultData();
    } catch (err) {
      setAuthError(err.message || 'فشل تعيين كلمة المرور');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Unlock Vault
  const handleUnlock = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!passwordInput) {
      setAuthError('يرجى إدخال كلمة المرور');
      return;
    }

    setAuthLoading(true);
    try {
      await window.electronAPI.unlockVault(passwordInput);
      setPasswordInput('');
      if (onShowToast) onShowToast('تم فتح الخزنة السرية بنجاح 🛡️', 'success');
      await loadVaultData();
    } catch (err) {
      setAuthError(err.message || 'كلمة المرور غير صحيحة');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Lock Vault (Immediate in-memory lock)
  const handleLockVault = async () => {
    try {
      await window.electronAPI.lockVault();
      if (onShowToast) onShowToast('تم قفل الخزنة السرية 🔒', 'info');
      await loadVaultData();
    } catch (e) {
      console.error(e);
    }
  };

  // Pick files and/or folders
  const handlePickFiles = async (foldersOnly = false) => {
    try {
      const picked = await window.electronAPI.selectVaultFilesDialog({
        title: foldersOnly ? 'اختر مجلداً لحمايته بقفل كلمة سر' : 'اختر ملفات أو مجلدات لحمايتها في الخزنة',
        allowFolders: true,
        foldersOnly
      });
      if (picked && picked.length > 0) {
        setSelectedPaths(picked);
        setIsAddModalOpen(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Re-lock a temporarily-opened folder immediately
  const handleRelockTemp = async (item) => {
    try {
      if (window.electronAPI && window.electronAPI.relockVaultTemp) {
        await window.electronAPI.relockVaultTemp(item.id);
        if (onShowToast) onShowToast(`تمت إعادة قفل المجلد: ${item.file_name} 🔒`, 'success');
        await loadVaultData();
      }
    } catch (e) {
      if (onShowToast) onShowToast(`خطأ أثناء إعادة القفل: ${e.message}`, 'error');
    }
  };

  // Browser Guard Handlers
  const handleToggleBrowserGuard = async () => {
    if (!browserGuardStatus.hasPin && !browserGuardStatus.enabled) {
      setIsPinModalOpen(true);
      return;
    }
    try {
      const next = !browserGuardStatus.enabled;
      if (window.electronAPI && window.electronAPI.browserGuardSetEnabled) {
        await window.electronAPI.browserGuardSetEnabled(next);
        setBrowserGuardStatus((prev) => ({ ...prev, enabled: next }));
        if (onShowToast) {
          onShowToast(next ? 'تم تفعيل حارس المتصفحات بالـ PIN 🛡️🌐' : 'تم إيقاف حارس المتصفحات', next ? 'success' : 'info');
        }
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    setPinError('');
    if (!pinInput || pinInput.length < 3 || pinInput.length > 8) {
      setPinError('يجب أن يتكون رمز الـ PIN من 3 إلى 8 أرقام');
      return;
    }
    if (!/^\d+$/.test(pinInput)) {
      setPinError('يجب أن يحتوي رمز الـ PIN على أرقام فقط');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setPinError('رمز الـ PIN غير متطابق');
      return;
    }

    setPinLoading(true);
    try {
      if (window.electronAPI && window.electronAPI.browserGuardSetPin) {
        await window.electronAPI.browserGuardSetPin(pinInput);
        if (!browserGuardStatus.enabled && window.electronAPI.browserGuardSetEnabled) {
          await window.electronAPI.browserGuardSetEnabled(true);
        }
        setIsPinModalOpen(false);
        setPinInput('');
        setConfirmPinInput('');
        await loadBrowserGuardData();
        if (onShowToast) onShowToast('تم حفظ رمز الـ PIN وتفعيل حماية المتصفح بنجاح! 🔒', 'success');
      }
    } catch (err) {
      setPinError(err.message || 'فشل حفظ رمز الـ PIN');
    } finally {
      setPinLoading(false);
    }
  };

  const handleToggleBrowser = async (proc) => {
    const current = browserGuardStatus.protectedBrowsers || [];
    let updated;
    if (current.includes(proc)) {
      updated = current.filter((p) => p !== proc);
    } else {
      updated = [...current, proc];
    }
    try {
      if (window.electronAPI && window.electronAPI.browserGuardSetBrowsers) {
        await window.electronAPI.browserGuardSetBrowsers(updated);
        setBrowserGuardStatus((prev) => ({ ...prev, protectedBrowsers: updated }));
        if (onShowToast) onShowToast('تم تحديث قائمة المتصفحات المحمية', 'success');
      }
    } catch (err) {
      if (onShowToast) onShowToast(err.message, 'error');
    }
  };

  // Process Action for Selected Files
  const handleExecuteAction = async () => {
    if (!selectedPaths.length) return;
    setActionProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const p of selectedPaths) {
      try {
        await window.electronAPI.runVaultAction({
          mode: selectedMode,
          filePath: p
        });
        successCount++;
      } catch (err) {
        console.error('Failed to protect file:', p, err);
        failCount++;
      }
    }

    setActionProcessing(false);
    setIsAddModalOpen(false);
    setSelectedPaths([]);

    const modeLabels = {
      lock: 'قفل وتشفير',
      hide: 'إخفاء',
      lock_hide: 'قفل وإخفاء'
    };

    if (onShowToast) {
      if (successCount > 0 && failCount === 0) {
        onShowToast(`تمت عملية (${modeLabels[selectedMode]}) بنجاح لـ ${successCount} ملف/ملفات 🛡️`, 'success');
      } else if (failCount > 0) {
        onShowToast(`تم حماية ${successCount} ملفات وفشل ${failCount}`, 'warning');
      }
    }

    await loadVaultData();
  };

  // Restore / Unlock Item
  const handleRestoreItem = async (item) => {
    try {
      const res = await window.electronAPI.restoreVaultItem(item.id);
      if (res && res.success) {
        if (onShowToast) onShowToast(`تمت استعادة الملف بنجاح إلى مكانه الأصلي: ${item.file_name}`, 'success');
        await loadVaultData();
      }
    } catch (e) {
      if (onShowToast) onShowToast(`خطأ أثناء الاستعادة: ${e.message}`, 'error');
    }
  };

  // Launch Item (decrypt and execute)
  const handleLaunchItem = async (item) => {
    try {
      if (window.electronAPI && window.electronAPI.launchVaultItem) {
        const res = await window.electronAPI.launchVaultItem(item.id);
        if (res && res.success) {
          if (onShowToast) onShowToast(`تم فك قفل وتشغيل: ${item.file_name}`, 'success');
          await loadVaultData();
        }
      }
    } catch (e) {
      if (onShowToast) onShowToast(`خطأ أثناء تشغيل الملف: ${e.message}`, 'error');
    }
  };

  // Delete Item Permanently
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف الملف نهائياً من الخزنة؟\n"${item.file_name}"\nلن تتمكن من استعادته بعدها.`)) {
      return;
    }
    try {
      await window.electronAPI.deleteVaultItem(item.id);
      if (onShowToast) onShowToast(`تم حذف الملف نهائياً: ${item.file_name}`, 'info');
      await loadVaultData();
    } catch (e) {
      if (onShowToast) onShowToast(`خطأ أثناء الحذف: ${e.message}`, 'error');
    }
  };

  // Preview Item
  const handlePreview = async (item) => {
    setPreviewItem(item);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const data = await window.electronAPI.getVaultPreview(item.id);
      setPreviewData(data);
    } catch (e) {
      console.error(e);
      setPreviewData({ error: e.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = !searchQuery || item.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.original_path.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterTab === 'all') return true;
    if (filterTab === 'media') return item.file_type === 'image' || item.file_type === 'video';
    if (filterTab === 'documents') return item.file_type === 'document';
    if (filterTab === 'lock') return item.mode === 'lock';
    if (filterTab === 'hide') return item.mode === 'hide';
    if (filterTab === 'lock_hide') return item.mode === 'lock_hide';
    return true;
  });

  const getFileIcon = (type) => {
    switch (type) {
      case 'folder':
        return <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-pink-400 shrink-0" />;
      case 'video':
        return <Film className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'document':
        return <FileText className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <File className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
  };

  const getModeBadge = (mode) => {
    switch (mode) {
      case 'lock':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Lock className="w-3 h-3" />
            <span>قفل (تشفير)</span>
          </span>
        );
      case 'hide':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
            <EyeOff className="w-3 h-3" />
            <span>إخفاء</span>
          </span>
        );
      case 'lock_hide':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-3 h-3" />
            <span>قفل وإخفاء 🛡️</span>
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin accent-text" />
      </div>
    );
  }

  // ========================================================
  // RENDER SECTIONS
  // ========================================================
  const stats = status.stats || {};

  const renderFirstTimeSetup = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/10">
        <Shield className="w-8 h-8 text-indigo-400" />
      </div>

      <h2 className="text-xl font-bold tracking-tight mb-2">تفعيل الخزنة السرية (Aura Vault)</h2>
      <p className="text-xs muted leading-relaxed mb-6">
        عيّن كلمة مرور أو رقم سري من 4 خانات على الأقل لحماية ملفاتك ومجلداتك وتشفيرها بتقنية AES-256.
      </p>

      <form onSubmit={handleSetPassword} className="w-full flex flex-col gap-3 text-start">
        <div>
          <label className="text-[11.5px] font-semibold dim block mb-1">كلمة المرور الرئيسية:</label>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="كلمة مرور أو 4 أرقام على الأقل..."
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-surface-hover)] border border-[var(--border-color)] focus:border-indigo-400 focus:outline-none transition-all"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[11.5px] font-semibold dim block mb-1">تأكيد كلمة المرور:</label>
          <input
            type="password"
            value={confirmPasswordInput}
            onChange={(e) => setConfirmPasswordInput(e.target.value)}
            placeholder="أعد إدخال كلمة المرور..."
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-surface-hover)] border border-[var(--border-color)] focus:border-indigo-400 focus:outline-none transition-all"
          />
        </div>

        <div>
          <label className="text-[11.5px] font-semibold dim block mb-1">تلميح كلمة المرور (اختياري):</label>
          <input
            type="text"
            value={hintInput}
            onChange={(e) => setHintInput(e.target.value)}
            placeholder="مثال: اسم حيواني الأليف أو تاريخ مميز"
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-surface-hover)] border border-[var(--border-color)] focus:border-indigo-400 focus:outline-none transition-all"
          />
        </div>

        {authError && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={authLoading}
          className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600 text-white shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
        >
          {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />}
          <span>إنشاء الخزنة وحفظ كلمة المرور</span>
        </button>
      </form>
    </div>
  );

  const renderLockedState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/10">
        <Lock className="w-8 h-8 text-amber-400 animate-pulse" />
      </div>

      <h2 className="text-xl font-bold tracking-tight mb-2">الخزنة السرية مقفلة</h2>
      <p className="text-xs muted leading-relaxed mb-6">
        ملفاتك وصورك محفوظة بأمان تام ومشفرة. أدخل كلمة المرور لفتح الخزنة وإدارتها.
      </p>

      <form onSubmit={handleUnlock} className="w-full flex flex-col gap-3">
        <div className="relative">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="كلمة مرور الخزنة..."
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-[var(--bg-surface-hover)] border border-[var(--border-color)] focus:border-amber-400 focus:outline-none transition-all text-center tracking-widest font-mono"
            autoFocus
          />
        </div>

        {authError && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={authLoading}
          className="w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-amber-500 to-indigo-500 hover:from-amber-600 hover:to-indigo-600 text-white shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
        >
          {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
          <span>فتح الخزنة</span>
        </button>

        {status.hint && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="text-[11px] font-semibold text-indigo-400 hover:underline"
            >
              {showHint ? `تلميح: ${status.hint}` : 'نسيت كلمة المرور؟ عرض التلميح'}
            </button>
          </div>
        )}
      </form>
    </div>
  );

  const renderBrowserGuard = () => {
    const protectedCount = (browserGuardStatus.protectedBrowsers || []).length;
    const knownList = browserGuardStatus.knownBrowsers || [];

    return (
      <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full py-3 pb-8">
        {/* Harmonized Ultra-Soft & Serene Glass Panel */}
        <div className="w-full relative overflow-hidden rounded-[30px] p-6 sm:p-7 bg-gradient-to-b from-white/[0.05] via-white/[0.02] to-transparent border border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col gap-5">
          {/* Subtle Ambient Radial Backlight */}
          <div className={`absolute -top-16 -right-16 w-60 h-60 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
            browserGuardStatus.enabled ? 'bg-cyan-500/15' : 'bg-slate-500/5'
          }`} />
          <div className={`absolute -bottom-16 -left-16 w-60 h-60 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
            browserGuardStatus.enabled ? 'bg-indigo-500/10' : 'bg-transparent'
          }`} />

          {/* 1. Header & Master Switch Row (Concept B + VisionOS) */}
          <div className="flex items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              {/* Serene Shield Orb */}
              <div className="relative">
                <div className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${
                  browserGuardStatus.enabled ? 'bg-cyan-400/30 scale-125' : 'bg-transparent'
                }`} />
                <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 shadow-md ${
                  browserGuardStatus.enabled
                    ? 'bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 border-cyan-400/40 text-cyan-400 shadow-cyan-500/20'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}>
                  <ShieldCheck className="w-6 h-6 stroke-[1.9]" />
                </div>
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>حارس المتصفح</span>
                  <span className={`w-2 h-2 rounded-full ${
                    browserGuardStatus.enabled ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse' : 'bg-slate-600'
                  }`} />
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  قفل فوري (0ms) لحماية خصوصية تصفحك
                </p>
              </div>
            </div>

            {/* Apple-Style Smooth Slider Toggle Button */}
            <button
              onClick={handleToggleBrowserGuard}
              className={`group flex items-center gap-3 px-4 py-2 rounded-full font-bold text-xs transition-all duration-300 shadow-md shrink-0 cursor-pointer ${
                browserGuardStatus.enabled
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-cyan-500/25 border border-cyan-400/40 hover:scale-[1.02]'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
              }`}
            >
              <span className="text-[12px]">{browserGuardStatus.enabled ? 'نشط' : 'معطل'}</span>
              <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                browserGuardStatus.enabled ? 'bg-white/30 justify-end' : 'bg-white/15 justify-start'
              }`}>
                <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200" />
              </div>
            </button>
          </div>

          {/* 2. Grouped Integrated Capsule for PIN & Security Lockout (Concept C) */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <span>رمز الدخول (PIN)</span>
                  <span className="text-[11px] text-slate-400 font-mono tracking-wider">
                    {browserGuardStatus.hasPin ? '••••' : 'غير محدد'}
                  </span>
                </div>
                <div className="text-[10.5px] text-slate-400 mt-0.5">
                  قفل الويندوز تلقائياً (Win + L) بعد محاولتين خطأ (2)
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setPinInput('');
                setConfirmPinInput('');
                setPinError('');
                setIsPinModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 hover:border-cyan-400/30 transition-all shrink-0 self-end sm:self-center cursor-pointer"
            >
              {browserGuardStatus.hasPin ? 'تعديل الرمز 🔑' : 'تعيين الرمز 🔑'}
            </button>
          </div>

          {/* Dedicated Full Browser Lock Section */}
          <div className="space-y-3 relative z-10">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <span>المتصفحات المحمية بالكامل</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  {protectedCount} متصفح محمي 🔒
                </span>
              </span>
              <span className="text-[10.5px] text-slate-400">
                انقر على المتصفح لتفعيله أو إلغاء قفله
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {knownList.map((browser) => {
                const isSelected = (browserGuardStatus.protectedBrowsers || []).includes(browser.proc);
                return (
                  <button
                    key={browser.proc}
                    onClick={() => handleToggleBrowser(browser.proc)}
                    className={`flex items-center justify-between p-3 rounded-2xl text-xs font-medium border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400/40 text-white shadow-sm shadow-cyan-500/10 hover:border-cyan-300'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg shrink-0">{browser.icon}</span>
                      <span className="font-semibold truncate">{browser.name}</span>
                    </div>
                    <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                      isSelected ? 'bg-cyan-400 shadow-[0_0_8px_#38bdf8]' : 'bg-white/10'
                    }`} />
                  </button>
                );
              })}
            </div>

            {/* Informational security banner */}
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                <span className="text-white font-semibold">ميزة قفل المتصفح بالكامل: </span>
                عند تشغيل أو التبديل إلى المتصفح، تظهر شاشة القفل فوراً (0ms). وتظل الجلسة مفتوحة أثناء استخدامك النشط للمتصفح دون مقاطعة، ولكن بمجرد الخروج من المتصفح أو الانتقال لأي نافذة أخرى يُقفل فوراً ويطلب رمز PIN عند الرجوع.
              </div>
            </div>
          </div>
        </div>

        {/* Calm Footer Hint */}
        <div className="text-center text-[11px] text-slate-400 mt-3.5 flex items-center justify-center gap-2">
          <span>⚡ استجابة فورية 0ms</span>
          <span>•</span>
          <span>🔒 قفل عند التبديل</span>
          <span>•</span>
          <span>🛡️ قفل الويندوز بعد محاولتين (2)</span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 gap-4 select-none pb-12"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).map((f) => f.path);
        if (files.length > 0) {
          setSelectedPaths(files);
          setIsAddModalOpen(true);
        }
      }}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-sky-500/15 border border-sky-400/20 flex items-center justify-center text-sky-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white">حارس المتصفح الذكي</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border ${
            browserGuardStatus.enabled
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-white/5 text-slate-400 border-white/5'
          }`}>
            {browserGuardStatus.enabled ? 'نشط ومراقب 🔒' : 'متوقف'}
          </span>
        </div>
      </div>

      {/* Main Tab Content - Browser Guard Only */}
      {activeVaultTab === 'browser_guard' ? (
        renderBrowserGuard()
      ) : null}

      {false && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Stats Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold dim truncate">العناصر المحمية</div>
            <div className="text-lg font-bold font-mono tracking-tight mt-0.5">
              {stats.totalItems || 0}
              <span className="text-[11px] font-normal muted ms-1.5 font-sans">
                ({formatBytes(stats.totalBytes || 0)})
              </span>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold dim truncate">مقفل (مشفر بمكانه)</div>
            <div className="text-lg font-bold font-mono tracking-tight mt-0.5">{stats.lockedCount || 0}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <EyeOff className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold dim truncate">مخفي في الخزنة</div>
            <div className="text-lg font-bold font-mono tracking-tight mt-0.5">{stats.hiddenCount || 0}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold dim truncate">قفل وإخفاء (الحماية القصوى)</div>
            <div className="text-lg font-bold font-mono tracking-tight mt-0.5">{stats.lockedHiddenCount || 0}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'all' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            الكل ({items.length})
          </button>
          <button
            onClick={() => setFilterTab('media')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'media' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            صور وفيديوهات
          </button>
          <button
            onClick={() => setFilterTab('documents')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'documents' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            مستندات
          </button>
          <button
            onClick={() => setFilterTab('lock_hide')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'lock_hide' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            قفل وإخفاء
          </button>
          <button
            onClick={() => setFilterTab('hide')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'hide' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            مخفية فقط
          </button>
          <button
            onClick={() => setFilterTab('lock')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              filterTab === 'lock' ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-[var(--bg-surface-hover)] dim'
            }`}
          >
            مقفلة فقط
          </button>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو المسار..."
            className="w-full ps-8 pe-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] focus:border-indigo-400 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Protected Files List / Table */}
      <div className="flex-1 min-h-[380px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 text-indigo-400">
              <FolderOpen className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold">لا توجد ملفات في هذا القسم</p>
            <p className="text-xs muted mt-1 max-w-sm leading-relaxed">
              اسحب وأفلت أي صورة أو فيديو أو مستند هنا، أو اضغط كليك يمين على أي ملف في ويندوز واختر «قفل وإخفاء في الخزنة».
            </p>
            <button
              onClick={() => handlePickFiles(false)}
              className="mt-4 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة ملف أو مجلد الآن</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead className="sticky top-0 bg-[var(--bg-surface-hover)] border-b border-[var(--border-color)] z-10 text-[11px] font-semibold dim">
                <tr>
                  <th className="py-2.5 px-4 text-start">الملف</th>
                  <th className="py-2.5 px-4 text-start">حالة الحماية</th>
                  <th className="py-2.5 px-4 text-start">المسار الأصلي</th>
                  <th className="py-2.5 px-4 text-start">الحجم</th>
                  <th className="py-2.5 px-4 text-start">تاريخ الإضافة</th>
                  <th className="py-2.5 px-4 text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors group">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getFileIcon(item.file_type)}
                        <span className="font-semibold truncate max-w-[200px]" title={item.file_name}>
                          {item.file_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {getModeBadge(item.mode)}
                        {item.isTempOpen && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Unlock className="w-3 h-3" />
                            <span>مفتوح مؤقتاً</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="dim truncate max-w-[240px] block font-mono text-[10.5px]" dir="ltr" title={item.original_path}>
                        {item.original_path}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono dim">{formatBytes(item.file_size)}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap dim font-mono text-[10.5px]">{item.created_at}</td>
                    <td className="py-2.5 px-4 text-end whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.file_type === 'image' && (
                          <button
                            onClick={() => handlePreview(item)}
                            className="p-1.5 rounded-md hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all"
                            title="معاينة الصورة بأمان"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleLaunchItem(item)}
                          className="px-2.5 py-1 rounded-md bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[11px] font-semibold transition-all flex items-center gap-1"
                          title={item.file_type === 'folder' ? 'فتح المجلد المؤقت' : 'فك القفل وتشغيل الملف فوراً'}
                        >
                          {item.file_type === 'folder' ? <FolderOpen className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          <span>{item.file_type === 'folder' ? 'فتح' : 'تشغيل'}</span>
                        </button>

                        {item.isTempOpen ? (
                          <button
                            onClick={() => handleRelockTemp(item)}
                            className="px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-all flex items-center gap-1"
                            title="إعادة قفل المجلد الآن (تشفير فوري)"
                          >
                            <Lock className="w-3 h-3" />
                            <span>قفل الآن</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreItem(item)}
                            className="px-2.5 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-all flex items-center gap-1"
                            title={item.file_type === 'folder' ? 'استعادة المجلد وفك قفله نهائياً' : 'استعادة وفك القفل لمكانه الأصلي'}
                          >
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>استعادة</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 rounded-md hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-all opacity-0 group-hover:opacity-100"
                          title="حذف نهائي من الخزنة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}

      {/* ========================================================
          ADD ITEM MODAL (3 DISTINCT MODES AS REQUESTED)
      ======================================================== */}
      {isAddModalOpen && false && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-6 shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold">اختيار وضع الحماية في الخزنة</h3>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedPaths([]);
                }}
                className="p-1 rounded-lg hover:bg-[var(--bg-surface-hover)] muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Files summary */}
            <div className="p-3 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-xs">
              <div className="dim font-semibold mb-1">الملفات المحددة ({selectedPaths.length}):</div>
              <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px]" dir="ltr">
                {selectedPaths.map((p, idx) => (
                  <div key={idx} className="truncate text-indigo-300">
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {/* 3 Distinct Options */}
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-bold dim">اختر طريقة الحماية:</div>

              {/* Option 1: Lock */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedMode === 'lock'
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <input
                  type="radio"
                  name="vault_mode"
                  checked={selectedMode === 'lock'}
                  onChange={() => setSelectedMode('lock')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-300">
                    <Lock className="w-3.5 h-3.5" />
                    <span>1. قفل فقط (Lock - تشفير في مكانه)</span>
                  </div>
                  <p className="text-[11px] muted mt-0.5 leading-relaxed">
                    يتم تشفير الملف فوراً بـ AES-256 ويبقى في نفس مكانه، لكن لا يمكن لأي شخص أو برنامج فتحه أبداً بدون البرنامج.
                  </p>
                </div>
              </label>

              {/* Option 2: Hide */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedMode === 'hide'
                    ? 'border-sky-500 bg-sky-500/10 shadow-sm'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <input
                  type="radio"
                  name="vault_mode"
                  checked={selectedMode === 'hide'}
                  onChange={() => setSelectedMode('hide')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-sky-300">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>2. إخفاء فقط (Hide - نقل للخزنة)</span>
                  </div>
                  <p className="text-[11px] muted mt-0.5 leading-relaxed">
                    يتم إخفاء الملف ونقله للخزنة السرية ويختفي تماماً من سطح المكتب ومستكشف ملفات ويندوز.
                  </p>
                </div>
              </label>

              {/* Option 3: Lock & Hide */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  selectedMode === 'lock_hide'
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <input
                  type="radio"
                  name="vault_mode"
                  checked={selectedMode === 'lock_hide'}
                  onChange={() => setSelectedMode('lock_hide')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>3. قفل وإخفاء (Lock & Hide - الحماية القصوى) ⭐</span>
                  </div>
                  <p className="text-[11px] muted mt-0.5 leading-relaxed">
                    تشفير عسكري للبيانات + إخفاء تام من ويندوز ونقله إلى داخل الخزنة. أعلى درجات الأمان والخصوصية!
                  </p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedPaths([]);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[var(--bg-surface-hover)] dim transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={actionProcessing}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white shadow-md transition-all flex items-center gap-2"
              >
                {actionProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>تطبيق الحماية فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          IMAGE PREVIEW MODAL
      ======================================================== */}
      {previewItem && false && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-pink-400 shrink-0" />
                <span className="font-bold text-sm truncate">{previewItem.file_name}</span>
                {getModeBadge(previewItem.mode)}
              </div>
              <button onClick={() => setPreviewItem(null)} className="p-1 rounded-lg hover:bg-[var(--bg-surface-hover)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-[300px] flex items-center justify-center overflow-hidden bg-black/40 rounded-xl p-2">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs dim">جاري فك التشفير الآمن للمعاينة...</span>
                </div>
              ) : previewData?.dataUrl ? (
                <img
                  src={previewData.dataUrl}
                  alt={previewItem.file_name}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div className="text-center text-xs text-rose-300">
                  {previewData?.error || 'المعاينة غير مدعومة لهذا النوع من الملفات'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs dim font-mono">{formatBytes(previewItem.file_size)}</span>
              <button
                onClick={() => {
                  handleRestoreItem(previewItem);
                  setPreviewItem(null);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1.5"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>استعادة وفك القفل للملف</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          BROWSER GUARD PIN SETUP MODAL
      ======================================================== */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-surface)] border border-white/10 p-6 flex flex-col gap-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-white">تعيين رمز PIN لقفل المتصفح</h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              عيّن رمز PIN من 3 إلى 8 أرقام لفتح المتصفح فوراً عند العودة إليه بعد تصغيره أو التبديل عنه.
            </p>

            <form onSubmit={handleSavePin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11.5px] font-semibold text-slate-400 block">رمز PIN الجديد:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="مثال: 1234 أو 789"
                  className="w-full px-4 py-2.5 rounded-2xl text-center font-mono tracking-widest text-lg bg-white/[0.03] border border-white/10 focus:border-sky-400 focus:bg-white/[0.05] focus:outline-none transition-all text-white placeholder:text-slate-600"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11.5px] font-semibold text-slate-400 block">تأكيد رمز PIN:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="أعد إدخال الرمز للتأكيد..."
                  className="w-full px-4 py-2.5 rounded-2xl text-center font-mono tracking-widest text-lg bg-white/[0.03] border border-white/10 focus:border-sky-400 focus:bg-white/[0.05] focus:outline-none transition-all text-white placeholder:text-slate-600"
                />
              </div>

              {pinError && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={pinLoading}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white shadow-md shadow-sky-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {pinLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>حفظ رمز الـ PIN</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
