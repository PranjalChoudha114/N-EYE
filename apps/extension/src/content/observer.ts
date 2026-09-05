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
import { INTERACTIVE_SELECTOR, POPUP_OWNED_SELECTOR } from './selectors.js';
import { discoverFrames, frameIdPrefix, provenanceOf, shiftBoxToTopViewport } from './frames.js';

/**
 * PageObserver (Zone 1 - Content Script Execution)
 * OWNS: Local DOM traversal, interactable element extraction, visibility filtering, and TargetFingerprint computation.
 * TRUST BOUNDARY: Executes in untrusted webpage context.
 * INVARIANT: NEVER copies raw passwords or input values into RawScene. Presence (hasValue) is a boolean only.
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

/**
 * Visible text for semantic identity.
 * WHY: textContent includes hidden descendants, which can impersonate a control's meaning.
 */
export function visibleControlText(el: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) parts.push(text);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return;
    const attrStyle = node.getAttribute('style') || '';
    if (/\bdisplay\s*:\s*none\b/i.test(attrStyle) || /\bvisibility\s*:\s*hidden\b/i.test(attrStyle)) return;
    try {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return;
    } catch {
      // Computed style unavailable in some test roots.
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(el);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function textExcludingNode(root: Node, exclude: Node): string {
  if (root === exclude) return '';
  if (root.nodeType === Node.TEXT_NODE) {
    return root.textContent || '';
  }
  let out = '';
  for (const child of Array.from(root.childNodes)) {
    if (child === exclude) continue;
    if (child instanceof Element && child.contains(exclude)) {
      out += textExcludingNode(child, exclude);
    } else {
      out += child.textContent || '';
    }
  }
  return out;
}

function nativeHostAccessibleName(el: HTMLElement): string {
  const doc = el.ownerDocument;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.id) {
      try {
        const labelElem = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelElem instanceof HTMLElement) {
          const text = sanitizeText(textExcludingNode(labelElem, el) || labelElem.textContent);
          if (text) return text;
        }
      } catch {
        // Fallback for special selector characters
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel instanceof HTMLElement) {
      const text = sanitizeText(textExcludingNode(parentLabel, el) || parentLabel.textContent);
      if (text) return text;
    }
  }
  return '';
}

function labelledByAccessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (!labelledBy) return '';
  const doc = el.ownerDocument;
  const textParts = labelledBy
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean);
  return textParts.length > 0 ? sanitizeText(textParts.join(' ')) : '';
}

/**
 * Accessible name (W3C AccName order, HTML subset).
 * WHY: Selenium "Text input" comes from label[for], not the DOM id or input type.
 * MUST NOT: Concatenate nearby headings or use name= as identity.
 */
export function getSanitizedLabelCandidate(el: HTMLElement): string {
  const byRef = labelledByAccessibleName(el);
  if (byRef) return byRef;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return sanitizeText(ariaLabel);
  }

  const native = nativeHostAccessibleName(el);
  if (native) return native;

  const role = el.getAttribute('role') || el.tagName.toLowerCase();
  if (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    role === 'button' ||
    role === 'link' ||
    role === 'tab' ||
    role === 'menuitem' ||
    role === 'switch' ||
    role === 'option' ||
    role === 'treeitem'
  ) {
    const visible = visibleControlText(el);
    if (visible) {
      return sanitizeText(visible);
    }
  }

  const svgName = svgAccessibleName(el);
  if (svgName) {
    return svgName;
  }

  if ('placeholder' in el && typeof el.placeholder === 'string' && el.placeholder.trim()) {
    return sanitizeText(el.placeholder, 80);
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return sanitizeText(title, 80);
  }

  // MUST NOT: HTML name= is not AccName and pollutes "text"/"input" ranking.
  return '';
}

/**
 * Task-relevant role. Author ARIA wins; otherwise HTML host language.
 * WHY: TYPE must filter by textbox, not because tagName "input" overlapped the word "input".
 */
export function normalizeControlRole(el: HTMLElement, inputType: InputType | null): string {
  const explicit = (el.getAttribute('role') || '').trim();
  if (explicit) return explicit;
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLSelectElement) return 'combobox';
  if (el instanceof HTMLAnchorElement) return 'link';
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLInputElement) {
    if (inputType === 'search') return 'searchbox';
    if (inputType === 'checkbox') return 'checkbox';
    if (inputType === 'radio') return 'radio';
    if (inputType === 'submit' || inputType === 'button' || inputType === 'file') return 'button';
    if (
      inputType === 'password' ||
      inputType === 'text' ||
      inputType === 'email' ||
      inputType === 'tel' ||
      inputType === 'number'
    ) {
      return 'textbox';
    }
    return 'textbox';
  }
  if (el.isContentEditable) return 'textbox';
  return el.tagName.toLowerCase();
}

