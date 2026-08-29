import type { BoundingBox } from '@n-eye/protocol';

export interface OcrEngineResultBlock {
  text: string;
  confidence?: number;
  /** Box relative to the ROI origin, in pixels. */
  bbox: BoundingBox;
}

export interface OcrEngineResult {
  blocks: OcrEngineResultBlock[];
  timedOut?: boolean;
  engineId: string;
}

export interface OcrRecognizeInput {
  roiId: string;
  width: number;
  height: number;
  rgba?: Uint8ClampedArray;
  png?: Uint8Array;
}

/**
 * OcrEngine (Zone 3).
 * OWNS: Pixel → text. Provider-specific WASM/worker init stays behind this seam.
 * MUST NOT: Call the network, persist pixels, or skip privacy.
 */
export interface OcrEngine {
  readonly id: string;
  recognize(input: OcrRecognizeInput): Promise<OcrEngineResult>;
  warmup?(): Promise<number>;
  terminate?(): Promise<void>;
}

export const OCR_TIMEOUT_MS = 8_000;
export const OCR_LOW_CONFIDENCE_THRESHOLD = 0.45;
