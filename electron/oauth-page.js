// Shared, modern OAuth callback pages (success / error) served by the local
// loopback server during cloud sign-in. Returns self-contained HTML.

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function strings(language) {
  const ar = language === 'ar';
  return {
    ar,
    dir: ar ? 'rtl' : 'ltr',
    lang: ar ? 'ar' : 'en',
    successTitle: ar ? 'تم الربط بنجاح' : 'Connected successfully',
    successSubtitle: ar
      ? 'تم ربط حساب {provider} بـ AuraSync بنجاح.'
      : 'Your {provider} account is now connected to AuraSync.',
    hint: ar ? 'يمكنك إغلاق هذا التبويب والعودة إلى التطبيق.' : 'You can close this tab and return to the app.',
    errorTitle: ar ? 'تعذّر إتمام الربط' : 'Could not complete the connection',
    errorHint: ar ? 'ارجع إلى AuraSync وحاول مرة أخرى.' : 'Return to AuraSync and try again.',
    pageTitle: ar ? 'AuraSync — تم الربط' : 'AuraSync — Connected'
  };
}

function pageStyles() {
  return `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      display: grid;
      place-items: center;
      background: #08090d;
      color: #e8ecf4;
      font-family: "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }

    /* ── Soft ambient glow ── */
    .bg {
      position: fixed; inset: 0; z-index: 0;
      background:
        radial-gradient(ellipse 50% 45% at 50% 40%, rgba(59,130,246,0.08), transparent 70%),
        radial-gradient(ellipse 40% 35% at 30% 70%, rgba(34,211,238,0.04), transparent 60%),
        #08090d;
    }

    /* ── Center content ── */
    .wrap {
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center;
      animation: show 0.7s cubic-bezier(0.16,1,0.3,1) both;
    }
    @keyframes show {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to   { opacity: 1; transform: none; }
    }

    /* ── Cloud icon ── */
    .cloud-wrap {
      position: relative;
      width: 88px; height: 88px;
      margin-bottom: 24px;
    }
    .cloud-wrap svg.cloud {
      width: 100%; height: 100%;
      filter: drop-shadow(0 6px 24px rgba(91,140,255,0.3));
      animation: float 5s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    /* ── Check badge ── */
    .badge {
      position: absolute;
      inset-inline-end: -2px; bottom: -2px;
      width: 30px; height: 30px; border-radius: 50%;
      display: grid; place-items: center;
      background: linear-gradient(135deg, #10b981, #34d399);
      box-shadow: 0 0 0 4px #08090d, 0 4px 16px rgba(16,185,129,0.4);
      animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.4s both;
    }
    .badge.fail {
      background: linear-gradient(135deg, #f43f5e, #fb7185);
      box-shadow: 0 0 0 4px #08090d, 0 4px 16px rgba(244,63,94,0.4);
    }
    @keyframes pop {
      from { opacity: 0; transform: scale(0); }
      to   { opacity: 1; transform: scale(1); }
    }
    .badge svg { width: 15px; height: 15px; }
    .badge path {
      stroke-dasharray: 24; stroke-dashoffset: 24;
      animation: draw 0.4s ease-out 0.65s forwards;
    }
    .badge.fail path { animation: none; stroke-dashoffset: 0; }
    @keyframes draw { to { stroke-dashoffset: 0; } }

    /* ── Text ── */
    h1 {
      font-size: 22px; font-weight: 800;
      letter-spacing: -0.3px;
      margin-bottom: 8px;
      animation: fadeIn 0.5s ease 0.2s both;
    }
    .sub {
      font-size: 13.5px; line-height: 1.8;
      color: rgba(160,170,190,0.75);
      text-align: center; max-width: 300px;
      animation: fadeIn 0.5s ease 0.3s both;
    }
    .hint {
      font-size: 12px; line-height: 1.7;
      color: rgba(110,120,140,0.55);
      text-align: center; max-width: 300px;
      margin-top: 4px;
      animation: fadeIn 0.5s ease 0.4s both;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; }
    }
  `;
}

function cloudSvg() {
  return `
    <svg class="cloud" viewBox="0 0 100 100" role="img" aria-label="AuraSync">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5b8cff"/>
          <stop offset="0.5" stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#818cf8"/>
        </linearGradient>
      </defs>
      <g fill="url(#cg)">
        <circle cx="50" cy="40" r="24"/>
        <circle cx="27" cy="54" r="16"/>
        <circle cx="72" cy="53" r="17.5"/>
        <rect x="17" y="54" width="66" height="17" rx="8.5"/>
      </g>
    </svg>`;
}

const TICK = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7L7 17" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;

function successHtml({ provider = 'Cloud', language = 'ar' } = {}) {
  const s = strings(language);
  const name = escapeHtml(provider);
  const sub = s.successSubtitle.replace('{provider}', name);

  return `<!DOCTYPE html>
<html lang="${s.lang}" dir="${s.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(s.pageTitle)}</title>
<style>${pageStyles()}</style>
</head>
<body>
  <div class="bg"></div>
  <div class="wrap">
    <div class="cloud-wrap">
      ${cloudSvg()}
      <div class="badge">${TICK}</div>
    </div>
    <h1>${escapeHtml(s.successTitle)}</h1>
    <p class="sub">${sub}</p>
    <p class="hint">${escapeHtml(s.hint)}</p>
  </div>
</body>
</html>`;
}

function errorHtml({ message = '', language = 'ar' } = {}) {
  const s = strings(language);
  const detail = message ? escapeHtml(String(message).slice(0, 300)) : '';

  return `<!DOCTYPE html>
<html lang="${s.lang}" dir="${s.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(s.errorTitle)} — AuraSync</title>
<style>${pageStyles()}</style>
</head>
<body>
  <div class="bg"></div>
  <div class="wrap">
    <div class="cloud-wrap">
      ${cloudSvg()}
      <div class="badge fail">${CROSS}</div>
    </div>
    <h1>${escapeHtml(s.errorTitle)}</h1>
    <p class="sub">${escapeHtml(s.errorHint)}</p>
    ${detail ? `<p class="hint" style="direction:ltr; unicode-bidi:plaintext;">${detail}</p>` : ''}
  </div>
</body>
</html>`;
}

module.exports = { successHtml, errorHtml, appLanguage };

function appLanguage() {
  try {
    const db = require('./database');
    return db.getSetting('language', 'ar') || 'ar';
  } catch (_) {
    return 'ar';
  }
}
