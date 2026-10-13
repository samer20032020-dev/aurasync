// AuraSync Browser Extension Local HTTP Bridge Server
const http = require('http');

const PORT = 49721;

class BrowserExtensionServer {
  constructor() {
    this.server = null;
    this.port = PORT;
    this.liveTabs = [];
    this.lastTabsUpdate = 0;
    this.lockedDomains = [];
    this.onTabsChangeCallback = null;
    this.verifyPinCallback = null;
    this.onLockoutCallback = null;
    this.getRulesCallback = null;
  }

  setCallbacks({ verifyPin, onLockout, getRules, onTabsChange }) {
    this.verifyPinCallback = verifyPin;
    this.onLockoutCallback = onLockout;
    this.getRulesCallback = getRules;
    this.onTabsChangeCallback = onTabsChange;
  }

  setLockedDomains(domains) {
    this.lockedDomains = Array.isArray(domains) ? [...new Set(domains)] : [];
  }

  getLiveTabs() {
    // If no ping in last 30s, liveTabs may be stale
    const isAlive = Date.now() - this.lastTabsUpdate < 30000;
    return isAlive ? this.liveTabs : [];
  }

  isExtensionConnected() {
    return Date.now() - this.lastTabsUpdate < 30000;
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || '';

      if (req.method === 'GET' && url === '/api/rules') {
        let rules = {
          enabled: true,
          lockedDomains: this.lockedDomains,
          hasPin: false,
          pinLength: 4
        };
        if (this.getRulesCallback) {
          try {
            const cbRules = this.getRulesCallback();
            rules = { ...rules, ...cbRules, lockedDomains: this.lockedDomains };
          } catch (_) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rules));
        return;
      }

      if (req.method === 'POST' && url === '/api/tabs') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed.tabs)) {
              this.liveTabs = parsed.tabs;
              this.lastTabsUpdate = Date.now();
              if (this.onTabsChangeCallback) {
                this.onTabsChangeCallback(this.liveTabs);
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, count: this.liveTabs.length }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid json' }));
          }
        });
        return;
      }

      if (req.method === 'POST' && url === '/api/verify-pin') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { pin } = JSON.parse(body);
            let result = { success: false };
            if (this.verifyPinCallback) {
              result = this.verifyPinCallback(pin);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid request' }));
          }
        });
        return;
      }

      if (req.method === 'POST' && url === '/api/lockout') {
        if (this.onLockoutCallback) {
          this.onLockoutCallback();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ locked: true }));
        return;
      }

      if (req.method === 'GET' && url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          running: true,
          connected: this.isExtensionConnected(),
          tabsCount: this.liveTabs.length
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });

    this.server.on('error', (err) => {
      console.warn('[BrowserExtensionServer] Error:', err.message);
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      if (this.server && typeof this.server.unref === 'function') {
        this.server.unref();
      }
    });
  }

  stop() {
    if (this.server) {
      try {
        this.server.close();
      } catch (_) {}
      this.server = null;
    }
  }
}

module.exports = new BrowserExtensionServer();
