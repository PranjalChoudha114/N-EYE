import {
  type ExtensionMessage,
  type ExtensionResponse,
  type RawElement,
  type RawScene,
  type PrivacyFinding,
  type InputType,
  createElementId,
  createPageEpoch,
} from '@n-eye/protocol';

let pageEpochCounter = 1;
const liveElementRegistry = new Map<string, HTMLElement>();

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }
  // Check if inside viewport or scrollable region
  return true;
}

function getSanitizedLabelCandidate(el: HTMLElement): string {
  // Check aria-label first
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  // Check labeled-by
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElem = document.getElementById(labelledBy);
    if (labelElem && labelElem.textContent?.trim()) {
      return labelElem.textContent.trim();
    }
  }

  // Associated <label> for inputs
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label && label.textContent?.trim()) {
        return label.textContent.trim();
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      return parentLabel.textContent.trim();
    }
    if ('placeholder' in el && typeof el.placeholder === 'string' && el.placeholder.trim()) {
      return el.placeholder.trim();
    }
  }

  // Button or anchor text
  if (el.textContent && el.textContent.trim()) {
    return el.textContent.trim().slice(0, 100);
  }

  return el.getAttribute('title') || el.getAttribute('name') || '';
}

function mapInputType(typeStr: string): InputType {
  const normalized = typeStr.toLowerCase();
  switch (normalized) {
    case 'text':
      return 'text';
    case 'email':
      return 'email';
    case 'password':
      return 'password';
    case 'tel':
      return 'tel';
    case 'number':
      return 'number';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'submit':
      return 'submit';
    case 'button':
      return 'button';
    default:
      return 'other';
  }
}

export function observeVisibleElements(): RawScene {
  liveElementRegistry.clear();
  const rawElements: RawElement[] = [];
  const privacyFindings: PrivacyFinding[] = [];

  const candidates = document.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="tab"]'
  );

  let idCounter = 1;

  for (const el of candidates) {
    if (!isElementVisible(el)) {
      continue;
    }

    const elemIdStr = `e${idCounter++}`;
    const elemId = createElementId(elemIdStr);
    liveElementRegistry.set(elemIdStr, el);

    const rect = el.getBoundingClientRect();
    const isInput = el instanceof HTMLInputElement;
    const inputType = isInput ? mapInputType(el.type) : null;
    const isEnabled = !(el as HTMLButtonElement).disabled;
    const label = getSanitizedLabelCandidate(el);

    // CRITICAL PRIVACY RULE: Never collect raw values from password fields or hidden inputs
    const innerTextCandidate = inputType === 'password' ? null : (el.textContent?.trim() || null);

    rawElements.push({
      id: elemId,
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label'),
      innerTextCandidate: label || innerTextCandidate,
      inputType,
      isEnabled,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });

    // Detect browser semantic privacy classes
    if (inputType === 'password') {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'SECRET_AUTH',
        confidence: 1.0,
        source: 'browser_input_type',
        reason: 'Input has type=password',
      });
    } else if (inputType === 'email' || label.toLowerCase().includes('email')) {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'PII_DIRECT',
        confidence: 0.9,
        source: 'browser_input_type',
        reason: 'Input has type=email or email label',
      });
    } else if (inputType === 'tel' || label.toLowerCase().includes('phone')) {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'PII_DIRECT',
        confidence: 0.9,
        source: 'browser_input_type',
        reason: 'Input has type=tel or phone label',
      });
    }
  }

  const rawScene: RawScene = {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(pageEpochCounter),
    url: window.location.href,
    origin: window.location.origin,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    elements: rawElements,
    privacyFindings,
    timestamp: Date.now(),
  };

  return rawScene;
}

// Invalidate page epoch on significant DOM mutation
const mutationObserver = new MutationObserver(() => {
  pageEpochCounter++;
});

mutationObserver.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});

// Content script message listener
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    if (message.type === 'PING') {
      sendResponse({ success: true, data: { pong: true, url: window.location.href } });
      return true;
    }

    if (message.type === 'OBSERVE_REQUEST') {
      try {
        const scene = observeVisibleElements();
        sendResponse({ success: true, data: scene });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
      return true;
    }

    return false;
  }
);

console.log('[N-Eye Content] Script injected and active on:', window.location.href);
