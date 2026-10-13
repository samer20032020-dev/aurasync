const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const db = require('./database');
const extensionServer = require('./browser-extension-server');

const KNOWN_BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', proc: 'chrome', icon: '🌐' },
  { id: 'msedge', name: 'Microsoft Edge', proc: 'msedge', icon: '🌊' },
  { id: 'brave', name: 'Brave Browser', proc: 'brave', icon: '🦁' },
  { id: 'firefox', name: 'Mozilla Firefox', proc: 'firefox', icon: '🦊' },
  { id: 'opera', name: 'Opera', proc: 'opera', icon: '🔴' },
  { id: 'operagx', name: 'Opera GX', proc: 'opera_gx', icon: '🎮' },
  { id: 'vivaldi', name: 'Vivaldi', proc: 'vivaldi', icon: '🧭' },
  { id: 'arc', name: 'Arc Browser', proc: 'arc', icon: '🌈' },
  { id: 'tor', name: 'Tor Browser', proc: 'tor', icon: '🧅' },
  { id: 'whatsapp', name: 'WhatsApp', proc: 'whatsapp', icon: '💬' },
  { id: 'telegram', name: 'Telegram', proc: 'telegram', icon: '✈️' }
];

const WATCHER_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
Add-Type @'
using System;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class NativeGuardWatcher {
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public static volatile bool running = true;
    public static IntPtr lastHwnd = IntPtr.Zero;
    public static string lastTitle = "";

    public static void ScanAllVisible() {
        try {
            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;
                uint pid = 0;
                GetWindowThreadProcessId(hWnd, out pid);
                if (pid == 0) return true;
                try {
                    Process p = Process.GetProcessById((int)pid);
                    string proc = p.ProcessName.ToLower();
                    bool isTarget = proc == "chrome" || proc == "msedge" || proc == "brave" || 
                                   proc == "firefox" || proc == "opera" || proc == "opera_gx" || 
                                   proc == "vivaldi" || proc == "arc" || proc == "tor" ||
                                   proc.Contains("whatsapp") || proc.Contains("telegram") || proc.Contains("discord");
                    if (isTarget) {
                        StringBuilder sb = new StringBuilder(512);
                        GetWindowText(hWnd, sb, 512);
                        string t = sb.ToString().Trim();
                        if (!string.IsNullOrEmpty(t)) {
                            string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(t));
                            Console.WriteLine("SCAN|" + proc + "|" + hWnd.ToInt64() + "|" + pid + "|" + b64);
                        }
                    }
                } catch {}
                return true;
            }, IntPtr.Zero);
        } catch {}
    }

    public static void Worker() {
        // Immediate background scan upon start
        ScanAllVisible();

        int scanCounter = 0;
        while (running) {
            try {
                scanCounter++;
                if (scanCounter >= 60) {
                    scanCounter = 0;
                    ScanAllVisible();
                }

                IntPtr fg = GetForegroundWindow();
                if (fg != IntPtr.Zero) {
                    StringBuilder sb = new StringBuilder(512);
                    GetWindowText(fg, sb, 512);
                    string title = sb.ToString();

                    if (fg != lastHwnd || title != lastTitle) {
                        lastHwnd = fg;
                        lastTitle = title;
                        uint pid = 0;
                        GetWindowThreadProcessId(fg, out pid);
                        if (pid != 0) {
                            try {
                                Process p = Process.GetProcessById((int)pid);
                                string name = p.ProcessName.ToLower();
                                string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(title ?? ""));
                                Console.WriteLine("FG|" + name + "|" + fg.ToInt64() + "|" + pid + "|" + b64);
                            } catch {}
                        }
                    }
                }
            } catch {}
            Thread.Sleep(25);
        }
    }

    public static void Start() {
        Thread t = new Thread(new ThreadStart(Worker));
        t.IsBackground = true;
        t.SetApartmentState(ApartmentState.STA);
        t.Start();

        string line;
        while ((line = Console.ReadLine()) != null) {
            line = line.Trim();
            if (line == "QUIT") {
                running = false;
                break;
            } else if (line == "SCAN") {
                ScanAllVisible();
            } else if (line.StartsWith("MIN|")) {
                try {
                    long hVal = long.Parse(line.Substring(4));
                    ShowWindowAsync(new IntPtr(hVal), 6);
                } catch {}
            } else if (line.StartsWith("FOCUS|")) {
                try {
                    long hVal = long.Parse(line.Substring(6));
                    SetForegroundWindow(new IntPtr(hVal));
                } catch {}
            } else if (line.StartsWith("CLOSETAB|")) {
                try {
                    long hVal = long.Parse(line.Substring(9));
                    IntPtr h = new IntPtr(hVal);
                    SetForegroundWindow(h);
                    Thread.Sleep(30);
                    keybd_event(0x11, 0, 0, UIntPtr.Zero); // CTRL down
                    keybd_event(0x57, 0, 0, UIntPtr.Zero); // W down
                    keybd_event(0x57, 0, 2, UIntPtr.Zero); // W up
                    keybd_event(0x11, 0, 2, UIntPtr.Zero); // CTRL up
                } catch {}
            }
        }
    }
}
'@

