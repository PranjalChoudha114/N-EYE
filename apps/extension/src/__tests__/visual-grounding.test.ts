import { describe, it, expect } from 'vitest';
import {
  createElementId,
  createFrameId,
  createPageEpoch,
  type OcrTextBlock,
  type RawElement,
} from '@n-eye/protocol';
import { applyFusionLabels, groundAndFuse, isVisualEvidenceStale } from '../perception/grounding.js';

function button(id: string, label: string | null, bbox: { x: number; y: number; width: number; height: number }): RawElement {
  return {
    id: createElementId(id),
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: label,
    inputType: null,
    isEnabled: true,
    bbox,
  };
}

describe('Visual grounding and DOM/OCR fusion', () => {
  it('fuses OCR text onto a nearby unlabeled control instead of duplicating it', () => {
    const elements = [button('e1', null, { x: 10, y: 10, width: 100, height: 30 })];
    const ocrBlocks: OcrTextBlock[] = [
      {
        text: 'VISUAL SUBMIT',
        confidence: 0.92,
        bbox: { x: 12, y: 12, width: 90, height: 24 },
        roiId: 'roi_1',
        pageEpoch: createPageEpoch(1),
        blockId: 'roi_1_b1',
      },
    ];
    const fused = groundAndFuse({ elements, ocrBlocks, pageEpoch: createPageEpoch(1) });
    expect(fused.candidates).toHaveLength(1);
    expect(fused.candidates[0]?.elementId).toBe('e1');
    expect(fused.fusedElementIds).toEqual(['e1']);
    const labeled = applyFusionLabels(elements, fused.candidates);
    expect(labeled[0]?.innerTextCandidate).toBe('VISUAL SUBMIT');
    expect(labeled[0]?.perceptionSource).toBe('OCR');
  });

  it('suppresses duplicate targets when DOM already has the same label', () => {
    const elements = [button('e1', 'Submit', { x: 10, y: 10, width: 100, height: 30 })];
    const ocrBlocks: OcrTextBlock[] = [
      {
        text: 'Submit',
        confidence: 0.88,
        bbox: { x: 12, y: 12, width: 80, height: 20 },
        roiId: 'roi_1',
        pageEpoch: createPageEpoch(1),
        blockId: 'roi_1_b1',
      },
    ];
    const fused = groundAndFuse({ elements, ocrBlocks, pageEpoch: createPageEpoch(1) });
    expect(fused.candidates).toHaveLength(1);
    expect(fused.candidates[0]?.source).toBe('FUSED');
    const labeled = applyFusionLabels(elements, fused.candidates);
    expect(labeled.filter((e) => e.innerTextCandidate === 'Submit')).toHaveLength(1);
  });

  it('does not hallucinate a target from low-confidence OCR', () => {
    const fused = groundAndFuse({
      elements: [button('e1', null, { x: 10, y: 10, width: 100, height: 30 })],
      ocrBlocks: [
        {
          text: 'maybe',
          confidence: 0.2,
          bbox: { x: 12, y: 12, width: 80, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'roi_1_b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    expect(fused.candidates).toHaveLength(0);
    expect(fused.fallback).toBe('OCR_LOW_CONFIDENCE');
  });

  it('keeps an OCR-only candidate when no DOM control is nearby', () => {
    const fused = groundAndFuse({
      elements: [button('e1', 'Far Away', { x: 400, y: 400, width: 80, height: 24 })],
      ocrBlocks: [
        {
          text: 'PIXEL LABEL',
          confidence: 0.9,
          bbox: { x: 10, y: 10, width: 80, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'roi_1_b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    expect(fused.candidates).toHaveLength(1);
    expect(fused.candidates[0]?.elementId).toBeUndefined();
    expect(fused.candidates[0]?.source).toBe('OCR');
    expect(fused.candidates[0]?.label).toBe('PIXEL LABEL');
  });

  it('does not bind a LOW-confidence OCR block to a DOM target', () => {
    const fused = groundAndFuse({
      elements: [button('e1', null, { x: 10, y: 10, width: 100, height: 30 })],
      ocrBlocks: [
        {
          text: 'NEXT',
          confidence: 0.5,
          bbox: { x: 12, y: 12, width: 80, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'roi_1_b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    expect(fused.candidates).toHaveLength(1);
    expect(fused.candidates[0]?.elementId).toBeUndefined();
    expect(fused.candidates[0]?.source).toBe('OCR');
  });

  it('abstains when two nearby controls are equally plausible', () => {
    const fused = groundAndFuse({
      elements: [
        button('e1', null, { x: 10, y: 10, width: 40, height: 20 }),
        button('e2', null, { x: 12, y: 10, width: 40, height: 20 }),
      ],
      ocrBlocks: [
        {
          text: 'GO',
          confidence: 0.9,
          bbox: { x: 10, y: 10, width: 42, height: 20 },
          roiId: 'roi_1',
          pageEpoch: createPageEpoch(1),
          blockId: 'roi_1_b1',
        },
      ],
      pageEpoch: createPageEpoch(1),
    });
    expect(fused.candidates.filter((c) => c.elementId)).toHaveLength(0);
    expect(fused.fallback).toBe('GROUNDING_AMBIGUOUS');
  });

  it('treats epoch mismatch as stale visual evidence', () => {
    expect(isVisualEvidenceStale(createPageEpoch(1), createPageEpoch(2))).toBe(true);
    expect(isVisualEvidenceStale(createPageEpoch(4), createPageEpoch(4))).toBe(false);
    expect(isVisualEvidenceStale(createPageEpoch(1), createPageEpoch(1), createFrameId('f1'), createFrameId('f2'))).toBe(
      true
    );
  });
});
