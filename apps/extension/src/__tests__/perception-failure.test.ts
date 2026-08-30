import { describe, expect, it } from 'vitest';
import { createElementId, createPageEpoch, type RawElement, type RawScene, type VisualRegion } from '@n-eye/protocol';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { runPerception } from '../perception/orchestrator.js';
import { PixelBuffer } from '../perception/pixel-buffer.js';

function el(partial: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: '',
    inputType: null,
    isEnabled: true,
    bbox: { x: 10, y: 10, width: 80, height: 24 },
    ...partial,
  };
}

function visualScene(): RawScene {
  const region: VisualRegion = {
    regionId: 'canvas_1',
    kind: 'canvas',
    reason: 'CANVAS_RENDERED',
    pageEpoch: createPageEpoch(1),
    bbox: { x: 20, y: 20, width: 240, height: 80 },
  };
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://portal.example.com/visual',
    origin: 'https://portal.example.com',
    title: 'Visual',
    viewport: { width: 1280, height: 720 },
    elements: [el({ id: createElementId('e1'), innerTextCandidate: '' })],
    privacyFindings: [],
    timestamp: Date.now(),
    visualRegions: [region],
  };
}

describe('Perception failure recovery', () => {
  it('falls back to structure when capture fails and labeled controls exist', async () => {
    const scene: RawScene = {
      ...visualScene(),
      elements: [el({ id: createElementId('e1'), innerTextCandidate: 'Continue Application', ariaLabel: 'Continue' })],
    };
    const result = await runPerception({
      scene,
      engine: new MockOcrEngine(),
      capture: async () => {
        throw new Error('capture unavailable');
      },
    });
    expect(result.fallback).toBe('CAPTURE_UNAVAILABLE');
    expect(result.ocrBlocks).toHaveLength(0);
  });

  it('restarts the OCR worker once after load failure', async () => {
    const engine = new MockOcrEngine({
      roi_canvas_1: [{ text: 'HELLO', confidence: 0.9 }],
    });
    engine.failWith = new Error('worker died');
    const result = await runPerception({
      scene: visualScene(),
      engine,
      capture: async (rois) =>
        rois.map((roi) => new PixelBuffer(roi.roiId, roi.widthPx, roi.heightPx, new Uint8ClampedArray(roi.pixelCount * 4))),
    });
    expect(engine.restartCalls).toBe(1);
    expect(result.fallback).not.toBe('OCR_LOAD_FAILURE');
  });

  it('records OCR timeout without throwing pixels outward', async () => {
    const engine = new MockOcrEngine();
    engine.failWith = 'timeout';
    const result = await runPerception({
      scene: visualScene(),
      engine,
      capture: async (rois) =>
        rois.map((roi) => new PixelBuffer(roi.roiId, roi.widthPx, roi.heightPx, new Uint8ClampedArray(roi.pixelCount * 4))),
    });
    expect(result.fallback).toBe('OCR_TIMEOUT');
    expect(result.invoked).toBe(true);
  });

  it('honours cancellation before OCR', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runPerception({
      scene: visualScene(),
      engine: new MockOcrEngine(),
      capture: async () => [],
      signal: controller.signal,
    });
    expect(result.fallback).toBe('CANCELLED');
    expect(result.invoked).toBe(false);
  });
});
