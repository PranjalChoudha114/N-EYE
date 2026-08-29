import type { BoundingBox } from '@n-eye/protocol';
import type { OcrEngine, OcrEngineResult, OcrRecognizeInput } from './ocr-engine.js';

/**
 * Deterministic OCR double for unit tests.
 * WHY: Policy/fusion tests must not depend on WASM. Real pixels still go through TesseractOcrEngine.
 */
export class MockOcrEngine implements OcrEngine {
  readonly id = 'mock-ocr';
  public recognizeCalls = 0;
  private readonly scripted: Map<string, OcrEngineResult>;

  constructor(scripted?: Record<string, { text: string; confidence?: number; bbox?: BoundingBox }[]>) {
    this.scripted = new Map();
    if (scripted) {
      for (const [roiId, blocks] of Object.entries(scripted)) {
        this.scripted.set(roiId, {
          engineId: this.id,
          blocks: blocks.map((b, i) => ({
            text: b.text,
            confidence: b.confidence,
            bbox: b.bbox || { x: 0, y: i * 12, width: 80, height: 12 },
          })),
        });
      }
    }
  }

  public async recognize(input: OcrRecognizeInput): Promise<OcrEngineResult> {
    this.recognizeCalls += 1;
    const hit = this.scripted.get(input.roiId);
    if (hit) return hit;
    return { engineId: this.id, blocks: [] };
  }
}
