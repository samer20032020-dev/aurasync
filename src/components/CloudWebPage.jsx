import React, { useEffect, useRef, useState } from 'react';
import { Globe, RefreshCw, ExternalLink, Cloud, ShieldCheck, Folder, Lock } from 'lucide-react';
import { useI18n } from '../i18n';

// Web dashboards for the main providers — the full cloud UI, embedded in-app
const WEB_URLS = {
  google: 'https://drive.google.com/drive/my-drive',
  onedrive: 'https://onedrive.live.com/',
  dropbox: 'https://www.dropbox.com/home',
  box: 'https://app.box.com/folder/0',
  yandex: 'https://disk.yandex.com/client/disk'
};

export function getProviderWebUrl(provider) {
  if (!provider) return '';
  const email = provider.user?.email;
  if (provider.id === 'google') {
    if (email) {
      return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(email)}&continue=${encodeURIComponent('https://drive.google.com/drive/my-drive')}`;
    }
    return WEB_URLS.google;
  }
  if (provider.id === 'onedrive') {
    if (email) {
      return `https://onedrive.live.com/?login_hint=${encodeURIComponent(email)}`;
    }
    return WEB_URLS.onedrive;
  }
  if (provider.id === 'dropbox') {
    if (email) {
      return `https://www.dropbox.com/login?login_email=${encodeURIComponent(email)}`;
    }
    return WEB_URLS.dropbox;
  }
  return WEB_URLS[provider.id] || '';
}

// A clean Chrome UA
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export default function CloudWebPage({ providers = [], onNavigate }) {
  const { t } = useI18n();
  const connected = providers.filter((p) => p.connected && (WEB_URLS[p.id] || getProviderWebUrl(p)));
  const [activeId, setActiveId] = useState(connected[0]?.id || null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [forceEmbed, setForceEmbed] = useState(false);
  const webviewRef = useRef(null);

  const active = connected.find((p) => p.id === activeId) || connected[0] || null;
  const currentUrl = getProviderWebUrl(active);
  const isGoogle = active?.id === 'google';

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return undefined;
    const onStart = () => {
      setLoading(true);
      setFailed(false);
    };
    const onStop = () => setLoading(false);
    const onFail = () => {
      setLoading(false);
      setFailed(true);
    };
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-fail-load', onFail);
    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, [activeId, currentUrl]);

  const reload = () => {
    try {
      webviewRef.current?.reload();
    } catch (_) {}
  };

  const openExternal = () => {
    if (currentUrl && window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(currentUrl);
    }
  };

  if (!connected.length) {
    return (
      <div className="fade-in max-w-5xl">
        <section className="surface p-10 text-center flex flex-col items-center gap-3">
          <Cloud className="w-8 h-8 dim" />
          <p className="text-[12.5px] muted">{t('cloudWeb.noAccount')}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="fade-in flex flex-col gap-3 max-w-6xl pb-6" style={{ height: 'calc(100vh - 160px)', minHeight: '460px' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="page-tabs">
          {connected.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={active?.id === p.id ? 'on' : ''}
            >
              <Globe className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="btn h-8 px-3 text-[11px]" title={t('cloudWeb.reload')}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openExternal} className="btn h-8 px-3 text-[11px]">
            <ExternalLink className="w-3.5 h-3.5" />
            {t('cloudWeb.openExternal')}
          </button>
        </div>
      </div>

      <div className="surface overflow-hidden flex-1 relative min-h-0">
        {loading && !failed && (
          <div className="absolute inset-x-0 top-0 h-0.5 z-10 overflow-hidden" style={{ background: 'var(--accent-soft)' }}>
            <div className="h-full w-1/3 animate-pulse" style={{ background: 'var(--accent)' }} />
          </div>
        )}

        {isGoogle && !forceEmbed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center p-8 overflow-y-auto">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                <Cloud className="w-8 h-8 text-blue-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-black shadow">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1.5 max-w-lg">
              {active?.user?.email && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {active.user.email} • {t('cloudWeb.googleAccountConnected')}
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-100 mt-2">
                {t('cloudWeb.googleSecurityTitle')}
              </h3>
              <p className="text-[12.5px] muted leading-relaxed">
                {t('cloudWeb.googleSecurityDesc')}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button
                onClick={openExternal}
                className="btn btn-primary h-10 px-5 text-[12.5px] font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-transform"
              >
                <ExternalLink className="w-4 h-4" />
                {t('cloudWeb.openDriveNow')}
              </button>

              {onNavigate && (
                <button
                  onClick={() => onNavigate('files')}
                  className="btn h-10 px-4 text-[12.5px]"
                >
                  <Folder className="w-4 h-4" />
                  {t('cloudWeb.viewLocalFiles')}
                </button>
              )}
            </div>

            <button
              onClick={() => setForceEmbed(true)}
              className="text-[11px] dim hover:text-slate-300 underline underline-offset-4 mt-2 transition-colors"
            >
              {t('cloudWeb.tryEmbedAnyway')}
            </button>
          </div>
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="text-[12px] muted max-w-md leading-relaxed">{t('cloudWeb.blocked')}</p>
            <div className="flex items-center gap-2">
              <button onClick={openExternal} className="btn btn-primary">
                <ExternalLink className="w-4 h-4" />
                {t('cloudWeb.openExternal')}
              </button>
              <button onClick={reload} className="btn">
                {t('cloudWeb.retry')}
              </button>
            </div>
          </div>
        ) : (
          active && (
            <webview
              key={`${active.id}-${active.user?.email || 'default'}`}
              ref={webviewRef}
              src={currentUrl}
              partition="persist:aura-cloud-web"
              useragent={CHROME_UA}
              allowpopups="true"
              style={{ display: 'inline-flex', width: '100%', height: '100%' }}
            />
          )
        )}
      </div>

      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <p className="text-[10.5px] dim">
          {active?.user?.email && (
            <span className="text-[11px] font-mono text-emerald-400/90 ml-1.5 ltr:mr-1.5">
              👤 {active.user.email} •
            </span>
          )}
          {t('cloudWeb.hint')}
        </p>
      </div>
    </div>
  );
}
