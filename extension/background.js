// AuraSync Browser Guard — Extension Background Service Worker
const AURASYNC_PORT = 49721;
const AURASYNC_API = `http://127.0.0.1:${AURASYNC_PORT}`;

let cachedRules = {
  enabled: true,
  lockedDomains: [],
  hasPin: false,
  pinLength: 4
};

const sessionUnlockedTabs = new Map(); // tabId -> domain

function extractDomain(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'edge:' || parsed.protocol === 'chrome-extension:' || parsed.protocol === 'about:') {
      return '';
    }
    return parsed.hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

let reportTimeout = null;
function scheduleReportTabs() {
  if (reportTimeout) clearTimeout(reportTimeout);
  reportTimeout = setTimeout(reportTabsNow, 250);
}

async function reportTabsNow() {
  try {
    const tabs = await chrome.tabs.query({});
    const safeTabs = [];

    for (const t of tabs) {
      const domain = extractDomain(t.url);
      if (!domain) continue;

      safeTabs.push({
        id: t.id,
        windowId: t.windowId,
        title: t.title || domain,
        url: t.url,
        domain: domain,
        favIconUrl: t.favIconUrl || '',
        active: Boolean(t.active)
      });
    }

    await fetch(`${AURASYNC_API}/api/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs: safeTabs })
    });
  } catch (_) {
    // AuraSync might be closed or starting up
  }
}

async function fetchRules() {
  try {
    const res = await fetch(`${AURASYNC_API}/api/rules`);
    if (res.ok) {
      const data = await res.json();
      cachedRules = {
        enabled: Boolean(data.enabled),
        lockedDomains: Array.isArray(data.lockedDomains) ? data.lockedDomains : [],
        hasPin: Boolean(data.hasPin),
        pinLength: data.pinLength || 4
      };
      checkActiveTabs();
    }
  } catch (_) {
    // Server not reached
  }
}

function isDomainLocked(domain) {
  if (!cachedRules.enabled || !cachedRules.hasPin) return false;
  const d = (domain || '').toLowerCase();
  return cachedRules.lockedDomains.some(locked => {
    const l = locked.toLowerCase();
    return d === l || d.endsWith('.' + l) || d.includes(l);
  });
}

async function checkTabLock(tabId, url) {
  const domain = extractDomain(url);
  if (!domain) return;

  // Check if session-unlocked for this domain
  if (sessionUnlockedTabs.get(tabId) === domain) {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'AURA_UNLOCK_PAGE' }).catch(() => {});
    } catch (_) {}
    return;
  }

  if (isDomainLocked(domain)) {
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'AURA_LOCK_PAGE',
        domain: domain,
        pinLength: cachedRules.pinLength
      }).catch(() => {});
    } catch (_) {}
  } else {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'AURA_UNLOCK_PAGE' }).catch(() => {});
    } catch (_) {}
  }
}

async function checkActiveTabs() {
  try {
    const tabs = await chrome.tabs.query({ active: true });
    for (const t of tabs) {
      if (t.id && t.url) {
        checkTabLock(t.id, t.url);
      }
    }
  } catch (_) {}
}

// Tab event listeners
chrome.tabs.onCreated.addListener(() => scheduleReportTabs());
chrome.tabs.onRemoved.addListener((tabId) => {
  sessionUnlockedTabs.delete(tabId);
  scheduleReportTabs();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
    scheduleReportTabs();
    if (tab.url) {
      checkTabLock(tabId, tab.url);
    }
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  scheduleReportTabs();
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      checkTabLock(activeInfo.tabId, tab.url);
    }
  } catch (_) {}
});

// Communication with content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_LOCK_STATUS') {
    const tabId = sender.tab ? sender.tab.id : null;
    const domain = extractDomain(message.url);
    if (tabId && sessionUnlockedTabs.get(tabId) === domain) {
      sendResponse({ isLocked: false });
      return true;
    }
    const locked = isDomainLocked(domain);
    sendResponse({
      isLocked: locked,
      domain: domain,
      pinLength: cachedRules.pinLength
    });
    return true;
  }

  if (message.action === 'VERIFY_PIN') {
    const tabId = sender.tab ? sender.tab.id : null;
    const domain = extractDomain(sender.tab ? sender.tab.url : '');

    fetch(`${AURASYNC_API}/api/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: message.pin })
    })
      .then(res => res.json())
      .then(result => {
        if (result && result.success) {
          if (tabId && domain) {
            sessionUnlockedTabs.set(tabId, domain);
          }
        }
        sendResponse(result);
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep message channel open for async response
  }
});

// Initial startup and periodic sync
fetchRules();
scheduleReportTabs();
setInterval(fetchRules, 2500);