/** Whether a value is present. NEVER copies the value (passwords stay out of RawScene). */
export function controlHasValue(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.type === 'file') return el.files !== null && el.files.length > 0;
    return el.value.length > 0;
  }
  if (el instanceof HTMLTextAreaElement) return el.value.length > 0;
  if (el instanceof HTMLSelectElement) return el.value.length > 0;
  return false;
}

/**
 * Accessible name from a descendant SVG title/aria-label when the control has no visible text.
 * WHY: Icon-only buttons often expose meaning only on the SVG, not as button text.
 * TRUST: Still untrusted page text. Hidden SVG titles are ignored.
 */
export function svgAccessibleName(el: HTMLElement): string {
  const svg =
    typeof SVGElement !== 'undefined' && el instanceof SVGElement
      ? el
      : el.querySelector('svg');
  if (!svg) return '';
  if (svg instanceof HTMLElement && !isElementVisible(svg)) return '';
  if (svg.getAttribute('aria-hidden') === 'true' || svg.hasAttribute('hidden')) return '';
  const svgAria = svg.getAttribute('aria-label');
  if (svgAria && svgAria.trim()) return sanitizeText(svgAria, 80);
  const titled = svg.querySelector('title');
  const titleText = titled?.textContent?.trim();
  if (titleText) return sanitizeText(titleText, 80);
  return '';
}

const REGION_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], legend, figcaption';
const SEMANTIC_REGION_TAGS = new Set(['section', 'article', 'form', 'fieldset', 'aside', 'nav']);
const SEMANTIC_REGION_ROLES = new Set(['region', 'group', 'search', 'form', 'article']);

function headingVisibleText(node: HTMLElement): string {
  if (!isElementVisible(node)) return '';
  return sanitizeText(visibleControlText(node) || node.textContent, 80);
}

function labelledRegionName(container: HTMLElement): string {
  const labelledBy = container.getAttribute('aria-labelledby');
  if (labelledBy) {
    const doc = container.ownerDocument;
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => {
        const ref = doc.getElementById(id);
        return ref instanceof HTMLElement ? headingVisibleText(ref) : '';
      })
      .filter(Boolean);
    if (parts.length > 0) return sanitizeText(parts.join(' '), 80);
  }
  const ariaLabel = container.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return sanitizeText(ariaLabel, 80);
  return '';
}

function headingBeforeTarget(container: HTMLElement, target: HTMLElement): string {
  let last = '';
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === target || child.contains(target)) {
      return last;
    }
    if (child.matches(REGION_HEADING_SELECTOR)) {
      const text = headingVisibleText(child);
      if (text) last = text;
      continue;
    }
    if (child.matches(INTERACTIVE_SELECTOR)) continue;
    for (const grand of Array.from(child.children)) {
      if (!(grand instanceof HTMLElement)) continue;
      if (grand.matches(REGION_HEADING_SELECTOR)) {
        const text = headingVisibleText(grand);
        if (text) last = text;
      }
    }
  }
  return last;
}

function parentForRegion(el: HTMLElement): HTMLElement | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host;
  }
  return null;
}

function isDocumentRoot(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'html' || tag === 'body' || el === el.ownerDocument.documentElement;
}

/**
 * Nearest meaningful region heading for a control.
 * WHY: Goals name regions ("Dynamic ID Button") while the actionable child is generic ("Click me").
 * MUST NOT: Concatenate whole-page text or fold this string into fingerprint identity.
 */
