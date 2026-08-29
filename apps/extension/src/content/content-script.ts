import {
  type ExtensionMessage,
  type ExtensionResponse,
  type RoiSpec,
} from '@n-eye/protocol';
import { ElementRegistry } from './registry.js';
import { PageEpochManager } from './epoch.js';
import { observePage } from './observer.js';
import { executeValidatedAction } from '../execution/executor.js';
import { captureRoisInPage, discardWireRois, type CapturedRoiWire } from '../perception/capture.js';

const registry = new ElementRegistry();
const epochManager = new PageEpochManager(60, (_newEpoch) => {
  // PageEpoch incremented on DOM mutation
});

// Content script message listener
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    if (message.type === 'PING') {
      sendResponse({
        success: true,
        data: {
          pong: true,
          url: window.location.href,
          origin: window.location.origin,
          epoch: epochManager.getEpoch(),
          registeredElements: registry.size(),
        },
      });
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
);
