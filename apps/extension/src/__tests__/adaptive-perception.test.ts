import { describe, it, expect } from 'vitest';
import {
  createElementId,
  createPageEpoch,
  createTaskId,
  type RawElement,
  type RawScene,
  type VisualRegion,
} from '@n-eye/protocol';
import { decidePerception } from '../perception/adaptive-controller.js';
import { assertRoiBounds, RoiBoundsError, clampRoiToViewport, fitRoiToBounds, MAX_ROI_PIXELS } from '../perception/roi.js';
import { PixelBuffer } from '../perception/pixel-buffer.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { runPerception } from '../perception/orchestrator.js';

function el(partial: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: 'Submit',
    inputType: null,
    isEnabled: true,
    bbox: { x: 10, y: 10, width: 80, height: 24 },
    ...partial,
  };
}

function scene(over: Partial<RawScene> = {}): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://portal.example.com/app',
    origin: 'https://portal.example.com',
    title: 'Portal',
    viewport: { width: 1280, height: 720 },
    elements: [
      el({ id: createElementId('e1'), innerTextCandidate: 'Email', inputType: 'email', tagName: 'input', role: 'textbox' }),
      el({ id: createElementId('e2'), innerTextCandidate: 'Continue Application', bbox: { x: 10, y: 80, width: 160, height: 32 } }),
    ],
    privacyFindings: [],
    timestamp: Date.now(),
    visualRegions: [],
    ...over,
  };
}

describe('Adaptive perception controller', () => {
  it('does not escalate when DOM/ARIA labels are sufficient', () => {
    const decision = decidePerception(scene());
    expect(decision.escalate).toBe(false);
    expect(decision.skippedReason).toMatch(/DOM\/ARIA/i);
    expect(decision.roiSpecs).toHaveLength(0);
  });

  it('escalates for canvas with an explicit reason', () => {
    const canvas: VisualRegion = {
      regionId: 'canvas_1',
      kind: 'canvas',
      reason: 'CANVAS_RENDERED',
      pageEpoch: createPageEpoch(1),
      bbox: { x: 20, y: 20, width: 240, height: 80 },
    };
    const decision = decidePerception(scene({ visualRegions: [canvas] }));
    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain('CANVAS_RENDERED');
    expect(decision.roiSpecs.length).toBeGreaterThan(0);
  });

  it('fits oversized image banners instead of skipping OCR', () => {
    const decision = decidePerception(
      scene({
        visualRegions: [
          {
            regionId: 'img_banner',
            kind: 'image',
            reason: 'IMAGE_TEXT',
            pageEpoch: createPageEpoch(1),
            bbox: { x: 0, y: 0, width: 900, height: 140 },
          },
        ],
      })
    );
    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain('IMAGE_TEXT');
    const roi = decision.roiSpecs[0];
    expect(roi).toBeDefined();
    expect(roi?.widthPx).toBeLessThanOrEqual(800);
    expect(roi?.heightPx).toBeLessThanOrEqual(600);
    expect((roi?.widthPx || 0) * (roi?.heightPx || 0)).toBeLessThanOrEqual(MAX_ROI_PIXELS);
  });

  it('escalates for PDF/document preview regions', () => {
    const decision = decidePerception(
      scene({
        visualRegions: [
          {
            regionId: 'doc_1',
            kind: 'document',
            reason: 'PDF_OR_DOCUMENT_PREVIEW',
            pageEpoch: createPageEpoch(1),
            bbox: { x: 20, y: 20, width: 240, height: 80 },
          },
        ],
      })
    );
    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain('PDF_OR_DOCUMENT_PREVIEW');
  });

  it('escalates for unlabeled icon-only controls', () => {
    const decision = decidePerception(
      scene({
        elements: [el({ id: createElementId('e9'), innerTextCandidate: null, ariaLabel: null })],
      })
    );
    expect(decision.escalate).toBe(true);
    expect(decision.reasons).toContain('ICON_ONLY_CONTROL');
  });
});

describe('ROI bounds and pixel lifecycle', () => {
  it('rejects pathological ROI sizes', () => {
    expect(() => assertRoiBounds({ x: 0, y: 0, width: 4, height: 4 })).toThrow(RoiBoundsError);
    expect(() => assertRoiBounds({ x: 0, y: 0, width: 2000, height: 2000 })).toThrow(RoiBoundsError);
    const geo = clampRoiToViewport({ x: -10, y: -10, width: 40, height: 40 }, { width: 100, height: 100 });
    expect(geo.x).toBe(0);
    expect(geo.y).toBe(0);
    expect(geo.width * geo.height).toBeLessThanOrEqual(MAX_ROI_PIXELS);
    const fitted = fitRoiToBounds({ x: 0, y: 0, width: 2000, height: 2000 });
    expect(fitted.width).toBeLessThanOrEqual(800);
    expect(fitted.height).toBeLessThanOrEqual(600);
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(MAX_ROI_PIXELS);
    expect(() => assertRoiBounds(fitted)).not.toThrow();
  });

  it('zeroes and drops pixel buffers after release', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    const buffer = new PixelBuffer('roi_test', 2, 1, data);
    expect(buffer.released).toBe(false);
    buffer.release();
    expect(buffer.released).toBe(true);
    expect(data.every((b) => b === 0)).toBe(true);
    expect(() => buffer.bytes()).toThrow(/released/);
  });

  it('releases captured pixels even after OCR runs', async () => {
    const data = new Uint8ClampedArray(40 * 20 * 4);
    const buffer = new PixelBuffer('roi_canvas_1', 40, 20, data);
    const engine = new MockOcrEngine({
      roi_canvas_1: [{ text: 'HELLO', confidence: 0.9, bbox: { x: 0, y: 0, width: 40, height: 12 } }],
    });
    const result = await runPerception({
      scene: scene({
        visualRegions: [
          {
            regionId: 'canvas_1',
            kind: 'canvas',
            reason: 'CANVAS_RENDERED',
            pageEpoch: createPageEpoch(1),
            bbox: { x: 20, y: 20, width: 40, height: 20 },
          },
        ],
      }),
      engine,
      capture: async () => [buffer],
      origin: 'https://portal.example.com',
    });
    expect(result.invoked).toBe(true);
    expect(buffer.released).toBe(true);
    expect(engine.recognizeCalls).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/data:image/i);
  });

  it('does not call OCR when DOM is sufficient', async () => {
    const engine = new MockOcrEngine();
    const result = await runPerception({
      scene: scene(),
      engine,
      capture: async () => {
        throw new Error('capture should not run');
      },
    });
    expect(result.invoked).toBe(false);
    expect(engine.recognizeCalls).toBe(0);
  });
});

describe('Stale visual evidence', () => {
  it('fails closed when page epoch changes before perception', async () => {
    const engine = new MockOcrEngine();
    const result = await runPerception({
      scene: scene({
        pageEpoch: createPageEpoch(1),
        visualRegions: [
          {
            regionId: 'canvas_1',
            kind: 'canvas',
            reason: 'CANVAS_RENDERED',
            pageEpoch: createPageEpoch(1),
            bbox: { x: 20, y: 20, width: 80, height: 40 },
          },
        ],
      }),
      engine,
      currentEpoch: createPageEpoch(2),
      capture: async () => [],
    });
    expect(result.fallback).toBe('PAGE_CHANGED');
    expect(result.invoked).toBe(false);
    expect(engine.recognizeCalls).toBe(0);
    expect(createTaskId('t')).toBe('t');
  });
});
