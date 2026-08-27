import {
  type ExtensionMessage,
  type ExtensionResponse,
} from '@n-eye/protocol';
import { ElementRegistry } from './registry.js';
import { PageEpochManager } from './epoch.js';
import { observePage } from './observer.js';

const registry = new ElementRegistry();
const epochManager = new PageEpochManager(60, (newEpoch) => {
  console.log('[N-Eye Content] PageEpoch incremented to:', newEpoch);
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
        console.error('[N-Eye Content] Observation failed:', err);
        sendResponse({ success: false, error: (err as Error).message });
      }
      return true;
    }

    return false;
  }
);

console.log('[N-Eye Content] Active-web observer active on:', window.location.href);
