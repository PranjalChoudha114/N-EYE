import type { EscalationReason, PageEpoch, VisualRegion } from '@n-eye/protocol';

const MIN_AREA = 1600;

function isVisibleSurface(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  return true;
}

function nextRegionId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

function isPdfLike(el: HTMLElement): boolean {
  const type = (el.getAttribute('type') || '').toLowerCase();
  const src = (el.getAttribute('src') || el.getAttribute('data') || '').toLowerCase();
  return type.includes('pdf') || src.includes('.pdf') || src.includes('application/pdf');
}

function isInsideInteractive(el: HTMLElement): boolean {
  return Boolean(el.closest('button, a[href], [role="button"], [role="link"]'));
}

/**
 * Visual region discovery (Zone 1).
 * OWNS: Geometry of canvas/image/PDF/document surfaces.
 * MUST NOT: Read pixels. MUST NOT key off fixture-only HTML attributes.
 */
export function collectVisualRegions(epoch: PageEpoch): VisualRegion[] {
  const regions: VisualRegion[] = [];
  let n = 1;

  const pushIfVisible = (el: Element, kind: VisualRegion['kind'], reason: EscalationReason): void => {
    if (!(el instanceof HTMLElement)) return;
    if (!isVisibleSurface(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width * rect.height < MIN_AREA) return;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
      return;
    }
    regions.push({
      regionId: nextRegionId(kind, n++),
      kind,
      reason,
      pageEpoch: epoch,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      altText: el.getAttribute('alt') || el.getAttribute('aria-label'),
    });
  };

  document.querySelectorAll('canvas').forEach((node) => {
    pushIfVisible(node, 'canvas', 'CANVAS_RENDERED');
  });

  document.querySelectorAll('img').forEach((node) => {
    if (isInsideInteractive(node)) return;
    pushIfVisible(node, 'image', 'IMAGE_TEXT');
  });

  document.querySelectorAll('embed, object, iframe').forEach((node) => {
    if (node instanceof HTMLElement && isPdfLike(node)) {
      pushIfVisible(node, 'pdf', 'PDF_OR_DOCUMENT_PREVIEW');
    }
  });

  document.querySelectorAll('[role="document"]').forEach((node) => {
    pushIfVisible(node, 'document', 'PDF_OR_DOCUMENT_PREVIEW');
  });

  return regions.slice(0, 8);
}

export function collectClickableVisualSurfaces(): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  document.querySelectorAll('canvas, img').forEach((node) => {
    const el = node as HTMLElement;
    if (!isVisibleSurface(el)) return;
    if (el.tagName.toLowerCase() === 'img' && isInsideInteractive(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width * rect.height < MIN_AREA) return;
    nodes.push(el);
  });
  return nodes.slice(0, 8);
}
