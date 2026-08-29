/**
 * Safe dynamic text (Zone 2 UI).
 * OWNS: Putting untrusted planner/page strings into the DOM as text only.
 * MUST NEVER: innerHTML planner reasoning, labels, or evidence blobs.
 */

export function setSafeText(el: Element | null, value: string): void {
  if (!el) return;
  el.textContent = value;
}

export function setSafeAttr(el: Element | null, name: string, value: string): void {
  if (!el) return;
  el.setAttribute(name, value);
}

export function containsMarkup(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}
