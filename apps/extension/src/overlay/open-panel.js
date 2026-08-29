/**
 * Extension-page click catcher for More → Side Panel.
 * WHY: chrome.sidePanel.open requires a user gesture on an extension page.
 * Content-script clicks often cannot satisfy that after runtime messaging.
 * MUST NOT: Host the vault, trust loop, or any secrets.
 */
(() => {
  let tabId;
  try {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (res) => {
      if (res && res.success && res.data && typeof res.data.tabId === 'number') {
        tabId = res.data.tabId;
      }
    });
  } catch {
    // Service worker may be restarting.
  }
  const go = document.getElementById('go');
  if (!go) return;
  go.addEventListener('click', () => {
    try {
      chrome.runtime.sendMessage({ type: 'N_EYE_UI_COMMAND', command: 'openPanel' });
    } catch {
      // ignore
    }
    if (typeof tabId === 'number' && chrome.sidePanel && chrome.sidePanel.open) {
      void chrome.sidePanel.open({ tabId });
    }
  });
})();
