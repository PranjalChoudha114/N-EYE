import type { BoundingBox } from '@n-eye/protocol';

/**
 * ROI resource bounds (Zone 3).
 * WHY: Full-viewport capture is expensive (Chrome caps captureVisibleTab at 2/s)
 * and privacy-hostile. Pathological sizes are rejected, not silently processed.
 */
export const MAX_ROI_WIDTH_PX = 800;
export const MAX_ROI_HEIGHT_PX = 600;
export const MAX_ROI_PIXELS = 480_000;
export const MAX_SIMULTANEOUS_ROIS = 4;
export const MIN_ROI_SIDE_PX = 12;
export const ROI_LIFETIME_MS = 15_000;
export const ROI_CONTEXT_PAD_PX = 8;

export class RoiBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoiBoundsError';
  }
}

export interface RoiGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampRoiToViewport(
  box: BoundingBox,
  viewport: { width: number; height: number },
  padPx = ROI_CONTEXT_PAD_PX
): RoiGeometry {
  const x = Math.max(0, Math.floor(box.x - padPx));
  const y = Math.max(0, Math.floor(box.y - padPx));
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width + padPx));
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height + padPx));
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * WHY: A 900px banner is useful OCR input, not a pathological capture.
 * Clip to max width/height/pixels instead of dropping the region (which would skip OCR).
 */
export function fitRoiToBounds(geo: RoiGeometry): RoiGeometry {
  let width = Math.min(geo.width, MAX_ROI_WIDTH_PX);
  let height = Math.min(geo.height, MAX_ROI_HEIGHT_PX);
  const pixels = width * height;
  if (pixels > MAX_ROI_PIXELS) {
    const scale = Math.sqrt(MAX_ROI_PIXELS / pixels);
    width = Math.max(MIN_ROI_SIDE_PX, Math.floor(width * scale));
    height = Math.max(MIN_ROI_SIDE_PX, Math.floor(height * scale));
  }
  return { x: geo.x, y: geo.y, width, height };
}

export function assertRoiBounds(geo: RoiGeometry): void {
  if (geo.width < MIN_ROI_SIDE_PX || geo.height < MIN_ROI_SIDE_PX) {
    throw new RoiBoundsError(
      `ROI ${geo.width}x${geo.height} is below the minimum ${MIN_ROI_SIDE_PX}px side.`
    );
  }
  if (geo.width > MAX_ROI_WIDTH_PX || geo.height > MAX_ROI_HEIGHT_PX) {
    throw new RoiBoundsError(
      `ROI ${geo.width}x${geo.height} exceeds ${MAX_ROI_WIDTH_PX}x${MAX_ROI_HEIGHT_PX} bound.`
    );
  }
  const pixels = geo.width * geo.height;
  if (pixels > MAX_ROI_PIXELS) {
    throw new RoiBoundsError(`ROI pixel count ${pixels} exceeds ${MAX_ROI_PIXELS}.`);
  }
}

export function roiPixelCount(geo: RoiGeometry): number {
  return geo.width * geo.height;
}
