import type { RoiSpec } from '@n-eye/protocol';
import { mapCssBoxToElementBuffer } from './coordinates.js';
import { PixelBuffer } from './pixel-buffer.js';

export interface CapturedRoiWire {
  roiId: string;
  width: number;
  height: number;
  rgba: number[];
}

/**
 * Content-script ROI capture (Zone 1).
 * OWNS: Extracting the smallest pixel crop for an escalated ROI.
 * COORDINATES: ROI boxes are CSS viewport pixels. Canvas/img buffers are intrinsic pixels.
 * LIFECYCLE: Returns PixelBuffer-ready rasters. Caller must release after OCR.
 * Prefer canvas.getImageData / img drawImage over captureVisibleTab when possible.
 */
export async function captureRoisInPage(rois: RoiSpec[]): Promise<CapturedRoiWire[]> {
  const out: CapturedRoiWire[] = [];
  for (const roi of rois) {
    const local = captureLocalRoi(roi);
    if (local) {
      out.push(local);
    }
  }
  return out;
}

function captureLocalRoi(roi: RoiSpec): CapturedRoiWire | null {
  const canvases = Array.from(document.querySelectorAll('canvas'));
  for (const canvas of canvases) {
    const rect = canvas.getBoundingClientRect();
    if (!overlapsCss(rect, roi)) continue;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const mapped = mapCssBoxToElementBuffer(
        roi.bbox,
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        { width: canvas.width, height: canvas.height }
      );
      if (!mapped) continue;
      const image = ctx.getImageData(mapped.x, mapped.y, mapped.width, mapped.height);
      return {
        roiId: roi.roiId,
        width: image.width,
        height: image.height,
        rgba: Array.from(image.data),
      };
    } catch {
      // Tainted canvas — fall through to tab capture.
    }
  }

  const images = Array.from(document.querySelectorAll('img'));
  for (const img of images) {
    const rect = img.getBoundingClientRect();
    if (!overlapsCss(rect, roi)) continue;
    const naturalW = img.naturalWidth || 0;
    const naturalH = img.naturalHeight || 0;
    if (naturalW < 1 || naturalH < 1) continue;
    try {
      const mapped = mapCssBoxToElementBuffer(
        roi.bbox,
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        { width: naturalW, height: naturalH }
      );
      if (!mapped) continue;
      const scratch = document.createElement('canvas');
      scratch.width = mapped.width;
      scratch.height = mapped.height;
      const ctx = scratch.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(
        img,
        mapped.x,
        mapped.y,
        mapped.width,
        mapped.height,
        0,
        0,
        mapped.width,
        mapped.height
      );
      const image = ctx.getImageData(0, 0, scratch.width, scratch.height);
      return {
        roiId: roi.roiId,
        width: image.width,
        height: image.height,
        rgba: Array.from(image.data),
      };
    } catch {
      // Cross-origin image — fall through to tab capture.
    }
  }

  return null;
}

function overlapsCss(rect: DOMRect, roi: RoiSpec): boolean {
  const x2 = roi.bbox.x + roi.bbox.width;
  const y2 = roi.bbox.y + roi.bbox.height;
  return !(rect.right < roi.bbox.x || rect.left > x2 || rect.bottom < roi.bbox.y || rect.top > y2);
}

export function wireRoisToBuffers(wires: CapturedRoiWire[]): PixelBuffer[] {
  return wires.map(
    (wire) =>
      new PixelBuffer(wire.roiId, wire.width, wire.height, Uint8ClampedArray.from(wire.rgba))
  );
}

export function discardWireRois(wires: CapturedRoiWire[]): void {
  for (const wire of wires) {
    wire.rgba.length = 0;
  }
}
