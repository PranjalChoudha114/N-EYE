import type { BoundingBox } from '@n-eye/protocol';

/**
 * Geometry transforms actually used by N-Eye capture (Zone 1/2).
 * DOCUMENT: RawElement.bbox and ROI specs are CSS viewport pixels (getBoundingClientRect).
 * captureVisibleTab bitmaps are device pixels. Canvas/img buffers use intrinsic pixels.
 * Scroll is already in viewport boxes — do not add window.scrollX/Y to screenshot crops.
 * MUST NOT: Invent a DPR transform the capture path does not apply.
 */

export interface Size2D {
  width: number;
  height: number;
}

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clipBoxToBounds(box: Rect2D, bounds: Size2D): Rect2D | null {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(bounds.width, Math.ceil(box.x + box.width));
  const bottom = Math.min(bounds.height, Math.ceil(box.y + box.height));
  const width = right - x;
  const height = bottom - y;
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

/**
 * CSS viewport box → screenshot bitmap pixels.
 * scale = bitmapSize / viewportSize (covers devicePixelRatio and browser zoom as Chrome encodes them).
 */
export function mapCssBoxToBitmap(box: BoundingBox, viewport: Size2D, bitmap: Size2D): Rect2D | null {
  const scaleX = bitmap.width / Math.max(viewport.width, 1);
  const scaleY = bitmap.height / Math.max(viewport.height, 1);
  return clipBoxToBounds(
    {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    },
    bitmap
  );
}

/**
 * CSS viewport box → element buffer pixels (canvas.width/height or img.naturalWidth/Height).
 * Local origin is the element's CSS rect.
 */
export function mapCssBoxToElementBuffer(
  box: BoundingBox,
  elementCss: Rect2D,
  buffer: Size2D
): Rect2D | null {
  const scaleX = buffer.width / Math.max(elementCss.width, 1);
  const scaleY = buffer.height / Math.max(elementCss.height, 1);
  return clipBoxToBounds(
    {
      x: (box.x - elementCss.x) * scaleX,
      y: (box.y - elementCss.y) * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    },
    buffer
  );
}

/**
 * Screenshot bitmap pixel → CSS viewport point.
 * scale = viewportSize / bitmapSize from the actual capture, not a copied DPR constant.
 */
export function mapBitmapPointToCss(
  point: { x: number; y: number },
  viewport: Size2D,
  bitmap: Size2D
): { x: number; y: number } {
  const scaleX = viewport.width / Math.max(bitmap.width, 1);
  const scaleY = viewport.height / Math.max(bitmap.height, 1);
  return { x: point.x * scaleX, y: point.y * scaleY };
}

/**
 * Screenshot bitmap box → CSS viewport box (inverse of mapCssBoxToBitmap).
 */
export function mapBitmapBoxToCss(box: Rect2D, viewport: Size2D, bitmap: Size2D): Rect2D | null {
  const scaleX = viewport.width / Math.max(bitmap.width, 1);
  const scaleY = viewport.height / Math.max(bitmap.height, 1);
  return clipBoxToBounds(
    {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY,
    },
    viewport
  );
}

export function boxesOverlap(a: Rect2D, b: Rect2D): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}
