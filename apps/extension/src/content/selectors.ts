/**
 * Shared DOM selectors for observation and mutation classification.
 * WHY: Epoch policy and observer must agree on what is an actionable control.
 */

export const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="radio"], [role="menuitem"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="switch"], [role="option"], [role="treeitem"], [contenteditable="true"], [contenteditable=""], summary, input[type="image"]';

/** Popup descendants referenced by aria-controls / aria-owns. Bounded; not a DOM crawl. */
export const POPUP_OWNED_SELECTOR =
  '[role="option"], [role="menuitem"], [role="treeitem"], button, a[href], [role="button"], [role="link"]';

export const SEMANTIC_ATTRIBUTE_NAMES = new Set([
  'hidden',
  'aria-hidden',
  'disabled',
  'aria-disabled',
  'aria-label',
  'aria-labelledby',
  'aria-checked',
  'aria-selected',
  'role',
  'type',
  'href',
  'contenteditable',
  'inert',
]);

const INTERACTIVE_CLASS_RE =
  /\b(hidden|disabled|invisible|inert|sr-only|display-none|pointer-events-none|aria-disabled)\b/i;

const STYLE_INTERACT_RE = /\b(display|visibility|opacity|pointer-events|position|transform)\b/i;

export function isInteractiveElement(el: Element | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  try {
    return el.matches(INTERACTIVE_SELECTOR);
  } catch {
    return false;
  }
}

export function isLabelLike(el: Element | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'label' || tag === 'legend' || Boolean(el.getAttribute('aria-labelledby'));
}

/**
 * True when a node lives under a subtree that is already non-interactable,
 * except when the mutated node itself is the hiding control.
 */
export function isInsideHiddenSubtree(node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement) {
      if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      const view = current.ownerDocument.defaultView;
      if (view) {
        const style = view.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return true;
        }
      }
    }
    current = current.parentNode;
  }
  return false;
}

export function classChangeAffectsInteractability(oldValue: string | null, newValue: string | null): boolean {
  const oldHit = INTERACTIVE_CLASS_RE.test(oldValue || '');
  const newHit = INTERACTIVE_CLASS_RE.test(newValue || '');
  return oldHit !== newHit;
}

export function styleChangeAffectsInteractability(oldValue: string | null, newValue: string | null): boolean {
  const combined = `${oldValue || ''} ${newValue || ''}`;
  return STYLE_INTERACT_RE.test(combined);
}
