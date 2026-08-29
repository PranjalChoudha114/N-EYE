import {
  CONTENT_SCRIPT_PROTOCOL,
  type ContentScriptHello,
  type ExtensionMessage,
  type ExtensionResponse,
  type RoiSpec,
} from '@n-eye/protocol';
import { ElementRegistry } from './registry.js';
import { PageEpochManager } from './epoch.js';
import { observePage } from './observer.js';
import { executeValidatedAction } from '../execution/executor.js';
import { captureRoisInPage, discardWireRois, type CapturedRoiWire } from '../perception/capture.js';
import { isNeyeOverlayMessage, type NEyeOverlayMessage } from '../runtime/ui-messages.js';
import { applyOverlayState, toggleOverlay, unmountOverlay } from '../overlay/overlay-host.js';

const BOOT_KEY = '__N_EYE_CONTENT_BOOT__';

interface ContentBoot {
  contentProtocol: number;
  pingAlive: () => boolean;
  handleMessage: (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => boolean;
}

function bootSlot(): { get(): ContentBoot | undefined; set(boot: ContentBoot): void } {
  const holder = window as unknown as Record<string, ContentBoot | undefined>;
  return {
    get: () => holder[BOOT_KEY],
    set: (boot) => {
      holder[BOOT_KEY] = boot;
    },
  };
}

const registry = new ElementRegistry();
const epochManager = new PageEpochManager(60, (_newEpoch) => {
  // PageEpoch incremented on DOM mutation
});

function pingAlive(): boolean {
  // WHY: After extension Reload the previous closure's chrome.runtime throws.
  return Boolean(chrome.runtime?.id);
}

function handleMessage(
  message: ExtensionMessage | NEyeOverlayMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtensionResponse) => void
): boolean {
  if (isNeyeOverlayMessage(message)) {
    if (message.type === 'N_EYE_TOGGLE_OVERLAY') {
      const open = toggleOverlay();
      sendResponse({ success: true, data: { open } });
      return true;
    }
    if (message.type === 'N_EYE_UNMOUNT_OVERLAY') {
      unmountOverlay();
      sendResponse({ success: true });
      return true;
    }
    if (message.type === 'N_EYE_OVERLAY_STATE') {
      applyOverlayState(message.state, message.themePref);
      sendResponse({ success: true });
      return true;
    }
    return false;
  }

  if (message.type === 'PING') {
    const hello: ContentScriptHello = {
      pong: true,
      ready: true,
      contentProtocol: CONTENT_SCRIPT_PROTOCOL,
      url: window.location.href,
      origin: window.location.origin,
      epoch: epochManager.getEpoch(),
      registeredElements: registry.size(),
    };
    sendResponse({ success: true, data: hello });
    return true;
  }

  if (message.type === 'OBSERVE_REQUEST') {
    try {
      const scene = observePage(registry, epochManager.getEpoch());
      sendResponse({ success: true, data: scene });
    } catch (err) {
      sendResponse({ success: false, error: (err as Error).message });
    }
    return true;
  }

  if (message.type === 'CAPTURE_ROIS_REQUEST') {
    const specs: RoiSpec[] = message.rois.map((roi) => ({
      roiId: roi.roiId,
      bbox: { x: roi.x, y: roi.y, width: roi.width, height: roi.height },
      source: 'IMAGE_TEXT',
      pageEpoch: epochManager.getEpoch(),
      origin: window.location.origin,
      widthPx: roi.width,
      heightPx: roi.height,
      pixelCount: roi.width * roi.height,
      lifetimeMs: 15_000,
    }));
    void captureRoisInPage(specs)
      .then(async (local) => {
        const missing = specs.filter((spec) => !local.some((wire) => wire.roiId === spec.roiId));
        let merged: CapturedRoiWire[] = local;
        if (missing.length > 0) {
          try {
            const tabCrops: ExtensionResponse<CapturedRoiWire[]> = await chrome.runtime.sendMessage({
              type: 'CAPTURE_TAB_CROPS',
              rois: missing.map((spec) => ({
                roiId: spec.roiId,
                x: spec.bbox.x,
                y: spec.bbox.y,
                width: spec.bbox.width,
                height: spec.bbox.height,
              })),
              viewport: { width: window.innerWidth, height: window.innerHeight },
            });
            if (tabCrops.success && tabCrops.data) {
              merged = [...local, ...tabCrops.data];
            }
          } catch {
            // Capture unavailable — return whatever local crops exist.
          }
        }
        sendResponse({ success: true, data: merged });
        discardWireRois(merged);
      })
      .catch((err: unknown) => {
        sendResponse({ success: false, error: (err as Error).message });
      });
    return true;
  }

  if (message.type === 'EXECUTE_ACTION_REQUEST') {
    try {
      const result = executeValidatedAction(message.action, registry);
      if (result.success) {
        sendResponse({ success: true, data: result });
      } else {
        sendResponse({ success: false, error: result.error });
      }
    } catch (err) {
      sendResponse({ success: false, error: (err as Error).message });
    }
    return true;
  }

  return false;
}

/**
 * Content script bootstrap (Zone 1).
 * WHY: Programmatic re-inject after extension Reload must install a live listener.
 * Duplicate executeScript on a still-valid generation must not stack extra listeners.
 */
function installContentScript(): void {
  const slot = bootSlot();
  const previous = slot.get();
  const boot: ContentBoot = {
    contentProtocol: CONTENT_SCRIPT_PROTOCOL,
    pingAlive,
    handleMessage,
  };
  slot.set(boot);

  let addListener = true;
  if (previous) {
    try {
      if (previous.pingAlive()) {
        addListener = false;
      }
    } catch {
      addListener = true;
    }
  }

  if (addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const current = bootSlot().get();
      if (!current) return false;
      return current.handleMessage(message, sender, sendResponse);
    });
  }
}

installContentScript();
