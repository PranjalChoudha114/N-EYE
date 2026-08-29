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
import { mapCssBoxToBitmap } from '../perception/coordinates.js';
import { classifySupportedUrl } from '../runtime/supported-url.js';
import type { ProductState } from '../runtime/ui-snapshot.js';
import { markSessionInterrupted } from '../runtime/ui-snapshot.js';
import { isNeyeOverlayMessage, type NEyeOverlayMessage, type NEyeUiCommand } from '../runtime/ui-messages.js';
import { classifyOwnerPort, isSameExtensionSender, overlayConfirmPermitted, resolveInjectTarget } from '../runtime/message-trust.js';
import type { ThemePref } from '../ui/theme.js';

/**
 * N-Eye Service Worker (Zone 2 - Extension Core)
 * OWNS: MV3 lifecycle, tab tracking, overlay toggle, Side Panel owner bus.
 * TRUST BOUNDARY: Privileged background context. Never accesses raw DOM or vault values.
 * UI: Toolbar click toggles the page overlay. The Side Panel owns the trust loop.
 */
let currentTaskState: TaskState = {
  taskId: createTaskId('task-active'),
  goal: '',
  status: 'IDLE',
};

let ownerPort: chrome.runtime.Port | null = null;
let lastUiState: ProductState | null = null;
let themePref: ThemePref = 'dark';
let pendingCommands: NEyeUiCommand[] = [];

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((_err) => {});

chrome.action.onClicked.addListener((tab) => {
  void toggleOverlay(tab);
});

async function toggleOverlay(tab?: chrome.tabs.Tab): Promise<void> {
  const target = tab?.id !== undefined ? tab : await getActiveTab();
  if (!target?.id) return;
  const delivered = await sendToTab(target.id, { type: 'N_EYE_TOGGLE_OVERLAY' });
  if (!delivered) {
    const injected = await ensureContentScriptInjected(target.id);
    if (!injected) return;
    await sendToTab(target.id, { type: 'N_EYE_TOGGLE_OVERLAY' });
  }
  if (lastUiState) {
    await sendToTab(target.id, { type: 'N_EYE_OVERLAY_STATE', state: lastUiState, themePref });
  }
}

async function sendToTab(tabId: number, message: NEyeOverlayMessage): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

async function openSidePanel(tabId: number, windowId?: number): Promise<void> {
  try {
    if (windowId !== undefined) {
      await chrome.sidePanel.open({ tabId, windowId });
    } else {
      await chrome.sidePanel.open({ tabId });
    }
  } catch {
    // Chrome may require a user gesture; toolbar click already opened the overlay.
  }
}

async function broadcastOverlayState(state: ProductState): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await sendToTab(tab.id, { type: 'N_EYE_OVERLAY_STATE', state, themePref });
}

function extensionOrigin(): string {
  try {
    return new URL(chrome.runtime.getURL('')).origin;
  } catch {
    return `chrome-extension://${chrome.runtime.id}`;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'n-eye-owner') return;
  // TRUST: the owner port carries confirmation commands. Only an extension-served document may
  // claim it, so a page-adjacent content script cannot take over the session.
  const verdict = classifyOwnerPort(port.sender, chrome.runtime.id, extensionOrigin());
  if (!verdict.ok) {
    try {
      port.disconnect();
    } catch {
      // Port already gone.
    }
    return;
  }
  ownerPort = port;
  void getActiveTabInfo().then((tabInfo) => {
    port.postMessage({ type: 'UI_HELLO', tabInfo, state: lastUiState, themePref });
    if (pendingCommands.length > 0) {
      for (const command of pendingCommands) port.postMessage(command);
      pendingCommands = [];
    }
  });
  port.onMessage.addListener((msg: { type?: string; state?: ProductState; pref?: ThemePref }) => {
    if (msg.type === 'UI_STATE' && msg.state) {
      lastUiState = msg.state;
      void broadcastOverlayState(msg.state);
    }
    if (msg.type === 'UI_THEME' && msg.pref) {
      themePref = msg.pref;
    }
  });
  port.onDisconnect.addListener(() => {
    if (port !== ownerPort) return;
    ownerPort = null;
    if (!lastUiState?.running) return;
    lastUiState = markSessionInterrupted(
      lastUiState,
      'The N-Eye Trust Center closed. The in-flight task was stopped.'
    );
    void broadcastOverlayState(lastUiState);
  });
});

function isSupportedUrl(url?: string): { isSupported: boolean; reason?: string } {
  return classifySupportedUrl(url);
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
      // Product UI may be closed.
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

async function handleOverlayBus(message: NEyeOverlayMessage, sender: chrome.runtime.MessageSender): Promise<void> {
  if (message.type !== 'N_EYE_UI_COMMAND') return;

  if (message.command === 'closeOverlay') return;

  if (message.command === 'setTheme') {
    themePref = message.pref;
    ownerPort?.postMessage(message);
    return;
  }

  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;

  if (message.command === 'openPanel') {
    if (tabId !== undefined) {
      await openSidePanel(tabId, windowId);
      await sendToTab(tabId, { type: 'N_EYE_UNMOUNT_OVERLAY' });
    }
    return;
  }

  if (message.command === 'confirm' && !overlayConfirmPermitted(sender, message.confirmationId)) {
    return;
  }

  if (!ownerPort && message.command === 'run' && tabId !== undefined) {
    await openSidePanel(tabId, windowId);
  }
  if (ownerPort) {
    ownerPort.postMessage(message);
    return;
  }
  pendingCommands.push(message);
}

// Central message router
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage | NEyeOverlayMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    // TRUST: reject anything that is not this extension. Another extension or an unexpected
    // context must not be able to drive tab discovery, injection, or the owner bus.
    if (!isSameExtensionSender(sender, chrome.runtime.id)) {
      sendResponse({ success: false, error: 'Rejected: untrusted message sender.' });
      return true;
    }

    if (isNeyeOverlayMessage(message)) {
      void handleOverlayBus(message, sender).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

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
      // A requested tabId is not authority. A content script may only re-inject its own tab, and
      // the owner UI may only inject the tab it is already bound to.
      getActiveTab()
        .then(async (activeTab) => {
          const targetTabId = resolveInjectTarget(sender, message.tabId, activeTab?.id);
          if (targetTabId === null) {
            sendResponse({ success: false, error: 'Rejected: injection target is not permitted for this sender.' });
            return;
          }
          const injected = await ensureContentScriptInjected(targetTabId);
          sendResponse({ success: injected });
        })
        .catch((err) => {
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
      // Screenshot authority belongs to the observed tab's own content script. An extension page
      // must not be able to ask for a capture of whatever tab happens to be focused.
      const tab = sender.tab;
      if (tab?.id === undefined) {
        sendResponse({ success: false, error: 'Rejected: crop requests must originate from the observed tab.' });
        return true;
      }
      const windowId = tab.windowId;
      cropVisibleTab(windowId, message.rois, message.viewport)
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
  rois: TabCropRequest[],
  viewport?: { width: number; height: number }
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
      const mapped = viewport
        ? mapCssBoxToBitmap(
            { x: roi.x, y: roi.y, width: roi.width, height: roi.height },
            viewport,
            { width: bitmap.width, height: bitmap.height }
          )
        : { x: roi.x, y: roi.y, width: roi.width, height: roi.height };
      if (!mapped) continue;
      const fitted = fitTabCrop({ ...roi, ...mapped }, bitmap.width, bitmap.height);
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
