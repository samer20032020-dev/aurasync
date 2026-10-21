import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, Copy, X, Cloud } from 'lucide-react';
import { useI18n } from '../i18n';

export default function CloudTitleBar({ stats, isSyncing, isMaximized: propIsMaximized }) {
  const { lang } = useI18n();
  const [isMaximized, setIsMaximized] = useState(propIsMaximized || false);
  const lastMaxClickRef = useRef(0);

  useEffect(() => {
    if (propIsMaximized !== undefined) {
      setIsMaximized(propIsMaximized);
    }
  }, [propIsMaximized]);

  useEffect(() => {
    if (!window.electronAPI) return;

    if (window.electronAPI.isWindowMaximized) {
      window.electronAPI.isWindowMaximized().then((max) => setIsMaximized(!!max)).catch(() => {});
    }

    if (window.electronAPI.onMaximizedChange) {
      const cleanup = window.electronAPI.onMaximizedChange((max) => {
        setIsMaximized(max);
      });
      return cleanup;
    }
  }, []);

  const handleMinimize = (e) => {
    e.stopPropagation();
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const now = Date.now();
    if (now - lastMaxClickRef.current < 350) return;
    lastMaxClickRef.current = now;
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow();
    }
  };

  const handleClose = (e) => {
    e.stopPropagation();
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const isRtl = lang === 'ar';

  return (
    <div
      onDoubleClick={handleMaximize}
      className="window-drag-region h-10 w-full flex items-center justify-between px-3 shrink-0 select-none relative z-50"
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid var(--border-color)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Cloud App Identity */}
      <div className="flex items-center gap-2.5 window-no-drag">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
          style={{
            backgroundColor: 'var(--accent-soft)',
            border: '1px solid var(--border-strong)',
            color: 'var(--accent)'
          }}
        >
          <Cloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-extrabold tracking-wide" style={{ color: 'var(--text-main)' }}>
            AuraSync
          </span>
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)'
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }}></span>
            {isRtl ? 'سحابة ذكية' : 'Smart Cloud'}
          </span>
        </div>
      </div>

      {/* Draggable center space */}
      <div className="flex-1 h-full window-drag-region" />

      {/* Window Controls */}
      <div className="flex items-center gap-1 window-no-drag">
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="w-8 h-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)] active:scale-95 transition-all"
          style={{ color: 'var(--text-muted)' }}
          title={isRtl ? 'تصغير النافذة' : 'Minimize'}
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={handleMaximize}
          className="w-8 h-7 rounded-md flex items-center justify-center hover:bg-[var(--bg-surface-hover)] active:scale-95 transition-all"
          style={{ color: 'var(--text-muted)' }}
          title={isMaximized ? (isRtl ? 'استعادة الحجم' : 'Restore') : (isRtl ? 'تكبير النافذة' : 'Maximize')}
          aria-label="Maximize or Restore"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-8 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-200 hover:bg-rose-500/25 active:scale-95 transition-all"
          title={isRtl ? 'إغلاق البرنامج' : 'Close'}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
