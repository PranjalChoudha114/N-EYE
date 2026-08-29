import {
  type RawElement,
  type RawScene,
  type PrivacyFinding,
  type InputType,
  type PageEpoch,
  type BoundingBox,
  createTargetFingerprint,
  computeNeighborhoodHint,
  TOP_FRAME_ID,
} from '@n-eye/protocol';
import type { ElementRegistry } from './registry.js';
import { detectElementPrivacy } from '../privacy/detectors.js';
import { collectVisualRegions, collectClickableVisualSurfaces } from '../perception/visual-regions.js';
import { INTERACTIVE_SELECTOR } from './selectors.js';
import { discoverFrames, frameIdPrefix, provenanceOf, shiftBoxToTopViewport } from './frames.js';

/**
 * PageObserver (Zone 1 - Content Script Execution)
 * OWNS: Local DOM traversal, interactable element extraction, visibility filtering, and TargetFingerprint computation.
 * TRUST BOUNDARY: Executes in untrusted webpage context.
 * INVARIANT: NEVER reads raw passwords or input values. Output is marked `_isLocalOnly: true`.
 */
const MAX_LABEL_LENGTH = 120;

export function sanitizeText(text: string | null | undefined, maxLength = MAX_LABEL_LENGTH): string {
  if (!text) return '';
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
  if (el.hasAttribute('inert')) return false;

  if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'hidden') {
    return false;
  }

  const view = el.ownerDocument.defaultView || window;
  const style = view.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  if (style.pointerEvents === 'none') {
    return false;
  }

  if (el.tagName.toLowerCase() !== 'body' && style.position !== 'fixed' && el.offsetParent === null && style.display === 'none') {
    return false;
  }

  return true;
}

export function getSanitizedLabelCandidate(el: HTMLElement): string {
  const doc = el.ownerDocument;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.id) {
      try {
        const labelElem = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelElem && labelElem.textContent?.trim()) {
          return sanitizeText(labelElem.textContent);
        }
      } catch {
        // Fallback for special selector characters
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      return sanitizeText(parentLabel.textContent);
    }
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return sanitizeText(ariaLabel);
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const textParts = ids
      .map((id) => doc.getElementById(id)?.textContent?.trim() || '')
      .filter(Boolean);
    if (textParts.length > 0) {
      return sanitizeText(textParts.join(' '));
    }
  }

  const role = el.getAttribute('role') || el.tagName.toLowerCase();
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    role === 'button' ||
    role === 'link' ||
    role === 'tab' ||
    role === 'menuitem' ||
    role === 'switch' ||
    role === 'option'
  ) {
    if (el.textContent && el.textContent.trim()) {
      return sanitizeText(el.textContent);
    }
  }

  if ('placeholder' in el && typeof el.placeholder === 'string' && el.placeholder.trim()) {
    return sanitizeText(el.placeholder, 80);
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return sanitizeText(title, 80);
  }

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
    case 'search':
      return 'search';
    case 'textarea':
      return 'textarea';
    case 'select':
      return 'select';
    case 'file':
      return 'file';
    default:
      return 'other';
  }
}

/**
 * Offscreen-clipped observation policy (Zone 1).
 * WHY: `position:absolute; left:-9999px` is the classic channel for planting instruction text
 *      that a human never sees. N-Eye will not offer such a node as an action target.
 * SCOPE: Only nodes wholly left of or above the document origin are excluded. Below-the-fold
 *        and right-of-viewport controls remain observable because scrolling reaches them, and
 *        1px `clip`-style visually-hidden accessibility text keeps positive coordinates.
 */
export function isOffscreenClipped(bbox: BoundingBox, scrollX: number, scrollY: number): boolean {
  // Requires positive layout evidence. Environments without layout report a zero-size rect,
  // and treating "no geometry" as "offscreen" would hide every control.
  if (bbox.width <= 0 && bbox.height <= 0) return false;
  const docRight = bbox.x + scrollX + bbox.width;
  const docBottom = bbox.y + scrollY + bbox.height;
  return docRight <= 0 || docBottom <= 0;
}

/**
 * True when this control submits an owning form.
 * RISK: Structure, not label. A page can rename a submit button but cannot detach it from
 *       its form without also removing its submit behavior.
 */
export function isFormSubmitControl(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return (type === 'submit' || type === 'image') && el.form !== null;
  }
  if (el instanceof HTMLButtonElement) {
    return el.type.toLowerCase() === 'submit' && el.form !== null;
  }
  return false;
}

export function collectCandidates(root: Document | ShadowRoot): HTMLElement[] {
  const elements: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));

  const allNodes = root.querySelectorAll('*');
  for (const node of allNodes) {
    if (node.shadowRoot) {
      elements.push(...collectCandidates(node.shadowRoot));
    }
  }

  return elements;
}

export function isControlEnabled(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('fieldset[disabled]')) return false;
  return true;
}

export function computeElementNeighborhoodHint(el: HTMLElement): string {
  const parent = el.parentElement;
  const parentRole = parent?.getAttribute('role') || parent?.tagName.toLowerCase() || '';
  const siblingLabels: string[] = [];
  if (parent) {
    for (const sibling of parent.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
      if (sibling === el) continue;
      const label = getSanitizedLabelCandidate(sibling);
      if (label) siblingLabels.push(label);
      if (siblingLabels.length >= 8) break;
    }
  }
  return computeNeighborhoodHint(parentRole, siblingLabels);
}

