import type { BoundingBox } from '@n-eye/protocol';
import type { OcrEngine, OcrEngineResult, OcrRecognizeInput } from './ocr-engine.js';

/**
 * Deterministic OCR double for unit tests.
 * WHY: Policy/fusion tests must not depend on WASM. Real pixels still go through TesseractOcrEngine.
 */
export class MockOcrEngine implements OcrEngine {
  readonly id = 'mock-ocr';
  public recognizeCalls = 0;
  public restartCalls = 0;
  /** Script a one-shot failure. Cleared after restart() so bounded recovery can be tested. */
  public failWith: Error | 'timeout' | null = null;
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
    if (this.failWith === 'timeout') {
      return { engineId: this.id, blocks: [], timedOut: true };
    }
    if (this.failWith) {
      throw this.failWith;
    }
    const hit = this.scripted.get(input.roiId);
    if (hit) return hit;
    return { engineId: this.id, blocks: [] };
  }

  public async restart(): Promise<void> {
    this.restartCalls += 1;
    this.failWith = null;
  }
}
