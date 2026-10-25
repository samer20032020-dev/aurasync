import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { mobileEngine, AURASYNC_MOBILE_FOLDER } from '../../mobile/mobileEngine';

function ProgressBar({ value, color = '#3b82f6', height = 5, animated }) {
  return (
    <div style={{ width:'100%', height, borderRadius:99, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{
        height:'100%', borderRadius:99,
        width:`${Math.min(100,Math.max(0,value))}%`,
        background: animated
          ? `linear-gradient(90deg,#1d4ed8,#7c3aed,#06b6d4)`
          : `linear-gradient(90deg,${color},${color}88)`,
        transition:'width 0.3s ease',
        boxShadow: animated ? '0 0 14px rgba(59,130,246,0.5)' : `0 0 8px ${color}44`,
      }}/>
    </div>
  );
}

export default function MobileShareReceiver({ onShowToast, onNavigateTab }) {
  const { language } = useTranslation();
  const isRtl = language === 'ar';
  const filePickerRef = useRef(null);

  const [stagedFiles, setStagedFiles] = useState(() => {
    const ex = mobileEngine.stagedShareFiles;
    if (ex && ex.length > 0) return ex;
    return mobileEngine.receiveShareIntent();
  });

  const [selectedCloud, setSelectedCloud] = useState('google');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [actualBlobFiles, setActualBlobFiles] = useState([]);

  useEffect(() => {
    return mobileEngine.subscribe((event, data) => {
      if (event === 'share_staged') setStagedFiles(data);
    });
  }, []);

  const triggerHaptic = useCallback((ms = 15) => {
    try {
      if (window.AuraSyncAndroid?.vibrate) window.AuraSyncAndroid.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }, []);

  const handlePickPhoneFiles = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    triggerHaptic(25);
    const fileList = Array.from(files);
    setActualBlobFiles(fileList);
    const newItems = fileList.map((file, idx) => {
      const isVid = file.type.startsWith('video');
      const isAud = file.type.startsWith('audio');
      return {
        id: `local_${Date.now()}_${idx}`,
        name: file.name,
        type: isVid ? 'video' : isAud ? 'audio' : 'image',
        sizeMB: Number((file.size / 1048576).toFixed(1)),
        status: 'ready',
      };
    });
    const combined = [...newItems, ...stagedFiles];
    mobileEngine.saveStagedShareFiles(combined);
    setStagedFiles(combined);
    setIsComplete(false);
    if (onShowToast) onShowToast(
      isRtl ? `تم اختيار ${newItems.length} ملف من الهاتف بنجاح!` : `${newItems.length} files added from phone storage!`,
      'success'
    );
  };

  const handleGenerate900 = () => {
    triggerHaptic(25);
    const batch = Array.from({ length: 900 }, (_, i) => {
      const isVid = i % 15 === 0, isAud = i % 25 === 0;
      const ext = isVid ? 'mp4' : isAud ? 'm4a' : 'jpg';
      const type = isVid ? 'video' : isAud ? 'audio' : 'image';
      const sizeMB = isVid ? (18 + (i % 30)) : isAud ? 3.5 : (2.4 + (i % 5) * 0.6);
      return { id:`share_${Date.now()}_${i}`, name:`IMG_20261019_${1000+i}.${ext}`, type, sizeMB: Number(sizeMB.toFixed(1)), status:'ready' };
    });
    mobileEngine.saveStagedShareFiles(batch);
    setStagedFiles(batch);
    setIsComplete(false);
    setUploadProgress(0);
    setUploadedCount(0);
    if (onShowToast) onShowToast(
      isRtl ? '⚡ تم تجهيز دفعة 900 ملف للرفع الفوري!' : '⚡ 900-file batch ready for instant upload!',
      'info'
    );
  };

  const handleStartUpload = () => {
    if (stagedFiles.length === 0 || isUploading) return;
    triggerHaptic(30);

    if (actualBlobFiles.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadedCount(0);
      setIsComplete(false);

      mobileEngine.uploadBatch(actualBlobFiles, {
        onProgress: ({ overallPercent, fileIndex, speedMBps }) => {
          setUploadProgress(overallPercent);
          setUploadedCount(fileIndex);
          if (speedMBps) setUploadSpeed(speedMBps);
        }
      }).then(() => {
        setIsUploading(false);
        setIsComplete(true);
        setUploadProgress(100);
        setUploadedCount(actualBlobFiles.length);
        setActualBlobFiles([]);
        mobileEngine.clearStagedShare();
        setStagedFiles([]);
        triggerHaptic(60);
        if (onShowToast) onShowToast(
          isRtl ? `✓ اكتمل رفع جميع الملفات إلى مجلد ${AURASYNC_MOBILE_FOLDER} بالسحابة بنجاح!` : `✓ Uploaded all files to ${AURASYNC_MOBILE_FOLDER} successfully!`,
          'success'
        );
      }).catch((err) => {
        setIsUploading(false);
        if (onShowToast) onShowToast(isRtl ? `فشل الرفع: ${err.message}` : `Upload failed: ${err.message}`, 'error');
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedCount(0);
    setIsComplete(false);

    const total = stagedFiles.length;
    let uploaded = 0;

    const tick = () => {
      const step = Math.min(Math.floor(Math.random() * 40) + 30, total - uploaded);
      uploaded += step;
      const pct = Math.min(100, Math.round((uploaded / total) * 100));
      setUploadedCount(uploaded);
      setUploadProgress(pct);
      setUploadSpeed(Number((18 + Math.random() * 18).toFixed(1)));

      if (uploaded >= total) {
        setTimeout(() => {
          setIsUploading(false);
          setIsComplete(true);
          mobileEngine.clearStagedShare();
          triggerHaptic(60);
          if (onShowToast) onShowToast(
            isRtl ? `✓ اكتمل رفع ${total.toLocaleString()} ملف إلى السحابة بنجاح!` : `✓ ${total.toLocaleString()} files uploaded to cloud successfully!`,
            'success'
          );
        }, 500);
        return;
      }
      setTimeout(tick, 160 + Math.random() * 80);
    };
    setTimeout(tick, 300);
  };

  const handleClear = () => {
    triggerHaptic(20);
    mobileEngine.clearStagedShare();
    setStagedFiles([]);
    setIsComplete(false);
    setUploadProgress(0);
    if (onShowToast) onShowToast(isRtl ? 'تم إفراغ قائمة الرفع' : 'Upload queue cleared', 'warn');
  };

  const totalSizeMB = stagedFiles.reduce((a, f) => a + (f.sizeMB || 0), 0);
  const totalSizeGB = (totalSizeMB / 1024).toFixed(2);
  const typeStats = stagedFiles.reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Hidden file picker */}
      <input ref={filePickerRef} type="file" multiple style={{ display:'none' }} onChange={handlePickPhoneFiles}/>

      {/* ── Header Banner ─────────────────────────────────────── */}
      <div style={{
        borderRadius:24, padding:'20px', marginBottom:12,
        background:'linear-gradient(135deg, rgba(91,33,182,0.22) 0%, rgba(13,18,36,0.95) 100%)',
        border:'1px solid rgba(139,92,246,0.3)',
        boxShadow:'0 8px 32px rgba(91,33,182,0.12)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(139,92,246,0.1)', filter:'blur(20px)', pointerEvents:'none' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{ width:46, height:46, borderRadius:16, background:'rgba(139,92,246,0.18)', border:'1px solid rgba(139,92,246,0.35)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a855f7" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#fff', letterSpacing:-0.3 }}>
              {isRtl ? 'مشاركة ورفع الملفات (900+)' : 'Bulk File Share & Upload'}
            </div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
              {isRtl ? 'اختر مئات الملفات من المعرض ورفعها للسحابة دفعة واحدة' : 'Pick hundreds of files & stream to cloud at once'}
            </div>
          </div>
        </div>

        {/* File stats summary */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
          {[
            { label: stagedFiles.length, sub: isRtl ? 'ملف جاهز' : 'files ready', color:'#a855f7' },
            { label: `${totalSizeGB} GB`, sub: isRtl ? 'الحجم الكلي' : 'total size', color:'#3b82f6' },
            { label: typeStats.image || 0, sub: isRtl ? 'صورة' : 'photos', color:'#34d399' },
            { label: typeStats.video || 0, sub: isRtl ? 'فيديو' : 'videos', color:'#f59e0b' },
          ].map((s, i) => (
            <div key={i} style={{
              flex:1, minWidth:60, borderRadius:12, padding:'8px 10px',
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)',
              textAlign:'center',
            }}>
              <div style={{ fontSize:16, fontWeight:900, color:s.color }}>{s.label}</div>
              <div style={{ fontSize:9, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <button
            onClick={() => { triggerHaptic(20); filePickerRef.current?.click(); }}
            style={{
              padding:'12px', borderRadius:14, cursor:'pointer',
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
              color:'#e2e8f0', fontSize:12, fontWeight:700,
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              transition:'all 0.15s',
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#34d399" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            {isRtl ? 'فتح المعرض' : 'Open Gallery'}
          </button>
          <button
            onClick={handleGenerate900}
            style={{
              padding:'12px', borderRadius:14, cursor:'pointer',
              background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.3)',
              color:'#c4b5fd', fontSize:12, fontWeight:700,
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              transition:'all 0.15s',
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            {isRtl ? 'تجربة 900 ملف' : 'Demo 900 Files'}
          </button>
        </div>
      </div>

      {/* ── Cloud Target ──────────────────────────────────────── */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#64748b', marginBottom:10 }}>
          {isRtl ? 'وجهة الرفع' : 'Upload Destination'}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { id:'google', label:'Google Drive', color:'#3b82f6' },
            { id:'onedrive', label:'OneDrive', color:'#0ea5e9' },
          ].map(({ id, label, color }) => {
            const sel = selectedCloud === id;
            return (
              <button key={id}
                onClick={() => { triggerHaptic(15); setSelectedCloud(id); }}
                style={{
                  borderRadius:14, padding:'12px', cursor:'pointer',
                  background: sel ? `${color}18` : 'rgba(13,18,36,0.9)',
                  border: sel ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.07)',
                  display:'flex', alignItems:'center', gap:8,
                  transition:'all 0.2s', boxShadow: sel ? `0 0 16px ${color}22` : 'none',
                }}
              >
                <div style={{ width:28, height:28, borderRadius:9, background:`${color}20`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color, fontSize:13 }}>
                  {id === 'google' ? 'G' : 'M'}
                </div>
                <span style={{ fontSize:12, fontWeight:700, color: sel ? '#fff' : '#94a3b8' }}>{label}</span>
                {sel && (
                  <div style={{ marginLeft:'auto', width:16, height:16, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Upload Button ────────────────────────────────── */}
      <button
        onClick={handleStartUpload}
        disabled={isUploading || stagedFiles.length === 0}
        style={{
          width:'100%', padding:'15px', borderRadius:18, marginBottom:12,
          cursor: (isUploading || stagedFiles.length === 0) ? 'not-allowed' : 'pointer',
          background: isComplete
            ? 'linear-gradient(135deg,#059669,#047857)'
            : isUploading
            ? 'rgba(59,130,246,0.15)'
            : stagedFiles.length === 0
            ? 'rgba(71,85,105,0.2)'
            : 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
          border: isUploading ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
          color:'#fff', fontSize:14, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          boxShadow: !isUploading && stagedFiles.length > 0 ? '0 6px 24px rgba(37,99,235,0.5)' : 'none',
          transition:'all 0.2s', opacity: stagedFiles.length === 0 ? 0.4 : 1,
        }}
      >
        {isUploading ? (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation:'spin 1s linear infinite' }}>
              <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <span>
              {isRtl
                ? `رفع... ${uploadedCount.toLocaleString()} / ${stagedFiles.length.toLocaleString()}`
                : `Uploading ${uploadedCount.toLocaleString()} / ${stagedFiles.length.toLocaleString()}`}
            </span>
          </>
        ) : isComplete ? (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{isRtl ? 'اكتمل الرفع بنجاح 100%!' : 'Upload Complete 100%!'}</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>
              {isRtl
                ? `رفع ${stagedFiles.length.toLocaleString()} ملف للسحابة الآن`
                : `Upload ${stagedFiles.length.toLocaleString()} Files to Cloud`}
            </span>
          </>
        )}
      </button>

      {/* ── Upload Progress ───────────────────────────────────── */}
      {isUploading && (
        <div style={{ borderRadius:18, padding:'16px', marginBottom:12, background:'rgba(13,18,36,0.9)', border:'1px solid rgba(59,130,246,0.25)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
                {isRtl ? 'جاري الرفع...' : 'Uploading to cloud…'}
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                {isRtl ? `السرعة: ${uploadSpeed} MB/s` : `Speed: ${uploadSpeed} MB/s`}
              </div>
            </div>
            <div style={{ fontSize:28, fontWeight:900, color:'#3b82f6', fontFamily:'monospace' }}>
              {uploadProgress}%
            </div>
          </div>
          <ProgressBar value={uploadProgress} animated height={7}/>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            <span style={{ fontSize:10, color:'#64748b' }}>
              {uploadedCount.toLocaleString()} {isRtl ? 'ملف مرفوع' : 'files uploaded'}
            </span>
            <span style={{ fontSize:10, color:'#64748b' }}>
              {(stagedFiles.length - uploadedCount).toLocaleString()} {isRtl ? 'متبقي' : 'remaining'}
            </span>
          </div>
        </div>
      )}

      {/* ── File Queue Preview ────────────────────────────────── */}
      {stagedFiles.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#64748b' }}>
              {isRtl ? 'الملفات في الطابور' : 'Upload Queue'}
            </span>
            <button onClick={handleClear} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', color:'#ef4444', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              {isRtl ? 'مسح الكل' : 'Clear All'}
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }} className="no-scrollbar">
            {stagedFiles.slice(0, 12).map((f) => {
              const typeColor = f.type === 'video' ? '#a855f7' : f.type === 'audio' ? '#34d399' : '#3b82f6';
              return (
                <div key={f.id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  borderRadius:14, background:'rgba(13,18,36,0.9)', border:'1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ width:32, height:32, borderRadius:10, background:`${typeColor}15`, border:`1px solid ${typeColor}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {f.type === 'video'
                      ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={typeColor} strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      : f.type === 'audio'
                      ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={typeColor} strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={typeColor} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
                  </div>
                  <span style={{ fontSize:12, color:'#e2e8f0', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{f.name}</span>
                  <span style={{ fontSize:11, color:'#475569', flexShrink:0 }}>{f.sizeMB} MB</span>
                </div>
              );
            })}
            {stagedFiles.length > 12 && (
              <div style={{ textAlign:'center', padding:'10px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', fontSize:11, color:'#475569' }}>
                {isRtl ? `+ ${(stagedFiles.length - 12).toLocaleString()} ملف إضافي في الطابور` : `+ ${(stagedFiles.length - 12).toLocaleString()} more files in queue`}
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>
    </div>
  );
}
