// Visual + error check for the marketing website (loads it like a browser).
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.whenReady().then(async () => {
  const outDir = path.join(os.tmpdir(), 'aurasync-web-shots');
  fs.mkdirSync(outDir, { recursive: true });

  const errors = [];
  const win = new BrowserWindow({
    show: true,
    width: 1440,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.setBackgroundThrottling(false);
  win.setAlwaysOnTop(true);

  win.webContents.on('console-message', (event, level, message) => {
    const text = String(message || '');
    if (level >= 2 && !text.includes('net::ERR')) errors.push(`[L${level}] ${text}`);
  });

  const file = 'file:///' + path.join(__dirname, '..', 'website', 'index.html').replace(/\\/g, '/');
  await win.loadURL(file);
  await new Promise((r) => setTimeout(r, 3200));

  const shot = async (name, scrollY) => {
    if (scrollY != null) {
      await win.webContents.executeJavaScript(`window.scrollTo(0, ${scrollY}); true`);
      await new Promise((r) => setTimeout(r, 1400));
    }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    console.log(`SHOT ${name}`);
  };

  await shot('web-hero', 0);
  await shot('web-features', 1200);
  await shot('web-how', 2600);
  await shot('web-shots', 4200);
  await shot('web-cta', 5600);

  console.log('ERRORS:', errors.length ? errors.join(' || ') : 'none');
  console.log('SHOTS_DIR: ' + outDir);
  app.quit();
});
