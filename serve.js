// AuraSync — خادم محلي بسيط لصفحة الموقع
// Usage: node website/serve.js  →  يفتح المتصفح تلقائياً على http://localhost:5599/website/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5599;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.exe': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8'
};

http
  .createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

      if (urlPath === '/' || urlPath === '') {
        res.writeHead(302, { Location: '/website/' });
        res.end();
        return;
      }

      let filePath = path.normalize(path.join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (_) {
      res.writeHead(500);
      res.end('Error');
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    const link = `http://localhost:${PORT}/website/`;
    console.log('AuraSync website is running at: ' + link);
    console.log('اضغط Ctrl+C للإغلاق');
    try {
      exec(`start "" "${link}"`);
    } catch (_) {}
  });
