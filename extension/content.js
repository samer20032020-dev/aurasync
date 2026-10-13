// AuraSync Browser Guard — Content Script
(function () {
  let overlayEl = null;
  let currentPin = '';
  let expectedLength = 4;
  let isSubmitting = false;

  function createOverlay(domain, length) {
    if (overlayEl) return;
    expectedLength = length || 4;
    currentPin = '';

    overlayEl = document.createElement('div');
    overlayEl.id = 'aurasync-guard-overlay';

    let dotsHtml = '';
    for (let i = 0; i < expectedLength; i++) {
      dotsHtml += '<div class="aurasync-dot"></div>';
    }

    overlayEl.innerHTML = `
      <div class="aurasync-card">
        <div class="aurasync-shield">🛡️</div>
        <h2 class="aurasync-title">صفحة محمية</h2>
        <span class="aurasync-domain-badge">${domain || window.location.hostname}</span>
        <p class="aurasync-subtitle">أدخل رمز الدخول (PIN) لفتح هذه الصفحة ومتابعة التصفح</p>
        <div class="aurasync-dots" id="aurasync-dots-container">
          ${dotsHtml}
        </div>
        <div class="aurasync-keypad">
          <button class="aurasync-key" data-digit="1">1</button>
          <button class="aurasync-key" data-digit="2">2</button>
          <button class="aurasync-key" data-digit="3">3</button>
          <button class="aurasync-key" data-digit="4">4</button>
          <button class="aurasync-key" data-digit="5">5</button>
          <button class="aurasync-key" data-digit="6">6</button>
          <button class="aurasync-key" data-digit="7">7</button>
          <button class="aurasync-key" data-digit="8">8</button>
          <button class="aurasync-key" data-digit="9">9</button>
          <button class="aurasync-key action" id="aurasync-btn-clear">مسح</button>
          <button class="aurasync-key" data-digit="0">0</button>
          <button class="aurasync-key action" id="aurasync-btn-back">⌫</button>
        </div>
        <div class="aurasync-error" id="aurasync-error-msg"></div>
      </div>
    `;

    document.documentElement.appendChild(overlayEl);

    // Event listeners for keypad
    overlayEl.querySelectorAll('.aurasync-key[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        addDigit(btn.getAttribute('data-digit'));
      });
    });

    const btnBack = overlayEl.querySelector('#aurasync-btn-back');
    if (btnBack) btnBack.addEventListener('click', removeDigit);

    const btnClear = overlayEl.querySelector('#aurasync-btn-clear');
    if (btnClear) btnClear.addEventListener('click', clearDigits);
  }

  function removeOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.add('aurasync-closing');
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      overlayEl = null;
      currentPin = '';
    }, 300);
  }

  function updateDots() {
    if (!overlayEl) return;
    const dots = overlayEl.querySelectorAll('.aurasync-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < currentPin.length);
    });
  }

  function addDigit(digit) {
    if (currentPin.length >= expectedLength || isSubmitting) return;
    currentPin += digit;
    updateDots();

    if (currentPin.length === expectedLength) {
      setTimeout(submitPin, 80);
    }
  }

  function removeDigit() {
    if (currentPin.length > 0 && !isSubmitting) {
      currentPin = currentPin.slice(0, -1);
      updateDots();
    }
  }

  function clearDigits() {
    if (!isSubmitting) {
      currentPin = '';
      updateDots();
    }
  }

  async function submitPin() {
    if (currentPin.length !== expectedLength || isSubmitting) return;
    isSubmitting = true;

    try {
      chrome.runtime.sendMessage({
        action: 'VERIFY_PIN',
        pin: currentPin
      }, (res) => {
        isSubmitting = false;
        if (chrome.runtime.lastError) {
          showError('تعذر الاتصال بـ AuraSync');
          return;
        }

        if (res && res.success) {
          removeOverlay();
          return;
        }

        if (res && res.lockedOut) {
          showError('🚨 تم قفل جهاز الكمبيوتر لحماية خصوصيتك (Win + L)');
          return;
        }

        const left = res && res.attemptsLeft !== undefined ? res.attemptsLeft : null;
        if (left === 1) {
          showError('⚠️ رمز غير صحيح • متبقي محاولة أخيرة (1)');
        } else if (left !== null) {
          showError(`⚠️ رمز غير صحيح • متبقي ${left} محاولات`);
        } else {
          showError('⚠️ رمز PIN غير صحيح');
        }
      });
    } catch (_) {
      isSubmitting = false;
      showError('حدث خطأ في التحقق');
    }
  }

  function showError(msg) {
    if (!overlayEl) return;
    const errorEl = overlayEl.querySelector('#aurasync-error-msg');
    const dotsEl = overlayEl.querySelector('#aurasync-dots-container');

    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('show');
    }
    if (dotsEl) {
      dotsEl.classList.add('shake');
    }

    currentPin = '';
    updateDots();

    setTimeout(() => {
      if (errorEl) errorEl.classList.remove('show');
      if (dotsEl) dotsEl.classList.remove('shake');
    }, 1800);
  }

  // Keyboard support
  window.addEventListener('keydown', (e) => {
    if (!overlayEl) return;
    if (e.key >= '0' && e.key <= '9') {
      e.stopPropagation();
      addDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.stopPropagation();
      removeDigit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      clearDigits();
    }
  }, true);

  // Message listener from background worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'AURA_LOCK_PAGE') {
      createOverlay(msg.domain, msg.pinLength);
    } else if (msg.action === 'AURA_UNLOCK_PAGE') {
      removeOverlay();
    }
  });

  // Query status on load
  try {
    chrome.runtime.sendMessage({
      action: 'GET_LOCK_STATUS',
      url: window.location.href
    }, (res) => {
      if (!chrome.runtime.lastError && res && res.isLocked) {
        createOverlay(res.domain, res.pinLength);
      }
    });
  } catch (_) {}
})();
