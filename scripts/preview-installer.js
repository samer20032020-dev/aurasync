// Quick visual preview of the cloud setup window (loads dist/index.html#installer).
// Usage: npx electron scripts/preview-installer.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'installer' });
  await new Promise((r) => setTimeout(r, 1800));

  try {
    const info = await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find(x => x.textContent.trim() === '\u062A\u063A\u064A\u064A\u0631');
        if (!b) return { found: false, texts: btns.map(x => x.textContent.trim()) };
        const cs = getComputedStyle(b);
        return {
          found: true,
          bg: cs.backgroundColor,
          border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
          outline: cs.outlineWidth + ' ' + cs.outlineStyle,
          boxShadow: cs.boxShadow,
          appearance: cs.appearance,
          className: b.className
        };
      })()
    `);
    console.log('CHANGE-BUTTON:', JSON.stringify(info));
  } catch (e) {
    console.log('inspect error:', e.message);
  }

  const image = await win.webContents.capturePage();
  const out = path.join(os.tmpdir(), 'aurasync-installer-preview.png');
  fs.writeFileSync(out, image.toPNG());
  console.log('PREVIEW:', out);
  app.quit();
});