export function nearestRegionHeading(el: HTMLElement): string {
  let current: HTMLElement | null = parentForRegion(el);
  let hops = 0;
  while (current && hops < 8) {
    if (!isDocumentRoot(current)) {
      const tag = current.tagName.toLowerCase();
      const role = (current.getAttribute('role') || '').toLowerCase();
      if (SEMANTIC_REGION_TAGS.has(tag) || SEMANTIC_REGION_ROLES.has(role)) {
        const labelled = labelledRegionName(current);
        if (labelled) return labelled;
        const preceding = headingBeforeTarget(current, el);
        // WHY: Do not walk past a form/section to inherit a later sibling heading.
        return preceding;
      }
      const preceding = headingBeforeTarget(current, el);
      if (preceding) return preceding;
      let sib: Element | null = current.previousElementSibling;
      let sibHops = 0;
      while (sib && sibHops < 4) {
        if (sib instanceof HTMLElement && sib.matches(REGION_HEADING_SELECTOR)) {
          const text = headingVisibleText(sib);
          if (text) return text;
        }
        sib = sib.previousElementSibling;
        sibHops += 1;
      }
    }
    current = parentForRegion(current);
    hops += 1;
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

const MAX_POPUP_OWNED = 24;

function resolvePopupId(root: Document | ShadowRoot, id: string): HTMLElement | null {
  if (!id) return null;
  if (root instanceof Document) {
    const byId = root.getElementById(id);
    return byId instanceof HTMLElement ? byId : null;
  }
  try {
    const local = root.querySelector(`#${CSS.escape(id)}`);
    return local instanceof HTMLElement ? local : null;
  } catch {
    return null;
  }
}

/**
 * Combobox/listbox ownership is browser evidence, not a site adapter.
 * WHY: Dynamic SEARCH_COMMIT often lives in a popup named by aria-controls, not the combobox itself.
 */
export function collectAriaOwnedPopupControls(root: Document | ShadowRoot, already: HTMLElement[]): HTMLElement[] {
  const seen = new Set(already);
  const extra: HTMLElement[] = [];
  const hosts = root.querySelectorAll<HTMLElement>('[aria-controls], [aria-owns]');
  for (const host of hosts) {
    const ids = `${host.getAttribute('aria-controls') || ''} ${host.getAttribute('aria-owns') || ''}`
      .split(/\s+/)
      .filter(Boolean);
    for (const id of ids) {
      const popup = resolvePopupId(root, id);
      if (!popup) continue;
      for (const node of popup.querySelectorAll<HTMLElement>(POPUP_OWNED_SELECTOR)) {
        if (seen.has(node)) continue;
        seen.add(node);
        extra.push(node);
        if (extra.length >= MAX_POPUP_OWNED) return extra;
      }
    }
  }
  return extra;
}

export function collectCandidates(root: Document | ShadowRoot): HTMLElement[] {
  const elements: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR));
  for (const owned of collectAriaOwnedPopupControls(root, elements)) {
    elements.push(owned);
  }

  const allNodes = root.querySelectorAll('*');
  for (const node of allNodes) {
    if (node.shadowRoot) {
      elements.push(...collectCandidates(node.shadowRoot));
    }
  }

  return elements;
}

function visualRegionOwnsElement(
  region: BoundingBox,
  el: BoundingBox
): boolean {
  const sameCorner = Math.abs(el.x - region.x) < 4 && Math.abs(el.y - region.y) < 4;
  if (sameCorner) return true;
  const x1 = Math.max(region.x, el.x);
  const y1 = Math.max(region.y, el.y);
  const x2 = Math.min(region.x + region.width, el.x + el.width);
  const y2 = Math.min(region.y + region.height, el.y + el.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const regionArea = Math.max(1, region.width * region.height);
  return inter / regionArea >= 0.8;
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

function nativeSelectOptionHint(el: HTMLSelectElement): string {
  // Local observation only. Option text is still untrusted page data and is sanitized
  // again before SafeContext. Never include selected values of password-like fields.
  const labels = Array.from(el.options)
    .slice(0, 8)
    .map((option) => sanitizeText(option.text || option.value, 24))
    .filter((label) => label.length > 0);
  if (labels.length === 0) return '';
  return ` options:${labels.join('|')}`;
}

export function inputTypeOf(el: HTMLElement): InputType | null {
  if (el instanceof HTMLInputElement) return mapInputType(el.type);
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLButtonElement) {
    const t = (el.type || 'submit').toLowerCase();
    if (t === 'submit') return 'submit';
    if (t === 'reset') return 'button';
    return 'button';
  }
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (role === 'searchbox') return 'search';
  if (role === 'textbox') return 'text';
  if (el.isContentEditable) return 'text';
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
  const optionHint = el instanceof HTMLSelectElement ? nativeSelectOptionHint(el) : '';
  const role = normalizeControlRole(el, inputType);
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
  const regionHeadingRaw = nearestRegionHeading(el);
  const regionHeading =
    regionHeadingRaw && regionHeadingRaw.toLowerCase() !== normalizedLabelCandidate.toLowerCase()
      ? regionHeadingRaw
      : '';

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
    innerTextCandidate: sanitizeText(`${normalizedLabelCandidate}${optionHint}`) || null,
    inputType,
    isEnabled: isControlEnabled(el),
    isSelected: isSelected ? true : undefined,
    bbox,
    fingerprint,
    frameProvenance,
    formSubmitting: isFormSubmitControl(el) ? true : undefined,
    regionHeading: regionHeading || undefined,
    hasValue: controlHasValue(el) ? true : false,
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
    const associated = rawElements.find((el) => visualRegionOwnsElement(region.bbox, el.bbox));
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
