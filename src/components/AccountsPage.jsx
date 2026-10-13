import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  Check,
  Link2Off,
  RefreshCw,
  HardDrive,
  FolderLock,
  AlertTriangle,
  ShieldCheck,
  Plus,
  Trash2,
  Server,
  Database,
  X,
  KeyRound,
  ExternalLink,
  Copy
} from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes, formatPercent } from '../format';

const OAUTH_SUBTITLE_KEY = {
  google: 'accounts.subGoogle',
  onedrive: 'accounts.subOneDrive',
  dropbox: 'accounts.subDropbox'
};

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
    return true;
  } catch (_) {
    return false;
  }
}

// Famous services covered by each protocol
const WEBDAV_SERVICES = [
  'Nextcloud', 'ownCloud', 'Box', 'Yandex.Disk', 'pCloud', 'Koofr', '4shared',
  'Mail.ru Cloud', 'STRATO HiDrive', 'MagentaCLOUD', 'GMX Cloud', 'WEB.DE Cloud',
  'Seafile', 'Synology DiskStation', 'OpenDrive', 'InfiniCLOUD', 'Jianguoyun',
  'SharePoint (WebDAV)'
];

const S3_SERVICES = [
  'AWS S3', 'Backblaze B2', 'Cloudflare R2', 'Wasabi', 'DigitalOcean Spaces',
  'MinIO', 'Storj', 'IDrive e2', 'Scaleway', 'Linode Object Storage',
  'Oracle Cloud Storage', 'IBM COS', 'Alibaba OSS'
];

const TYPE_ICONS = { google: Cloud, onedrive: Cloud, dropbox: Cloud, webdav: Server, s3: Database };

function FormField({ label, value, onChange, placeholder, type: inputType = 'text' }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold muted">{label}</span>
      <input
        type={inputType}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        dir="ltr"
        className="input"
      />
    </label>
  );
}

