// Temporary visual check: captures screenshots of key pages for design review.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.whenReady().then(async () => {
  const outDir = path.join(os.tmpdir(), 'aurasync-shots');
  fs.mkdirSync(outDir, { recursive: true });

  const win = new BrowserWindow({
    show: true,
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setBackgroundThrottling(false);
  win.setAlwaysOnTop(true);
  await new Promise((r) => setTimeout(r, 1500));

  const goTo = async (label) => {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('aside button, nav button'));
        const b = btns.find((x) => x.textContent.includes(${JSON.stringify(label)}));
        if (b) b.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
  };

  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 900));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    const text = await win.webContents.executeJavaScript(
      `(document.querySelector('main') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 160)`
    );
    console.log(`SHOT ${name} :: ${text}`);
  };

  await shot('dashboard');
  await goTo('الإعدادات');
  await shot('settings');
  await goTo('الحماية');
  await shot('protection');
  await goTo('ملفاتي');
  await shot('files');

  console.log('SHOTS_DIR: ' + outDir);
  app.quit();
});