function relativeBbox(
  rect: BoundingBox,
  viewWidth: number,
  viewHeight: number
): { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number } {
  return {
    xPercent: Math.max(0, Math.min(100, (rect.x / viewWidth) * 100)),
    yPercent: Math.max(0, Math.min(100, (rect.y / viewHeight) * 100)),
    widthPercent: Math.max(0, Math.min(100, (rect.width / viewWidth) * 100)),
    heightPercent: Math.max(0, Math.min(100, (rect.height / viewHeight) * 100)),
  };
}

function inputTypeOf(el: HTMLElement): InputType | null {
  if (el instanceof HTMLInputElement) return mapInputType(el.type);
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el.getAttribute('role') === 'textbox') return 'text';
  return null;
}

function materializeElement(
  el: HTMLElement,
  registry: ElementRegistry,
  epoch: PageEpoch,
  viewWidth: number,
  viewHeight: number,
  frameOffset: BoundingBox,
  frameIdPrefixValue: string,
  frameProvenance: RawElement['frameProvenance']
): RawElement | null {
  if (!isElementVisible(el)) return null;

  const rect = el.getBoundingClientRect();
  const bbox = shiftBoxToTopViewport(
    { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    frameOffset
  );

  const view = el.ownerDocument.defaultView;
  if (isOffscreenClipped(bbox, view?.scrollX ?? 0, view?.scrollY ?? 0)) {
    return null;
  }

  const inputType = inputTypeOf(el);
  const normalizedLabelCandidate = getSanitizedLabelCandidate(el);
  const role = el.getAttribute('role') || el.tagName.toLowerCase();
  const tagName = el.tagName.toLowerCase();
  const relBbox = relativeBbox(bbox, viewWidth, viewHeight);
  const fingerprint = createTargetFingerprint(
    role,
    tagName,
    inputType,
    normalizedLabelCandidate,
    relBbox,
    computeElementNeighborhoodHint(el)
  );

  const elemId = registry.register(el, epoch, fingerprint, {
    idPrefix: frameIdPrefixValue,
    frameId: frameProvenance?.frameId ?? TOP_FRAME_ID,
  });

  const isSelected =
    (el as HTMLInputElement).checked ||
    el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-checked') === 'true';

  return {
    id: elemId,
    tagName,
    role,
    ariaLabel: el.getAttribute('aria-label') ? sanitizeText(el.getAttribute('aria-label')) : null,
    innerTextCandidate: normalizedLabelCandidate || null,
    inputType,
    isEnabled: isControlEnabled(el),
    isSelected: isSelected ? true : undefined,
    bbox,
    fingerprint,
    frameProvenance,
    formSubmitting: isFormSubmitControl(el) ? true : undefined,
  };
}

/**
 * Observes the current DOM (top document + same-origin frames) and constructs a local RawScene.
 * Cross-origin frames are recorded as inaccessible — never fabricated into clickable targets.
 *
 * PRIVACY INVARIANT:
 * No generic input values, passwords, OTPs, cookies, or raw iframe URLs are collected.
 */
export function observePage(registry: ElementRegistry, epoch: PageEpoch): RawScene {
  const startTime = performance.now();
  registry.clear();

  const rawElements: RawElement[] = [];
  const privacyFindings: PrivacyFinding[] = [];
  const viewWidth = Math.max(window.innerWidth || 1, 1);
  const viewHeight = Math.max(window.innerHeight || 1, 1);
  const frames = discoverFrames(document);
  const inaccessibleFrames = frames
    .filter((frame) => frame.frameKind === 'inaccessible')
    .map((frame) => ({
      frameId: frame.frameId,
      reason: (frame.reason || 'cross-origin') as 'cross-origin' | 'sandbox' | 'detached',
    }));

  for (const frame of frames) {
    if (!frame.document || frame.frameKind === 'inaccessible') continue;
    const provenance = provenanceOf(frame);
    const prefix = frameIdPrefix(frame.frameId);
    for (const el of collectCandidates(frame.document)) {
      const rawEl = materializeElement(
        el,
        registry,
        epoch,
        viewWidth,
        viewHeight,
        frame.offset,
        prefix,
        provenance
      );
      if (!rawEl) continue;
      rawElements.push(rawEl);
      privacyFindings.push(...detectElementPrivacy(rawEl));
    }
  }

  const topFrame = frames[0];
  if (!topFrame) {
    throw new Error('Frame discovery must always include the top document.');
  }
  const topProvenance = provenanceOf(topFrame);
  for (const surface of collectClickableVisualSurfaces()) {
    const already = rawElements.some((el) => registry.get(el.id)?.liveNode === surface);
    if (already) continue;
    const rawEl = materializeElement(
      surface,
      registry,
      epoch,
      viewWidth,
      viewHeight,
      { x: 0, y: 0, width: 0, height: 0 },
      'e',
      topProvenance
    );
    if (!rawEl) continue;
    rawEl.perceptionSource = 'DOM';
    rawElements.push(rawEl);
  }

  const visualRegions = collectVisualRegions(epoch);
  for (const region of visualRegions) {
    region.frameId = TOP_FRAME_ID;
    const associated = rawElements.find(
      (el) => Math.abs(el.bbox.x - region.bbox.x) < 4 && Math.abs(el.bbox.y - region.bbox.y) < 4
    );
    if (associated) {
      region.associatedElementId = associated.id;
    }
  }

  const durationMs = performance.now() - startTime;

  return {
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
    visualRegions,
    inaccessibleFrames: inaccessibleFrames.length > 0 ? inaccessibleFrames : undefined,
  };
}
