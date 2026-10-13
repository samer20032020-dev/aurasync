// UI smoke test: renders the built app and visits every page, collecting
// real renderer errors (catches undefined-variable crashes like the blank
// Settings page incident). Run: npx electron scripts/ui-smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.on('console-message', (event, level, message) => {
    let msg = message;
    let lvl = level;
    if (event && typeof event === 'object' && event.message !== undefined && message === undefined) {
      msg = event.message;
      lvl = event.level;
    }
    const text = String(msg || '');
    const ignored =
      text.includes('No handler registered') ||
      text.includes('Error invoking remote method') ||
      text.includes('Error refreshing app data') ||
      text.includes('renderer-debug');
    if (!ignored && (lvl >= 2 || /is not defined|is not a function|Cannot read/.test(text))) {
      errors.push(`[L${lvl}] ${text}`);
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 1600));

  const pages = [
    { id: 'settings', label: 'الإعدادات' },
    { id: 'accounts', label: 'الحسابات' },
    { id: 'activity', label: 'النشاط' },
    { id: 'protection', label: 'الحماية' },
    { id: 'cloudweb', label: 'السحابة' },
    { id: 'files', label: 'ملفاتي' },
    { id: 'dashboard', label: 'الرئيسية' }
  ];

  for (const p of pages) {
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('aside button, nav button'));
        const b = btns.find((x) => x.textContent.includes(${JSON.stringify(p.label)}));
        if (b) { b.click(); return true; }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 650));
    console.log(`PAGE ${p.id}: ${clicked ? 'clicked' : 'NOT FOUND'}`);
  }

  // In-page tabs (merged hubs + settings tabs)
  const clickTab = async (label) => {
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('main button'));
        const b = btns.find((x) => x.textContent.trim() === ${JSON.stringify(label)});
        if (b) { b.click(); return true; }
        return false;
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));
    console.log(`TAB ${label}: ${clicked ? 'clicked' : 'NOT FOUND'}`);
  };

  const goTo = async (label) => {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('aside button, nav button'));
        const b = btns.find((x) => x.textContent.includes(${JSON.stringify(label)}));
        if (b) b.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));
  };

  await goTo('الحماية');
  await clickTab('الإحصائيات');
  await clickTab('نقاط الاستعادة');
  await clickTab('المحفوظات');

  await goTo('النشاط');
  await clickTab('النقل');
  await clickTab('السجل');

  await goTo('الإعدادات');
  await clickTab('المزامنة');
  await clickTab('السحابات');
  await clickTab('متقدم');
  await clickTab('عام');

  console.log('---');
  if (errors.length === 0) {
    console.log('UI_SMOKE_OK: no renderer errors');
  } else {
    console.log('UI_SMOKE_ERRORS:');
    for (const e of errors.slice(0, 15)) console.log('  ' + e);
  }
  app.quit();
});
