/**
 * Pointer hit-test (Zone 1).
 *
 * OWNS: Whether the live target is the element at its visual center.
 * WHY: Occluding overlays make node.click() hit the overlay, not the intended control.
 * MUST NOT: Hammer-click. Missing geometry (jsdom/happy-dom) is not treated as occlusion.
 */

export type ClickHitTest = { ok: true } | { ok: false; reason: 'occluded' };

function isPointerPassThrough(node: Element): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.style.pointerEvents === 'none') return true;
  try {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    return style?.pointerEvents === 'none';
  } catch {
    return false;
  }
}

export function clickHitTest(node: HTMLElement): ClickHitTest {
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return { ok: true };
  }
  const doc = node.ownerDocument;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const stack =
    typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(x, y)
      : typeof doc.elementFromPoint === 'function'
        ? [doc.elementFromPoint(x, y)].filter((el): el is Element => el instanceof Element)
        : [];
  if (stack.length === 0) {
    return { ok: true };
  }
  for (const hit of stack) {
    if (!hit) continue;
    if (isPointerPassThrough(hit)) continue;
    if (node === hit || node.contains(hit)) {
      return { ok: true };
    }
    if (hit.contains(node)) {
      return { ok: true };
    }
    return { ok: false, reason: 'occluded' };
  }
  return { ok: true };
}
