import {
  type RawElement,
  type RawScene,
  type PrivacyFinding,
  type InputType,
  type PageEpoch,
  createTargetFingerprint,
} from '@n-eye/protocol';
import type { ElementRegistry } from './registry.js';

const MAX_LABEL_LENGTH = 120;

export function sanitizeText(text: string | null | undefined, maxLength = MAX_LABEL_LENGTH): string {
  if (!text) return '';
  // Collapse whitespace, remove control chars, and truncate
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  // Explicitly ignore hidden inputs
  if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'hidden') {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  // Check offsetParent (returns null if element or any ancestor is display:none, except for body/fixed)
  if (el.tagName.toLowerCase() !== 'body' && style.position !== 'fixed' && el.offsetParent === null && style.display === 'none') {
    return false;
  }

  return true;
}

export function getSanitizedLabelCandidate(el: HTMLElement): string {
  // 1. Associated <label for="..."> or enclosing <label>
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.id) {
      const labelElem = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelElem && labelElem.textContent?.trim()) {
        return sanitizeText(labelElem.textContent);
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      return sanitizeText(parentLabel.textContent);
    }
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return sanitizeText(ariaLabel);
  }

  // 3. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const textParts = ids
      .map((id) => document.getElementById(id)?.textContent?.trim() || '')
      .filter(Boolean);
    if (textParts.length > 0) {
      return sanitizeText(textParts.join(' '));
    }
  }

  // 4. Inner text for buttons, anchors, and interactive roles
  const role = el.getAttribute('role') || el.tagName.toLowerCase();
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    role === 'button' ||
    role === 'link' ||
    role === 'tab' ||
    role === 'menuitem'
  ) {
    if (el.textContent && el.textContent.trim()) {
      return sanitizeText(el.textContent);
    }
  }

  // 5. Placeholder
  if ('placeholder' in el && typeof el.placeholder === 'string' && el.placeholder.trim()) {
    return sanitizeText(el.placeholder, 80);
  }

  // 6. Title attribute
  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return sanitizeText(title, 80);
  }

  // 7. Name attribute
  const name = el.getAttribute('name');
  if (name && name.trim()) {
    return sanitizeText(name, 60);
  }

  return '';
}

export function mapInputType(typeStr: string): InputType {
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

/**
 * Observes the current DOM and constructs a sanitized local RawScene.
 * Populates the ElementRegistry with opaque IDs and TargetFingerprints.
 *
 * PRIVACY INVARIANT:
 * No generic input values, passwords, OTPs, or cookies are collected.
 */
export function observePage(registry: ElementRegistry, epoch: PageEpoch): RawScene {
  const startTime = performance.now();
  registry.clear();

  const rawElements: RawElement[] = [];
  const privacyFindings: PrivacyFinding[] = [];

  const candidates = document.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="radio"], [role="menuitem"]'
  );

  const viewWidth = Math.max(window.innerWidth || 1, 1);
  const viewHeight = Math.max(window.innerHeight || 1, 1);

  for (const el of candidates) {
    if (!isElementVisible(el)) {
      continue;
    }

    const rect = el.getBoundingClientRect();
    const isInput = el instanceof HTMLInputElement;
    const inputType = isInput ? mapInputType(el.type) : null;
    const isEnabled = !(el as HTMLButtonElement).disabled;
    const isSelected =
      (el as HTMLInputElement).checked ||
      el.getAttribute('aria-selected') === 'true' ||
      el.getAttribute('aria-checked') === 'true';

    const labelCandidate = getSanitizedLabelCandidate(el);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const tagName = el.tagName.toLowerCase();

    // Relative Bounding Box (0-100 percentage of viewport)
    const relBbox = {
      xPercent: Math.max(0, Math.min(100, (rect.x / viewWidth) * 100)),
      yPercent: Math.max(0, Math.min(100, (rect.y / viewHeight) * 100)),
      widthPercent: Math.max(0, Math.min(100, (rect.width / viewWidth) * 100)),
      heightPercent: Math.max(0, Math.min(100, (rect.height / viewHeight) * 100)),
    };

    const fingerprint = createTargetFingerprint(
      role,
      tagName,
      inputType,
      labelCandidate,
      relBbox
    );

    // Register with opaque ID e.g. e1, e2...
    const elemId = registry.register(el, epoch, fingerprint);

    rawElements.push({
      id: elemId,
      tagName,
      role,
      ariaLabel: el.getAttribute('aria-label') ? sanitizeText(el.getAttribute('aria-label')) : null,
      innerTextCandidate: labelCandidate || null,
      inputType,
      isEnabled,
      isSelected: isSelected ? true : undefined,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      fingerprint,
    });

    // Detect browser semantic privacy classes
    if (inputType === 'password') {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'SECRET_AUTH',
        confidence: 1.0,
        source: 'browser_input_type',
        reason: 'Input type is password',
      });
    } else if (inputType === 'email' || labelCandidate.toLowerCase().includes('email')) {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'PII_DIRECT',
        confidence: 0.9,
        source: 'browser_input_type',
        reason: 'Input has type=email or email label candidate',
      });
    } else if (inputType === 'tel' || labelCandidate.toLowerCase().includes('phone')) {
      privacyFindings.push({
        elementId: elemId,
        privacyClass: 'PII_DIRECT',
        confidence: 0.9,
        source: 'browser_input_type',
        reason: 'Input has type=tel or phone label candidate',
      });
    }
  }

  const durationMs = performance.now() - startTime;

  const rawScene: RawScene = {
    _isLocalOnly: true,
    pageEpoch: epoch,
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
    observationDurationMs: Math.round(durationMs * 100) / 100,
  };

  return rawScene;
}
