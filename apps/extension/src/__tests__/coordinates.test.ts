import { describe, it, expect } from 'vitest';
import { clipBoxToBounds, mapCssBoxToBitmap, mapCssBoxToElementBuffer } from '../perception/coordinates.js';
import { clampRoiToViewport, fitRoiToBounds } from '../perception/roi.js';

describe('Coordinate transforms used by capture', () => {
  it('maps CSS viewport boxes onto a 2x DPR screenshot bitmap', () => {
    const mapped = mapCssBoxToBitmap(
      { x: 10, y: 20, width: 40, height: 30 },
      { width: 100, height: 100 },
      { width: 200, height: 200 }
    );
    expect(mapped).toEqual({ x: 20, y: 40, width: 80, height: 60 });
  });

  it('maps CSS boxes into canvas intrinsic pixels when CSS size differs from canvas.width', () => {
    const mapped = mapCssBoxToElementBuffer(
      { x: 10, y: 10, width: 50, height: 20 },
      { x: 0, y: 0, width: 100, height: 40 },
      { width: 400, height: 80 }
    );
    expect(mapped).toEqual({ x: 40, y: 20, width: 200, height: 40 });
  });

  it('clips a partially off-viewport ROI', () => {
    const clipped = clipBoxToBounds({ x: -10, y: 90, width: 40, height: 30 }, { width: 100, height: 100 });
    expect(clipped).toEqual({ x: 0, y: 90, width: 30, height: 10 });
  });

  it('does not add scroll offsets — viewport boxes are already getBoundingClientRect', () => {
    const mapped = mapCssBoxToBitmap(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 100, height: 200 },
      { width: 100, height: 200 }
    );
    expect(mapped).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('fits an oversized region rather than dropping it', () => {
    const geo = clampRoiToViewport({ x: 0, y: 0, width: 1200, height: 900 }, { width: 1280, height: 720 });
    const fitted = fitRoiToBounds(geo);
    expect(fitted.width).toBeLessThanOrEqual(800);
    expect(fitted.height).toBeLessThanOrEqual(600);
  });
});
