import {
  type ExtensionMessage,
  type ExtensionResponse,
  type TaskState,
  type TabInfo,
  createTaskId,
} from '@n-eye/protocol';
import {
  MAX_ROI_HEIGHT_PX,
  MAX_ROI_PIXELS,
  MAX_ROI_WIDTH_PX,
  MIN_ROI_SIDE_PX,
} from '../perception/roi.js';

/**
 * N-Eye Service Worker (Zone 2 - Extension Core)
 * OWNS: MV3 lifecycle coordination, active tab tracking, and programmatic injection fallback.
 * TRUST BOUNDARY: Privileged extension background context. Never accesses raw DOM directly.
 * SELF-HEALING: Executes content.js dynamically via chrome.scripting when tabs pre-exist before extension reload.
 */
let currentTaskState: TaskState = {
  taskId: createTaskId('task-active'),
  goal: '',
  status: 'IDLE',
};

// Enable side panel on extension action icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((_err) => {});

function isSupportedUrl(url?: string): { isSupported: boolean; reason?: string } {
  if (!url) {
    return { isSupported: false, reason: 'No active webpage URL detected.' };
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

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    // 1. Try active tab in last focused window
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id !== undefined) return tab;

    // 2. Fallback: query any active tab across normal windows
    const allActive = await chrome.tabs.query({ active: true });
    const normalActive = allActive.find((t) => t.id !== undefined && (t.url || t.pendingUrl));
    return normalActive || allActive[0] || null;
  } catch {
    return null;
  }
}

async function getActiveTabInfo(): Promise<TabInfo | null> {
  const tab = await getActiveTab();
  if (!tab || tab.id === undefined) return null;

  const url = tab.url || tab.pendingUrl || '';
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

async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    return true;
  } catch {
    return false;
  }
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

    if (message.type === 'INJECT_CONTENT_SCRIPT') {
      ensureContentScriptInjected(message.tabId).then((injected) => {
        sendResponse({ success: injected });
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

    if (message.type === 'CAPTURE_TAB_CROPS') {
      const tab = _sender.tab;
      const windowId = tab?.windowId;
      cropVisibleTab(windowId, message.rois)
        .then((crops) => {
          sendResponse({ success: true, data: crops });
        })
        .catch((err: unknown) => {
          sendResponse({ success: false, error: (err as Error).message });
        });
      return true;
    }

    return false;
  }
);

interface TabCropRequest {
  roiId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Screenshot authority (Zone 2).
 * WHY: captureVisibleTab is the smallest Chrome API that can crop unresolved regions
 * when canvas/img drawImage is unavailable. Existing <all_urls> is sufficient — no new permission.
 * LIFECYCLE: Full capture exists only inside this function; only ROI RGBA leaves.
 * MUST NEVER: Log, persist, or forward the data URL.
 */
async function cropVisibleTab(
  windowId: number | undefined,
  rois: TabCropRequest[]
): Promise<Array<{ roiId: string; width: number; height: number; rgba: number[] }>> {
  const options: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' };
  const dataUrl =
    windowId === undefined
      ? await chrome.tabs.captureVisibleTab(options)
      : await chrome.tabs.captureVisibleTab(windowId, options);
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const crops: Array<{ roiId: string; width: number; height: number; rgba: number[] }> = [];
  try {
    for (const roi of rois) {
      const fitted = fitTabCrop(roi, bitmap.width, bitmap.height);
      if (!fitted) continue;
      const canvas = new OffscreenCanvas(fitted.width, fitted.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(bitmap, fitted.x, fitted.y, fitted.width, fitted.height, 0, 0, fitted.width, fitted.height);
      const image = ctx.getImageData(0, 0, fitted.width, fitted.height);
      crops.push({
        roiId: fitted.roiId,
        width: image.width,
        height: image.height,
        rgba: Array.from(image.data),
      });
    }
  } finally {
    bitmap.close();
  }
  return crops;
}

function fitTabCrop(
  roi: TabCropRequest,
  bitmapWidth: number,
  bitmapHeight: number
): TabCropRequest | null {
  const x = Math.max(0, Math.min(bitmapWidth - MIN_ROI_SIDE_PX, Math.round(roi.x)));
  const y = Math.max(0, Math.min(bitmapHeight - MIN_ROI_SIDE_PX, Math.round(roi.y)));
  let width = Math.min(MAX_ROI_WIDTH_PX, Math.max(0, Math.round(roi.width)), bitmapWidth - x);
  let height = Math.min(MAX_ROI_HEIGHT_PX, Math.max(0, Math.round(roi.height)), bitmapHeight - y);
  if (width < MIN_ROI_SIDE_PX || height < MIN_ROI_SIDE_PX) return null;
  if (width * height > MAX_ROI_PIXELS) {
    const scale = Math.sqrt(MAX_ROI_PIXELS / (width * height));
    width = Math.max(MIN_ROI_SIDE_PX, Math.floor(width * scale));
    height = Math.max(MIN_ROI_SIDE_PX, Math.floor(height * scale));
  }
  return { roiId: roi.roiId, x, y, width, height };
}