[NativeGuardWatcher]::Start()
`;

class BrowserGuardManager {
  constructor() {
    this.watcherProc = null;
    this.lockWindow = null;
    this.activeForeground = '';
    this.unlockedBrowsers = new Map(); // browserProc -> timestamp (ms)
    this.unlockedPagesSession = new Map(); // sessionKey -> timestamp (ms)
    this.currentLockedProc = '';
    this.currentLockedHwnd = null;
    this.currentLockedPageTitle = null;
    this.currentSessionKey = null;
    this.failedAttempts = 0;
    this.maxAttempts = 2;
    this.isStopping = false;
    this.respawnTimer = null;
    this.detectedPages = [];

    this.initExtensionBridge();
  }

  isBrowserUnlocked(browserProc) {
    if (!this.unlockedBrowsers || !this.unlockedBrowsers.has(browserProc)) return false;
    const unlockedAt = this.unlockedBrowsers.get(browserProc);
    // Unlocked sessions stay active while inside the browser.
    // If left unattended for over 60 minutes, session expires as a safety precaution.
    const sessionTimeoutMs = 60 * 60 * 1000;
    if (Date.now() - unlockedAt > sessionTimeoutMs) {
      this.unlockedBrowsers.delete(browserProc);
      return false;
    }
    return true;
  }

  getGuardMode() {
    return db.getSetting('browser_guard_mode') || 'full';
  }

  setGuardMode(mode) {
    const val = mode === 'selective' ? 'selective' : 'full';
    db.setSetting('browser_guard_mode', val);
    if (this.unlockedBrowsers) this.unlockedBrowsers.clear();
    this.unlockedPagesSession.clear();
    this.activeForeground = '';
    return { success: true, mode: val };
  }

  getGracePeriodMinutes() {
    try {
      const val = parseInt(db.getSetting('browser_guard_grace_period_min', '5'), 10);
      if (!isNaN(val) && val >= 0) return val;
    } catch (_) {}
    return 5;
  }

  setGracePeriodMinutes(minutes) {
    const m = Math.max(0, parseInt(minutes, 10) || 0);
    db.setSetting('browser_guard_grace_period_min', String(m));
    return { success: true, minutes: m };
  }

  getLockedPages() {
    try {
      const raw = db.getSetting('browser_guard_locked_pages');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  toggleLockPage(pageId) {
    if (!pageId) return this.getLockedPages();
    const cleanId = String(pageId).trim().toLowerCase();
    const current = new Set(this.getLockedPages().map(p => String(p).toLowerCase()));
    if (current.has(cleanId)) {
      current.delete(cleanId);
    } else {
      current.add(cleanId);
    }
    const updated = Array.from(current);
    db.setSetting('browser_guard_locked_pages', JSON.stringify(updated));
    for (const key of Array.from(this.unlockedPagesSession.keys())) {
      if (key.toLowerCase().includes(cleanId)) {
        this.unlockedPagesSession.delete(key);
      }
    }
    this.triggerScan();
    return updated;
  }

  addCustomLockedPage(keyword) {
    if (!keyword) return this.getLockedPages();
    const clean = String(keyword).trim().toLowerCase();
    if (!clean) return this.getLockedPages();
    const current = new Set(this.getLockedPages().map(p => String(p).toLowerCase()));
    current.add(clean);
    const updated = Array.from(current);
    db.setSetting('browser_guard_locked_pages', JSON.stringify(updated));
    for (const key of Array.from(this.unlockedPagesSession.keys())) {
      if (key.toLowerCase().includes(clean)) {
        this.unlockedPagesSession.delete(key);
      }
    }
    this.triggerScan();
    return updated;
  }

  async triggerScan() {
    try {
      this.ensureWatcherRunning();
      if (this.watcherProc && this.watcherProc.stdin && !this.watcherProc.killed) {
        this.watcherProc.stdin.write('SCAN\n');
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } catch (_) {}
    return this.getDetectedPages();
  }

  getDetectedPages() {
    return [...this.detectedPages];
  }

  clearDetectedPages() {
    this.detectedPages = [];
    this.broadcastDetectedPages();
    return [];
  }

  cleanPageTitle(rawTitle) {
    if (!rawTitle) return '';
    let title = String(rawTitle).trim();
    // Remove Unicode directional formatting characters (LRM, RLM, LRE, RLE, PDF, LRI, RLI, FSI, PDI, BOM)
    title = title.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();
    // Remove notification badges e.g. "(1) ", "(99+) "
    title = title.replace(/^\(\d+\+?\)\s*/, '').trim();
    // Remove browser suffixes
    title = title.replace(/\s*-\s*(Google Chrome|Microsoft Edge|Edge|Brave|Mozilla Firefox|Firefox|Opera|Opera GX|Vivaldi|Arc|Tor Browser).*$/i, '').trim();

    // Check if what remains is empty or just browser name or new tab
    const lower = title.toLowerCase();
    const BROWSER_SHELL_NAMES = [
      'google chrome', 'chrome',
      'microsoft edge', 'edge',
      'brave', 'brave browser',
      'mozilla firefox', 'firefox',
      'opera', 'opera gx',
      'vivaldi', 'arc', 'tor browser',
      'new tab', 'علامة تبويب جديدة',
      'about:blank', 'tab'
    ];
    if (!title || BROWSER_SHELL_NAMES.includes(lower)) {
      return '';
    }
    return title;
  }

  recordDetectedPage(cleanTitle, rawTitle, browserProc) {
    if (!cleanTitle) return;
    const keyword = cleanTitle.toLowerCase();
    const existingIndex = this.detectedPages.findIndex(p => p.keyword === keyword || p.name.toLowerCase() === keyword);
    if (existingIndex >= 0) {
      this.detectedPages[existingIndex].lastSeen = Date.now();
      this.detectedPages[existingIndex].browser = browserProc;
    } else {
      this.detectedPages.unshift({
        id: 'page_' + Math.random().toString(36).substring(2, 9),
        name: cleanTitle,
        keyword: keyword,
        browser: browserProc,
        icon: '🌐',
        lastSeen: Date.now()
      });
      if (this.detectedPages.length > 25) {
        this.detectedPages = this.detectedPages.slice(0, 25);
      }
    }
    this.broadcastDetectedPages();
  }

  broadcastDetectedPages() {
    try {
      if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
        const pages = this.getDetectedPages();
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed() && w.webContents) {
            w.webContents.send('browser-guard:pages-updated', pages);
          }
        });
      }
    } catch (_) {}
  }

  isPageLocked(cleanTitle, rawTitle) {
    const lockedList = this.getLockedPages();
    if (!lockedList || lockedList.length === 0) return null;

    const lowerClean = (cleanTitle || '').toLowerCase();
    const lowerRaw = (rawTitle || '').toLowerCase();

    for (const locked of lockedList) {
      const l = String(locked).trim().toLowerCase();
      if (!l || l.length < 2) continue;
      if (
        (lowerClean && lowerClean.includes(l)) ||
        (lowerRaw && lowerRaw.includes(l)) ||
        (lowerClean && lowerClean.length >= 3 && l.includes(lowerClean))
      ) {
        return { id: locked, name: cleanTitle || locked, keyword: l, icon: '🔒' };
      }
    }

    return null;
  }

  initExtensionBridge() {
    try {
      const rawLocked = db.getSetting('browser_guard_locked_tabs');
      if (rawLocked) {
        extensionServer.setLockedDomains(JSON.parse(rawLocked));
      }
    } catch (_) {}

    extensionServer.setCallbacks({
      verifyPin: (pin) => this.verifyPinDetailed(pin),
      onLockout: () => this.triggerSystemLock(),
      getRules: () => ({
        enabled: this.isEnabled(),
        hasPin: Boolean(this.getPin() && this.getPin().length >= 3),
        pinLength: this.getPin().length || 4
      }),
      onTabsChange: (tabs) => {
        try {
          if (BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
            BrowserWindow.getAllWindows().forEach(w => {
              if (!w.isDestroyed() && w.webContents) {
                w.webContents.send('browser-guard:tabs-updated', tabs);
              }
            });
          }
        } catch (_) {}
      }
    });

    extensionServer.start();
  }

  getKnownBrowsers() {
    return KNOWN_BROWSERS;
  }

  isEnabled() {
    return db.getSetting('browser_guard_enabled') === 'true';
  }

  getPin() {
    return db.getSetting('browser_guard_pin') || '';
  }

  hasPin() {
    return Boolean(this.getPin() && this.getPin().length >= 3);
  }

  getLockedTabs() {
    try {
      const raw = db.getSetting('browser_guard_locked_tabs');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return extensionServer.lockedDomains || [];
  }

  toggleLockTab(domain) {
    if (!domain) return this.getLockedTabs();
    const current = new Set(this.getLockedTabs());
    const clean = String(domain).trim().toLowerCase();
    if (current.has(clean)) {
      current.delete(clean);
    } else {
      current.add(clean);
    }
    const updated = Array.from(current);
    db.setSetting('browser_guard_locked_tabs', JSON.stringify(updated));
    extensionServer.setLockedDomains(updated);
    return updated;
  }

  getLiveTabs() {
    return {
      connected: extensionServer.isExtensionConnected(),
      tabs: extensionServer.getLiveTabs()
    };
  }

  openExtensionFolder() {
    const extPath = path.resolve(__dirname, '..', 'extension');
    try {
      if (shell && typeof shell.openPath === 'function') {
        shell.openPath(extPath);
      }
    } catch (_) {}
    return { success: true, path: extPath };
  }

  getProtectedBrowsers() {
    try {
      const raw = db.getSetting('browser_guard_browsers');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return ['chrome', 'msedge', 'brave', 'firefox', 'opera'];
  }

  getInstalledBrowsers() {
    const results = [];
    const candidates = [
      {
        id: 'chrome',
        name: 'Google Chrome',
        icon: '🌐',
        paths: [
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ]
      },
      {
        id: 'msedge',
        name: 'Microsoft Edge',
        icon: '🌊',
        paths: [
          path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
        ]
      },
      {
        id: 'brave',
        name: 'Brave Browser',
        icon: '🦁',
        paths: [
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
        ]
      },
      {
        id: 'firefox',
        name: 'Mozilla Firefox',
        icon: '🦊',
        paths: [
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe')
        ]
      },
      {
        id: 'opera',
        name: 'Opera / Opera GX',
        icon: '🔴',
        paths: [
          path.join(process.env.LOCALAPPDATA || '', 'Programs\\Opera\\launcher.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Programs\\Opera GX\\launcher.exe'),
          path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Opera\\launcher.exe')
        ]
      }
    ];

    for (const c of candidates) {
      let foundPath = null;
      for (const p of c.paths) {
        if (p && fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      results.push({
        id: c.id,
        name: c.name,
        icon: c.icon,
        installed: Boolean(foundPath),
        exePath: foundPath
      });
    }

    return results;
  }

  launchBrowserWithExtension(browserId) {
    const list = this.getInstalledBrowsers();
    const target = list.find((b) => b.id === browserId && b.installed);
    if (!target || !target.exePath) {
      throw new Error('المتصفح غير مثبت على هذا الجهاز');
    }
    const extDir = path.resolve(__dirname, '..', 'extension');
    const { clipboard } = require('electron');
    if (clipboard && typeof clipboard.writeText === 'function') {
      try { clipboard.writeText(extDir); } catch (_) {}
    }

    const extUrl = browserId === 'msedge' ? 'edge://extensions' : 'chrome://extensions';
    try {
      spawn(target.exePath, [`--load-extension=${extDir}`, extUrl], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    } catch (_) {}
    if (shell && typeof shell.openPath === 'function') {
      shell.openPath(extDir);
    }
    this.triggerScan().catch(() => {});
    return { success: true, name: target.name, extDir, extUrl };
  }

  getStatus() {
    const pin = this.getPin();
    return {
      enabled: this.isEnabled(),
      hasPin: Boolean(pin && pin.length >= 3),
      pinLength: pin ? pin.length : 0,
      protectedBrowsers: this.getProtectedBrowsers(),
      knownBrowsers: KNOWN_BROWSERS,
      installedBrowsers: this.getInstalledBrowsers(),
      extensionConnected: extensionServer.isExtensionConnected(),
      lockedTabs: this.getLockedTabs(),
      guardMode: this.getGuardMode(),
      lockedPages: this.getLockedPages(),
      detectedPages: this.getDetectedPages(),
      gracePeriodMinutes: this.getGracePeriodMinutes()
    };
  }

  setEnabled(enabled) {
    db.setSetting('browser_guard_enabled', enabled ? 'true' : 'false');
    if (enabled) {
      this.start();
    } else {
      this.stop();
      this.closeLockDialog();
    }
    return this.getStatus();
  }

  setPin(pin) {
    if (!pin || pin.length < 3 || pin.length > 8) {
      throw new Error('يجب أن يتكون رمز الـ PIN من 3 إلى 8 أرقام');
    }
    db.setSetting('browser_guard_pin', String(pin).trim());
    return { success: true };
  }

  setProtectedBrowsers(browsersList) {
    if (!Array.isArray(browsersList)) throw new Error('قائمة المتصفحات غير صالحة');
    db.setSetting('browser_guard_browsers', JSON.stringify(browsersList));
    return { success: true, protectedBrowsers: browsersList };
  }

  triggerSystemLock() {
    if (process.platform === 'win32') {
      try {
        const ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinLock {
    [DllImport("user32.dll")] public static extern bool LockWorkStation();
}
'@
[WinLock]::LockWorkStation()
`;
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
          windowsHide: true,
          timeout: 2000
        });
      } catch (_) {}
    }
  }

  verifyPin(inputPin) {
    const saved = this.getPin();
    if (!saved) return false;
    return String(inputPin).trim() === saved;
  }

  verifyPinDetailed(inputPin) {
    const isValid = this.verifyPin(inputPin);
    if (isValid) {
      this.failedAttempts = 0;
      return { success: true, attemptsLeft: this.maxAttempts, lockedOut: false };
    }

    this.failedAttempts = (this.failedAttempts || 0) + 1;
    const attemptsLeft = Math.max(0, this.maxAttempts - this.failedAttempts);

    if (this.failedAttempts >= this.maxAttempts) {
      this.failedAttempts = 0;
      this.triggerSystemLock();
      return { success: false, attemptsLeft: 0, lockedOut: true };
    }

    return { success: false, attemptsLeft, lockedOut: false };
  }

  ensureWarmLockWindow() {
    if (this.lockWindow && !this.lockWindow.isDestroyed()) {
      return this.lockWindow;
    }

    if (!BrowserWindow) return null;

    let targetBounds = { x: 0, y: 0, width: 1920, height: 1080 };
    try {
      if (screen && typeof screen.getPrimaryDisplay === 'function') {
        const primary = screen.getPrimaryDisplay();
        if (primary && primary.bounds) {
          targetBounds = primary.bounds;
        }
      }
    } catch (_) {}

    try {
      this.lockWindow = new BrowserWindow({
        x: targetBounds.x,
        y: targetBounds.y,
        width: targetBounds.width,
        height: targetBounds.height,
        title: 'AuraSync Security Guard',
        icon: path.join(__dirname, '..', 'icon.ico'),
        frame: false,
        transparent: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#020408',
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      this.lockWindow.loadFile(path.join(__dirname, 'browser-lock.html'), {
        query: {
          browser: 'Google Chrome',
          proc: 'chrome',
          icon: '🌐',
          pinLength: String(this.getPin().length || 4)
        }
      });

      this.lockWindow.on('closed', () => {
        this.lockWindow = null;
      });

      return this.lockWindow;
    } catch (e) {
      return null;
    }
  }

  ensureWatcherRunning() {
    if (process.platform !== 'win32') return;
    if (this.watcherProc && !this.watcherProc.killed) return;

    this.isStopping = false;
    try {
      const b64 = Buffer.from(WATCHER_SCRIPT, 'utf16le').toString('base64');
      this.watcherProc = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        b64
      ], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.watcherProc.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          this.handleWatcherLine(line.trim());
        }
      });

      this.watcherProc.stderr.on('data', () => {});

      this.watcherProc.on('exit', () => {
        this.watcherProc = null;
        if (!this.isStopping) {
          if (this.respawnTimer) clearTimeout(this.respawnTimer);
          this.respawnTimer = setTimeout(() => this.ensureWatcherRunning(), 1500);
        }
      });

      console.log('[BrowserGuard] Instant native watcher started (20ms cycle).');
    } catch (err) {
      console.error('[BrowserGuard] Failed to start native watcher:', err.message);
    }
  }

  start() {
    if (process.platform !== 'win32') return;
    this.ensureWarmLockWindow();
    this.ensureWatcherRunning();
  }

  stop() {
    this.isStopping = true;
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
    if (this.watcherProc) {
      try {
        this.watcherProc.stdin.write('QUIT\n');
        this.watcherProc.stdin.end();
      } catch (_) {}
      try {
        this.watcherProc.kill();
      } catch (_) {}
      this.watcherProc = null;
    }
    this.unlockedBrowsers.clear();
    this.activeForeground = '';
    this.currentLockedProc = '';
    this.currentLockedHwnd = null;
  }

  getLockWindowHwnd() {
    if (!this.lockWindow || this.lockWindow.isDestroyed()) return null;
    try {
      const buf = this.lockWindow.getNativeWindowHandle();
      if (!buf || buf.length === 0) return null;
      return buf.length >= 8 ? buf.readBigInt64LE(0).toString() : buf.readInt32LE(0).toString();
    } catch (_) {
      return null;
    }
  }

  isLockDialogWindow(hwnd, newProc) {
    if (!this.lockWindow || this.lockWindow.isDestroyed()) return false;
    const isOurApp = newProc === 'aurasync' || newProc === 'electron';
    if (!isOurApp) return false;

    // Check by window handle
    const lockHwnd = this.getLockWindowHwnd();
    if (lockHwnd && hwnd && String(hwnd) === lockHwnd) {
      return true;
    }

    // Check if the lock window is currently visible and focused
    try {
      if (this.lockWindow.isVisible() && this.lockWindow.isFocused()) {
        return true;
      }
    } catch (_) {}

    return false;
  }

  matchBrowserProc(procName) {
    if (!procName) return null;
    const lower = procName.toLowerCase();
    const protectedList = this.getProtectedBrowsers();
    if (protectedList.includes(lower)) return lower;

    // Handle aliases like opera_gx / opera
    if (lower === 'opera_gx' && (protectedList.includes('opera') || protectedList.includes('operagx') || protectedList.includes('opera_gx'))) {
      return 'opera_gx';
    }
    if (lower === 'opera' && (protectedList.includes('operagx') || protectedList.includes('opera_gx'))) {
      return 'opera';
    }
    if (lower.includes('whatsapp')) return 'whatsapp';
    if (lower.includes('telegram')) return 'telegram';
    return null;
  }

  handleWatcherLine(line) {
    if (!line) return;
    const parts = line.split('|');
    let evtType = 'FG';
    let newProc = '';
    let hwnd = null;
    let pid = null;
    let rawB64 = '';

    if (parts[0] === 'SCAN' || parts[0] === 'FG') {
      evtType = parts[0];
      newProc = (parts[1] || '').trim().toLowerCase();
      hwnd = parts[2] || null;
      pid = parts[3] || null;
      rawB64 = (parts[4] || '').trim();
    } else {
      newProc = (parts[0] || '').trim().toLowerCase();
      hwnd = parts[1] || null;
      pid = parts[2] || null;
      rawB64 = (parts[3] || '').trim();
    }

    if (!newProc) return;

    let rawTitle = '';
    if (rawB64) {
      try {
        rawTitle = Buffer.from(rawB64, 'base64').toString('utf8');
      } catch (_) {
        rawTitle = parts.slice(4).join('|').trim();
      }
    }

    // Handle background SCAN discovery
    if (evtType === 'SCAN') {
      const matchedBrowser = this.matchBrowserProc(newProc);
      if (matchedBrowser && rawTitle) {
        const cleanTitle = this.cleanPageTitle(rawTitle);
        if (cleanTitle) {
          this.recordDetectedPage(cleanTitle, rawTitle, matchedBrowser);
        }
      }
      return; // Do NOT trigger UI screen locks on background window scans
    }

    // Handle FG (Foreground focus events)
    if (newProc === 'aurasync' || newProc === 'electron') {
      // 1. If foreground is the Lock Dialog itself, the user is typing/clicking their PIN!
      // NEVER hide the lock dialog!
      if (this.isLockDialogWindow(hwnd, newProc)) {
        return;
      }

      // 2. If the user deliberately focused the main AuraSync window, hide the lock dialog
      if (this.lockWindow && !this.lockWindow.isDestroyed() && this.lockWindow.isVisible()) {
        this.hideLockDialog();
      }
      return;
    }

    const matchedBrowser = this.matchBrowserProc(newProc);
    if (!matchedBrowser) {
      // If foreground is the lock dialog itself, do NOT treat it as switching away from the browser!
      if (this.isLockDialogWindow(hwnd, newProc)) {
        return;
      }

      // Switched away from browser to another app / desktop / window
      if (this.lockWindow && !this.lockWindow.isDestroyed() && this.lockWindow.isVisible()) {
        this.hideLockDialog();
      }
      // Instant Lock on Switch / Blur:
      // The moment focus leaves the protected browser to ANY other app,
      // invalidate unlocked status immediately so returning requires PIN every single time!
      if (this.activeForeground && this.unlockedBrowsers) {
        this.unlockedBrowsers.delete(this.activeForeground);
      }
      this.activeForeground = '';
      return;
    }

    if (!this.isEnabled()) {
      return;
    }

    // If switching between two different protected browsers (e.g. Edge to Chrome),
    // immediately lock the previous one as well!
    if (this.activeForeground && this.activeForeground !== matchedBrowser && this.unlockedBrowsers) {
      this.unlockedBrowsers.delete(this.activeForeground);
    }

    this.activeForeground = matchedBrowser;
    if (this.isBrowserUnlocked(matchedBrowser)) {
      // User is actively browsing inside the unlocked browser: keep session fresh
      this.unlockedBrowsers.set(matchedBrowser, Date.now());
      return;
    }

    this.showLockDialog(matchedBrowser, hwnd);
  }

  showLockDialog(procName, hwnd = null, pageName = null, sessionKey = null) {
    // If the lock dialog is ALREADY visible and locking this exact browser,
    // do NOT re-initialize or wipe the user's current PIN input!
    if (this.lockWindow && !this.lockWindow.isDestroyed() && this.lockWindow.isVisible()) {
      if (this.currentLockedProc === procName) {
        return;
      }
    }

    this.currentLockedProc = procName;
    this.currentLockedHwnd = hwnd;
    this.currentLockedPageTitle = pageName;
    this.currentSessionKey = sessionKey;

    let targetBounds = null;
    try {
      if (screen && typeof screen.getCursorScreenPoint === 'function') {
        const cursorPoint = screen.getCursorScreenPoint();
        const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
        if (targetDisplay && targetDisplay.bounds) {
          targetBounds = targetDisplay.bounds;
        }
      }
    } catch (_) {}

    if (!targetBounds) {
      targetBounds = { x: 0, y: 0, width: 1920, height: 1080 };
    }

    const browserMeta = KNOWN_BROWSERS.find((b) => b.proc === procName || b.id === procName) || {
      name: procName,
      icon: '🌐'
    };

    const win = this.ensureWarmLockWindow();
    if (!win || win.isDestroyed()) return;

    try {
      win.setBounds(targetBounds);
      win.webContents.send('guard:prepare', {
        browser: browserMeta.name,
        proc: procName,
        icon: browserMeta.icon,
        pinLength: String(this.getPin().length || 4),
        pageName: pageName || null
      });
      win.setAlwaysOnTop(true, 'screen-saver', 1);
      win.show();
      win.focus();
    } catch (_) {}
  }

  unlockCurrentBrowser() {
    if (this.currentSessionKey) {
      this.unlockedPagesSession.set(this.currentSessionKey, Date.now());
      this.currentSessionKey = null;
    }
    if (this.currentLockedProc) {
      this.unlockedBrowsers.set(this.currentLockedProc, Date.now());
      console.log(`[BrowserGuard] Unlocked ${this.currentLockedProc} with valid PIN.`);
    }

    // Restore focus to the browser window
    if (this.currentLockedHwnd && this.watcherProc && this.watcherProc.stdin) {
      try {
        this.watcherProc.stdin.write(`FOCUS|${this.currentLockedHwnd}\n`);
      } catch (_) {}
    }

    this.hideLockDialog();
  }

  closeCurrentLockedTab() {
    if (this.currentLockedHwnd && this.watcherProc && this.watcherProc.stdin) {
      try {
        this.watcherProc.stdin.write(`CLOSETAB|${this.currentLockedHwnd}\n`);
      } catch (_) {}
    }
    this.hideLockDialog();
  }

  minimizeProtectedBrowser() {
    // 1. Instant minimization via tracked window handle
    if (this.currentLockedHwnd && this.watcherProc && this.watcherProc.stdin) {
      try {
        this.watcherProc.stdin.write(`MIN|${this.currentLockedHwnd}\n`);
      } catch (_) {}
    }

    // 2. Resilient fallback minimization by process name
    if (this.currentLockedProc) {
      try {
        const ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinMinFallback {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@
Get-Process -Name "${this.currentLockedProc}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object {
    [WinMinFallback]::ShowWindowAsync($_.MainWindowHandle, 6)
}
`;
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
          windowsHide: true,
          timeout: 1500
        });
      } catch (_) {}
    }

    this.hideLockDialog();
  }

  hideLockDialog() {
    if (this.lockWindow && !this.lockWindow.isDestroyed()) {
      try {
        this.lockWindow.hide();
      } catch (_) {}
    }
    this.currentLockedHwnd = null;
  }

  closeLockDialog() {
    if (this.lockWindow && !this.lockWindow.isDestroyed()) {
      try {
        this.lockWindow.close();
      } catch (_) {}
    }
    this.lockWindow = null;
    this.currentLockedHwnd = null;
  }
}

module.exports = new BrowserGuardManager();
