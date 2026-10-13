const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, '..', 'test-electron-render.log');
try { fs.unlinkSync(logFile); } catch (_) {}

function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

log('Electron test script starting');

app.whenReady().then(async () => {
  log('app.whenReady fired');

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.webContents.on('console-message', (e, level, msg, line, src) => {
    log(`CONSOLE [${level}]: ${msg} (${src}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`FAIL LOAD: ${code} ${desc} (${url})`);
  });

  win.webContents.on('did-finish-load', () => {
    log(`FINISH LOAD SUCCESS! Title: ${win.getTitle()}`);
  });

  const prodHtml = path.join(__dirname, '..', 'dist', 'index.html');
  log(`Loading file: ${prodHtml}, exists: ${fs.existsSync(prodHtml)}`);

  try {
    await win.loadFile(prodHtml);
    log(`loadFile returned successfully. Title: ${win.getTitle()}`);
  } catch (err) {
    log(`loadFile threw error: ${err.stack}`);
  }

  setTimeout(() => {
    log('Done waiting 3s, quitting');
    app.quit();
  }, 3000);
});
