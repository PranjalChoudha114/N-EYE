import {
  type ExtensionMessage,
  type ExtensionResponse,
  type TaskState,
  type TabInfo,
  createTaskId,
} from '@n-eye/protocol';

let currentTaskState: TaskState = {
  taskId: createTaskId('task-active'),
  goal: '',
  status: 'IDLE',
};

// Enable side panel on extension action icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[N-Eye SW] Failed to set side panel behavior:', error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('[N-Eye SW] N-Eye Extension v0.1.0 initialized (Manifest V3)');
});

function isSupportedUrl(url?: string): { isSupported: boolean; reason?: string } {
  if (!url) {
    return { isSupported: false, reason: 'No URL available for this tab.' };
  }
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('devtools://')) {
    return { isSupported: false, reason: 'Chrome internal pages cannot be observed by extensions.' };
  }
  if (url.includes('chromewebstore.google.com') || url.includes('chrome.google.com/webstore')) {
    return { isSupported: false, reason: 'Chrome Web Store is protected by browser policy.' };
  }
  if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:')) {
    return { isSupported: false, reason: 'Unsupported browser URI scheme.' };
  }
  return { isSupported: true };
}

async function getActiveTabInfo(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return null;

  const url = tab.url || '';
  const title = tab.title || '';
  const { isSupported, reason } = isSupportedUrl(url);

  let origin = '';
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://'))) {
      origin = new URL(url).origin;
    }
  } catch {
    origin = url;
  }

  return {
    tabId: tab.id,
    url,
    title,
    origin: origin || url,
    isSupported,
    unsupportedReason: reason,
  };
}

async function notifyTabChanged(): Promise<void> {
  const tabInfo = await getActiveTabInfo();
  if (tabInfo) {
    currentTaskState.activeTab = tabInfo;
    if (!tabInfo.isSupported) {
      currentTaskState.status = 'UNSUPPORTED_PAGE';
    } else if (currentTaskState.status === 'UNSUPPORTED_PAGE') {
      currentTaskState.status = 'IDLE';
    }

    chrome.runtime.sendMessage({
      type: 'TAB_CHANGED',
      tabInfo,
    }).catch(() => {
      // Side panel may be closed, ignore
    });
  }
}

// Listen to tab switching & updates
chrome.tabs.onActivated.addListener(() => {
  notifyTabChanged();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    notifyTabChanged();
  }
});

// Central message router
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    if (message.type === 'PING') {
      sendResponse({ success: true, data: { pong: true, timestamp: Date.now() } });
      return true;
    }

    if (message.type === 'GET_ACTIVE_TAB_INFO') {
      getActiveTabInfo().then((info) => {
        sendResponse({ success: true, data: info });
      }).catch((err) => {
        sendResponse({ success: false, error: (err as Error).message });
      });
      return true;
    }

    if (message.type === 'GET_STATE') {
      getActiveTabInfo().then((tabInfo) => {
        if (tabInfo) {
          currentTaskState.activeTab = tabInfo;
        }
        sendResponse({ success: true, data: currentTaskState });
      });
      return true;
    }

    if (message.type === 'START_TASK') {
      currentTaskState = {
        ...currentTaskState,
        taskId: createTaskId(`task-${Date.now()}`),
        goal: message.goal,
        status: 'OBSERVING',
      };

      chrome.runtime.sendMessage({
        type: 'STATE_UPDATED',
        state: currentTaskState,
      }).catch(() => {});

      sendResponse({ success: true, data: currentTaskState });
      return true;
    }

    if (message.type === 'CANCEL_TASK') {
      currentTaskState = {
        ...currentTaskState,
        status: 'CANCELLED',
      };
      sendResponse({ success: true, data: currentTaskState });
      return true;
    }

    return false;
  }
);
