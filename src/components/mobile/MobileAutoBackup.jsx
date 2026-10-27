import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width:50, height:28, borderRadius:99, position:'relative',
        background: value ? 'linear-gradient(90deg,#2563eb,#4f46e5)' : 'rgba(51,65,85,0.6)',
        border: value ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
        transition:'all 0.22s ease', cursor:'pointer', outline:'none', flexShrink:0,
        boxShadow: value ? '0 0 14px rgba(59,130,246,0.4)' : 'none',
      }}
    >
      <div style={{
        position:'absolute', top:4, width:18, height:18, borderRadius:'50%',
        background:'#fff', transition:'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        left: value ? 'calc(100% - 22px)' : 4,
        boxShadow:'0 2px 8px rgba(0,0,0,0.5)',
      }}/>
    </button>
  );
}

function Card({ children, glow, style }) {
  return (
    <div style={{
      borderRadius:20, padding:'16px', marginBottom:12,
      background:'rgba(13,18,36,0.9)',
      border:`1px solid ${glow || 'rgba(255,255,255,0.07)'}`,
      backdropFilter:'blur(16px)',
      boxShadow: glow ? `0 4px 24px ${glow}18` : '0 2px 12px rgba(0,0,0,0.3)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = '#3b82f6', height = 4 }) {
  return (
    <div style={{ width:'100%', height, borderRadius:99, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{
        height:'100%', borderRadius:99,
        width:`${Math.min(100,Math.max(0,value))}%`,
        background:`linear-gradient(90deg,${color},${color}88)`,
        transition:'width 0.35s ease',
        boxShadow:`0 0 8px ${color}44`,
      }}/>
    </div>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
      {icon}
      <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#64748b' }}>
        {label}
      </span>
    </div>
  );
}

function ToggleRow({ icon, iconColor, title, subtitle, settingKey, value, onChange, last }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'12px 0',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, marginRight:12 }}>
        <div style={{
          width:38, height:38, borderRadius:12, flexShrink:0,
          background:`${iconColor}18`, border:`1px solid ${iconColor}30`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>{title}</div>
          <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{subtitle}</div>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export default function MobileAutoBackup({ onShowToast }) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const [settings, setSettings] = useState(mobileEngine.settings);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  const handleToggle = (key) => {
    triggerHaptic(15);
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    mobileEngine.saveSettings(updated);
    if (onShowToast) {
      const labels = {
        backupPhotos: { ar: ['تم تعطيل نسخ الصور', 'تم تفعيل نسخ الصور'], en: ['Photos backup disabled', 'Photos backup enabled'] },
        backupVideos: { ar: ['تم تعطيل نسخ الفيديو', 'تم تفعيل نسخ الفيديو'], en: ['Videos backup disabled', 'Videos backup enabled'] },
        backupAudio: { ar: ['تم تعطيل نسخ الصوتيات', 'تم تفعيل نسخ الصوتيات'], en: ['Audio backup disabled', 'Audio backup enabled'] },
        wifiOnly: { ar: ['إلغاء قيد Wi-Fi', 'تم تفعيل قيد Wi-Fi فقط'], en: ['Wi-Fi restriction removed', 'Wi-Fi only enabled'] },
        chargingOnly: { ar: ['إلغاء قيد الشحن', 'تم تفعيل قيد الشحن فقط'], en: ['Charging restriction removed', 'Charging only enabled'] },
      };
      const l = labels[key];
      if (l) {
        const idx = updated[key] ? 1 : 0;
        onShowToast(isRtl ? l.ar[idx] : l.en[idx], updated[key] ? 'success' : 'warn');
      }
    }
  };

  const handleSelectCloud = (cloud) => {
    triggerHaptic(20);
    const updated = { ...settings, selectedCloud: cloud };
    setSettings(updated);
    mobileEngine.saveSettings(updated);
    const name = cloud === 'google' ? 'Google Drive' : 'Microsoft OneDrive';
    if (onShowToast) onShowToast(
      isRtl ? `تم اختيار ${name} للنسخ الاحتياطي` : `${name} selected for backup`,
      'success'
    );
  };

  const backupInputRef = useRef(null);

  const handleBackupFilesSelected = async (e) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const fileArray = Array.from(selected);
    setIsBackingUp(true);
    setIsComplete(false);
    setBackupProgress(5);

    try {
      const result = await mobileEngine.uploadBatch(fileArray, {
        onProgress: ({ overallPercent, currentFileName }) => {
          setBackupProgress(overallPercent);
          setCurrentFile(currentFileName);
        }
      });

      setBackupProgress(100);
      setCurrentFile(isRtl ? '✓ اكتمل النسخ بنجاح!' : '✓ Backup complete!');
      triggerHaptic(50);
      setIsBackingUp(false);
      setIsComplete(true);
      const successCount = result.successful ? result.successful.length : 0;
      const failedCount = result.failed ? result.failed.length : 0;
      if (successCount > 0 && onShowToast) {
        onShowToast(
          isRtl
            ? `✓ تم رفع ${successCount} ملف بنجاح إلى مجلد ${AURASYNC_MOBILE_FOLDER} بالسحابة!`
            : `✓ Backed up ${successCount} file(s) to ${AURASYNC_MOBILE_FOLDER} in cloud!`,
          'success'
        );
      } else if (failedCount > 0 && onShowToast) {
        const detail = result.failed[0]?.error || (isRtl ? 'تعذر النسخ' : 'Backup failed');
        onShowToast(isRtl ? `تعذر النسخ: ${detail}` : `Backup failed: ${detail}`, 'error');
      }
    } catch (err) {
      setIsBackingUp(false);
      if (onShowToast) onShowToast(isRtl ? `فشل النسخ: ${err.message}` : `Backup failed: ${err.message}`, 'error');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleStartBackup = () => {
    if (isBackingUp) return;
    const accounts = mobileEngine.accounts || [];
    if (accounts.length === 0) {
      triggerHaptic(25);
      if (onShowToast) {
        onShowToast(
          isRtl
            ? '⚠️ يرجى ربط حساب سحابي أولاً من الشاشة الرئيسية لبدء النسخ الاحتياطي التلقائي!'
            : '⚠️ Please connect a cloud account first from the Home tab!',
          'warn'
        );
      }
      return;
    }

    if (backupInputRef.current) {
      backupInputRef.current.click();
    }
  };

  return (
    <div>
      <input
        ref={backupInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        style={{ display: 'none' }}
        onChange={handleBackupFilesSelected}
      />
      {/* ── Hero Backup Card ──────────────────────────────────── */}
      <div style={{
        borderRadius:24, padding:'20px', marginBottom:12,
        background:'linear-gradient(135deg, rgba(29,78,216,0.22) 0%, rgba(13,18,36,0.95) 100%)',
        border:'1px solid rgba(59,130,246,0.28)',
        boxShadow:'0 8px 32px rgba(29,78,216,0.12)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(59,130,246,0.1)', filter:'blur(20px)', pointerEvents:'none' }}/>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{
            width:46, height:46, borderRadius:16,
            background:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.35)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3b82f6" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:-0.3 }}>
              {isRtl ? 'النسخ الاحتياطي التلقائي للوسائط' : 'Auto Media Backup'}
            </div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
              {isBackingUp
                ? currentFile
                : (isRtl ? 'يشمل الصور والفيديوهات والصوتيات من الكاميرا' : 'Photos, videos & voice notes from camera roll')}
            </div>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStartBackup}
          disabled={isBackingUp}
          style={{
            width:'100%', padding:'13px', borderRadius:16,
            background: isBackingUp
              ? 'rgba(59,130,246,0.15)'
              : isComplete
              ? 'linear-gradient(135deg,#059669,#047857)'
              : 'linear-gradient(135deg,#1d4ed8,#4338ca)',
            border: isBackingUp ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            color:'#fff', fontSize:13, fontWeight:800,
            cursor: isBackingUp ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow: !isBackingUp ? '0 4px 20px rgba(37,99,235,0.45)' : 'none',
            transition:'all 0.2s', marginBottom: isBackingUp ? 12 : 0,
          }}
        >
          {isBackingUp ? (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ animation:'spin 1s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span>{isRtl ? `جاري النسخ — ${backupProgress}%` : `Backing up — ${backupProgress}%`}</span>
            </>
          ) : isComplete ? (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{isRtl ? 'اكتمل النسخ الاحتياطي بنجاح' : 'Backup Complete!'}</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span>{isRtl ? 'بدء النسخ الاحتياطي الكامل الآن' : 'Start Full Backup Now'}</span>
            </>
          )}
        </button>

        {/* Progress during backup */}
        {isBackingUp && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, color:'#64748b', fontFamily:'monospace' }}>{currentFile}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#3b82f6' }}>{backupProgress}%</span>
            </div>
            <div style={{ width:'100%', height:5, borderRadius:99, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:99, transition:'width 0.35s ease',
                width:`${backupProgress}%`,
                background:'linear-gradient(90deg,#2563eb,#7c3aed,#06b6d4)',
                boxShadow:'0 0 12px rgba(59,130,246,0.5)',
              }}/>
            </div>
          </div>
        )}
      </div>

      {/* ── Cloud Target Selector ─────────────────────────────── */}
      <SectionLabel
        icon={<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>}
        label={isRtl ? 'السحابة المستهدفة' : 'Target Cloud'}
      />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        {[
          { id:'google', label:'Google Drive', color:'#3b82f6', storage:'15 GB' },
          { id:'onedrive', label:'OneDrive', color:'#0ea5e9', storage:'5 GB' },
        ].map(({ id, label, color, storage }) => {
          const isSelected = settings.selectedCloud === id;
          return (
            <button
              key={id}
              onClick={() => handleSelectCloud(id)}
              style={{
                borderRadius:16, padding:'14px', cursor:'pointer',
                background: isSelected ? `${color}18` : 'rgba(13,18,36,0.9)',
                border: isSelected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.07)',
                boxShadow: isSelected ? `0 0 20px ${color}22` : 'none',
                transition:'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                display:'flex', flexDirection:'column', alignItems:'flex-start', gap:6,
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%' }}>
                <div style={{
                  width:30, height:30, borderRadius:10,
                  background:`${color}20`, border:`1px solid ${color}40`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {id === 'google'
                    ? <svg viewBox="0 0 24 24" width="16" height="16" fill={color}><path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5L7.71 3.5zM9.73 15 6.3 21h13.12l3.43-6H9.73zm7.98-1.5 3.43-6H7.71l3.43 6h6.57z"/></svg>
                    : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>}
                </div>
                {isSelected && (
                  <div style={{ marginLeft:'auto', width:18, height:18, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                )}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color: isSelected ? '#fff' : '#94a3b8' }}>{label}</div>
              <div style={{ fontSize:10, color: isSelected ? color : '#475569' }}>{storage} {isRtl ? 'مجاناً' : 'free'}</div>
            </button>
          );
        })}
      </div>

      {/* ── Media Type Toggles ────────────────────────────────── */}
      <Card>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#64748b', marginBottom:4 }}>
          {isRtl ? 'أنواع الوسائط' : 'Media Types'}
        </div>
        <ToggleRow
          icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
          iconColor="#3b82f6"
          title={isRtl ? 'الصور (DCIM)' : 'Photos (DCIM)'}
          subtitle={isRtl ? 'جودة أصلية بدون ضغط' : 'Original resolution, lossless'}
          value={settings.backupPhotos}
          onChange={() => handleToggle('backupPhotos')}
        />
        <ToggleRow
          icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#a855f7" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>}
          iconColor="#a855f7"
          title={isRtl ? 'مقاطع الفيديو (MP4/MOV)' : 'Videos (MP4 / MOV)'}
          subtitle={isRtl ? 'تسجيلات HD وفيديوهات الذكريات' : 'HD recordings & memories'}
          value={settings.backupVideos}
          onChange={() => handleToggle('backupVideos')}
        />
        <ToggleRow
          icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#34d399" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
          iconColor="#34d399"
          title={isRtl ? 'الصوتيات والمذكرات' : 'Voice Notes & Audio'}
          subtitle={isRtl ? 'تسجيلات المكالمات والمذكرات' : 'Recordings & voice memos'}
          value={settings.backupAudio}
          onChange={() => handleToggle('backupAudio')}
          last
        />
      </Card>

      {/* ── Data Guard Conditions ─────────────────────────────── */}
      <Card>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#64748b', marginBottom:4 }}>
          {isRtl ? 'شروط توفير البيانات والبطارية' : 'Data & Battery Guard'}
        </div>
        <ToggleRow
          icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0ea5e9" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>}
          iconColor="#0ea5e9"
          title={isRtl ? 'Wi-Fi فقط (توفير الباقة)' : 'Wi-Fi Only (Save Data)'}
          subtitle={isRtl ? 'لا يُرفع عبر البيانات المحمول' : 'No uploads on mobile data'}
          value={settings.wifiOnly}
          onChange={() => handleToggle('wifiOnly')}
        />
        <ToggleRow
          icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><line x1="23" y1="13" x2="23" y2="11"/><polyline points="11 6 7 12 13 12 9 18"/></svg>}
          iconColor="#f59e0b"
          title={isRtl ? 'أثناء الشحن فقط' : 'While Charging Only'}
          subtitle={isRtl ? 'يضمن شحن البطارية أثناء الرفع' : 'Ensures battery health during uploads'}
          value={settings.chargingOnly}
          onChange={() => handleToggle('chargingOnly')}
          last
        />
      </Card>

      <style>{`
        @keyframes spin {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