function AddAccountModal({ type, onClose, onSubmit, busy, error }) {
  const { t } = useI18n();
  const [form, setForm] = useState(
    type === 'webdav'
      ? { label: '', url: '', username: '', password: '' }
      : { label: '', endpoint: '', region: 'us-east-1', bucket: '', accessKeyId: '', secretAccessKey: '' }
  );

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (type === 'webdav') {
      onSubmit({
        type,
        label: form.label || form.url,
        config: { url: form.url, username: form.username },
        secret: { password: form.password }
      });
    } else {
      onSubmit({
        type,
        label: form.label || form.bucket,
        config: {
          endpoint: form.endpoint,
          region: form.region,
          bucket: form.bucket,
          accessKeyId: form.accessKeyId
        },
        secret: { secretAccessKey: form.secretAccessKey }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <form onSubmit={handleSubmit} className="surface p-6 w-full max-w-md fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {type === 'webdav' ? <Server className="w-5 h-5" /> : <Database className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-[14px] font-extrabold">
                {type === 'webdav' ? t('accounts.addWebdav') : t('accounts.addS3')}
              </h3>
              <p className="text-[10.5px] dim">{t('accounts.addAccountDesc')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <FormField label={t('accounts.fieldLabel')} value={form.label} onChange={set('label')} placeholder={type === 'webdav' ? 'My Nextcloud' : 'My S3 bucket'} />

          {type === 'webdav' ? (
            <>
              <FormField label={t('accounts.fieldUrl')} value={form.url} onChange={set('url')} placeholder="https://cloud.example.com/remote.php/dav/files/user/" />
              <FormField label={t('accounts.fieldUsername')} value={form.username} onChange={set('username')} placeholder="username" />
              <FormField label={t('accounts.fieldPassword')} value={form.password} onChange={set('password')} placeholder="app password" type="password" />
            </>
          ) : (
            <>
              <FormField label={t('accounts.fieldEndpoint')} value={form.endpoint} onChange={set('endpoint')} placeholder="https://s3.us-east-1.amazonaws.com" />
              <FormField label={t('accounts.fieldRegion')} value={form.region} onChange={set('region')} placeholder="us-east-1" />
              <FormField label={t('accounts.fieldBucket')} value={form.bucket} onChange={set('bucket')} placeholder="my-bucket" />
              <FormField label={t('accounts.fieldAccessKey')} value={form.accessKeyId} onChange={set('accessKeyId')} placeholder="AKIA..." />
              <FormField label={t('accounts.fieldSecretKey')} value={form.secretAccessKey} onChange={set('secretAccessKey')} placeholder="••••••••" type="password" />
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-lg text-[11px] leading-relaxed" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }} dir="ltr">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn">
            {t('files.close')}
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('accounts.addButton')}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActivateModal({ provider, onClose, onSave, busy, error }) {
  const { t } = useI18n();
  const type = provider.type || provider.id;
  const [form, setForm] = useState(
    type === 'onedrive'
      ? { clientId: '', tenant: 'common' }
      : { appKey: '', appSecret: '' }
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const redirectUri = type === 'onedrive' ? 'http://localhost:58292' : 'http://localhost:58293';
  const portalUrl = type === 'onedrive'
    ? 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade'
    : 'https://www.dropbox.com/developers/apps/create';

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const copyRedirect = async () => {
    const ok = await copyToClipboard(redirectUri);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (type === 'onedrive') {
      onSave({ clientId: form.clientId, tenant: form.tenant });
    } else {
      onSave({ appKey: form.appKey, appSecret: form.appSecret });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <form onSubmit={submit} className="surface p-6 w-full max-w-lg fade-in" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-extrabold">
                {type === 'onedrive' ? t('accounts.activateOneDriveTitle') : t('accounts.activateDropboxTitle')}
              </h3>
              <p className="text-[10.5px] dim">{t('accounts.activateHint')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="p-3.5 rounded-xl text-[11.5px] leading-relaxed whitespace-pre-wrap"
          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', unicodeBidi: 'plaintext' }}
        >
          {type === 'onedrive' ? t('accounts.azureSteps') : t('accounts.dropboxSteps')}
        </div>

        <div className="flex flex-wrap gap-2 mt-3 mb-4">
          <button
            type="button"
            onClick={() => window.electronAPI?.openExternal && window.electronAPI.openExternal(portalUrl)}
            className="btn btn-outline h-8 px-3 text-[11px]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {type === 'onedrive' ? t('accounts.openAzure') : t('accounts.openDropbox')}
          </button>
          <button type="button" onClick={copyRedirect} className="btn btn-outline h-8 px-3 text-[11px]">
            <Copy className="w-3.5 h-3.5" />
            {copied ? t('accounts.copied') : t('accounts.copyRedirect')}
          </button>
          <span className="text-[10px] dim self-center font-mono" dir="ltr">
            {redirectUri}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {type === 'onedrive' ? (
            <>
              <FormField label={t('accounts.clientId')} value={form.clientId} onChange={set('clientId')} placeholder="00000000-0000-0000-0000-000000000000" />
              <FormField label={t('accounts.tenantOptional')} value={form.tenant} onChange={set('tenant')} placeholder="common" />
            </>
          ) : (
            <>
              <FormField label={t('accounts.appKey')} value={form.appKey} onChange={set('appKey')} placeholder="your-app-key" />
              <FormField label={t('accounts.appSecretOptional')} value={form.appSecret} onChange={set('appSecret')} placeholder="optional" type="password" />
            </>
          )}
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-lg text-[11px] leading-relaxed" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }} dir="ltr">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn">
            {t('files.close')}
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('accounts.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AccountsPage({ providers = [], folders = [], onChanged, showToast }) {
  const { t } = useI18n();
  const [addModal, setAddModal] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [activateProvider, setActivateProvider] = useState(null);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState(null);

  const folderCountFor = (accountId) => folders.filter((f) => (f.provider || 'google') === accountId).length;

  const isOauth = (p) => ['google', 'onedrive', 'dropbox'].includes(p.type || p.id);
  const BUILTIN_OAUTH_FALLBACK = [
    { id: 'google', type: 'google', label: 'Google Drive', configured: false, connected: false },
    { id: 'onedrive', type: 'onedrive', label: 'OneDrive', configured: false, connected: false },
    { id: 'dropbox', type: 'dropbox', label: 'Dropbox', configured: false, connected: false }
  ];
  // All built-in clouds are shown with a plain "Connect" action; if a cloud is
  // not activated yet the distributor gets a one-time "Activate" button instead.
  const oauthProviders = ['google', 'onedrive', 'dropbox'].map((id) => {
    const live = providers.find((p) => (p.type || p.id) === id);
    return live || BUILTIN_OAUTH_FALLBACK.find((b) => b.id === id);
  });
  const customProviders = providers.filter((p) => !isOauth(p));

  const refresh = async () => {
    if (onChanged) await onChanged();
  };

  const handleConnect = async (provider) => {
    if (!window.electronAPI?.connectProvider) return;
    setBusyId(provider.id);
    try {
      const res = await window.electronAPI.connectProvider(provider.id);
      if (res && res.success) {
        showToast(t('accounts.connectSuccess'), 'success');
      } else {
        showToast(t('accounts.connectFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
      await refresh();
    } catch (err) {
      showToast(t('accounts.connectFailed', { error: err.message }), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (provider) => {
    if (!window.electronAPI?.disconnectProvider) return;
    setBusyId(provider.id);
    try {
      const res = await window.electronAPI.disconnectProvider(provider.id);
      if (res && res.success) {
        showToast(t('accounts.disconnectSuccess'), 'info');
      } else {
        showToast(t('accounts.disconnectFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
      await refresh();
    } catch (err) {
      showToast(t('accounts.disconnectFailed', { error: err.message }), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveCustom = async (provider) => {
    if (!window.electronAPI?.removeCustomProvider) return;
    setBusyId(provider.id);
    try {
      const res = await window.electronAPI.removeCustomProvider(provider.id);
      if (res && res.success) {
        showToast(t('accounts.removeSuccess'), 'info');
      } else if (res && res.code === 'ACCOUNT_IN_USE') {
        showToast(t('accounts.removeBlocked', { count: res.linkedFolders || 0 }), 'error');
      } else {
        showToast(t('accounts.disconnectFailed', { error: (res && res.error) || 'unknown' }), 'error');
      }
      await refresh();
    } catch (err) {
      showToast(t('accounts.disconnectFailed', { error: err.message }), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddCustom = async (payload) => {
    if (!window.electronAPI?.addCustomProvider) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await window.electronAPI.addCustomProvider(payload);
      if (res && res.success) {
        showToast(t('accounts.addSuccess', { label: res.account.label }), 'success');
        setAddModal(null);
        await refresh();
      } else {
        setAddError((res && res.error) || 'Connection failed');
      }
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddBusy(false);
    }
  };

  const handleActivate = async (payload) => {
    if (!window.electronAPI?.setProviderCredentials || !activateProvider) return;
    setActivateBusy(true);
    setActivateError(null);
    try {
      const res = await window.electronAPI.setProviderCredentials(
        activateProvider.type || activateProvider.id,
        payload
      );
      if (res && res.success) {
        showToast(t('accounts.saved'), 'success');
        setActivateProvider(null);
        await refresh();
      } else {
        setActivateError((res && res.error) || 'failed');
      }
    } catch (err) {
      setActivateError(err.message);
    } finally {
      setActivateBusy(false);
    }
  };

  const AccountCard = ({ provider, isCustom }) => {
    const connected = !!provider.connected;
    const configured = provider.configured !== false;
    const storage = provider.storage;
    const percent = storage && storage.limit ? formatPercent(storage.usage, storage.limit) : null;
    const linked = folderCountFor(provider.id);
    const busy = busyId === provider.id;
    const Icon = TYPE_ICONS[provider.type] || Cloud;

    return (
      <div className="surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: connected ? 'var(--accent-soft)' : 'var(--bg-surface-hover)',
                color: connected ? 'var(--accent)' : 'var(--text-dim)'
              }}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-extrabold">{provider.label}</span>
                {connected ? (
                  <span className="badge badge-success">
                    <Check className="w-3 h-3" />
                    {t('accounts.connected')}
                  </span>
                ) : configured ? (
                  <span className="badge badge-neutral">{t('accounts.disconnected')}</span>
                ) : null}
                {provider.type && (
                  <span className="badge badge-accent">{provider.type.toUpperCase()}</span>
                )}
              </div>

              {connected && provider.user ? (
                <div className="text-[11.5px] mt-1 muted truncate">
                  {provider.user.name || ''}
                  {provider.user.email ? (
                    <>
                      <span className="dim"> • </span>
                      <span dir="ltr">{provider.user.email}</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="text-[11.5px] mt-1 dim">
                  {t(OAUTH_SUBTITLE_KEY[provider.type || provider.id] || 'accounts.subGoogle')}
                </div>
              )}

              {connected && linked > 0 && (
                <div className="text-[11px] mt-1.5 muted flex items-center gap-1.5">
                  <FolderLock className="w-3.5 h-3.5" />
                  {t('accounts.activeFolders', { count: linked })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isCustom ? (
              <button onClick={() => handleRemoveCustom(provider)} disabled={busy} className="btn btn-danger">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('accounts.remove')}
              </button>
            ) : !configured ? (
              <button
                onClick={() => {
                  setActivateError(null);
                  setActivateProvider(provider);
                }}
                className="btn btn-outline"
              >
                <KeyRound className="w-4 h-4" />
                {t('accounts.activate')}
              </button>
            ) : connected ? (
              <button onClick={() => handleDisconnect(provider)} disabled={busy} className="btn btn-danger">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
                {t('accounts.disconnect')}
              </button>
            ) : (
              <button onClick={() => handleConnect(provider)} disabled={busy} className="btn btn-primary">
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {t('accounts.connect')}
              </button>
            )}
          </div>
        </div>

        {connected && storage && (
          <div className="mt-4 p-3.5 rounded-xl" style={{ background: 'var(--bg-main)' }}>
            <div className="flex items-center justify-between text-[11px] muted mb-2">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                {t('accounts.storageUsedLabel')} <span dir="ltr">{formatBytes(storage.usage)}</span>
              </span>
              <span>
                {storage.limit ? (
                  <>
                    {t('accounts.storageTotalLabel')} <span dir="ltr">{formatBytes(storage.limit)}</span>
                  </>
                ) : (
                  '∞'
                )}
              </span>
            </div>
            {percent != null && (
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${percent}%`,
                    background: percent >= 90 ? 'var(--danger)' : percent >= 75 ? 'var(--warning)' : 'var(--accent)'
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fade-in flex flex-col gap-5 max-w-3xl pb-12">
      {/* OAuth accounts */}
      <div className="flex flex-col gap-4">
        {oauthProviders.map((provider) => (
          <AccountCard key={provider.id} provider={provider} isCustom={false} />
        ))}
      </div>

      {/* Custom accounts */}
      {customProviders.length > 0 && (
        <div className="flex flex-col gap-4">
          {customProviders.map((provider) => (
            <AccountCard key={provider.id} provider={provider} isCustom />
          ))}
        </div>
      )}

      {/* Add account */}
      <div className="surface p-5">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="w-4 h-4 accent-text" />
          <h2 className="text-[13px] font-extrabold">{t('accounts.addAccount')}</h2>
        </div>
        <p className="text-[11.5px] dim leading-relaxed mb-4">{t('accounts.addAccountHint')}</p>

        <div className="flex flex-wrap gap-3">
          <button onClick={() => { setAddError(null); setAddModal('webdav'); }} className="btn">
            <Server className="w-4 h-4" />
            {t('accounts.addWebdav')}
          </button>
          <button onClick={() => { setAddError(null); setAddModal('s3'); }} className="btn">
            <Database className="w-4 h-4" />
            {t('accounts.addS3')}
          </button>
          <button onClick={() => setShowCatalog((v) => !v)} className="btn btn-ghost accent-text">
            <Cloud className="w-4 h-4" />
            {t('accounts.catalogButton')}
          </button>
        </div>
      </div>

      {/* Supported services catalog */}
      {showCatalog && (
        <div className="surface p-5 fade-in">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--success)' }} />
            <h2 className="text-[13px] font-extrabold">{t('accounts.catalogTitle')}</h2>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Cloud className="w-3.5 h-3.5 accent-text" />
              <span className="text-[11.5px] font-bold">{t('accounts.nativeTitle')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Google Drive', 'Microsoft OneDrive', 'Dropbox'].map((name) => (
                <span key={name} className="badge badge-success">{name}</span>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-3.5 h-3.5 accent-text" />
              <span className="text-[11.5px] font-bold">{t('accounts.webdavTitle')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEBDAV_SERVICES.map((name) => (
                <span key={name} className="badge badge-accent">{name}</span>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-3.5 h-3.5 accent-text" />
              <span className="text-[11.5px] font-bold">{t('accounts.s3Title')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {S3_SERVICES.map((name) => (
                <span key={name} className="badge badge-accent">{name}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="surface p-4 flex items-start gap-3" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <p className="text-[11.5px] leading-relaxed muted">{t('accounts.subtitle')}</p>
      </div>

      {addModal && (
        <AddAccountModal
          type={addModal}
          busy={addBusy}
          error={addError}
          onClose={() => setAddModal(null)}
          onSubmit={handleAddCustom}
        />
      )}

      {/* One-time activation modal (distributor) */}
      {activateProvider && (
        <ActivateModal
          provider={activateProvider}
          busy={activateBusy}
          error={activateError}
          onClose={() => setActivateProvider(null)}
          onSave={handleActivate}
        />
      )}
    </div>
  );
}
