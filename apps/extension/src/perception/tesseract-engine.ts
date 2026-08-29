import { createWorker, type Worker } from 'tesseract.js';
import type { OcrEngine, OcrEngineResult, OcrRecognizeInput } from './ocr-engine.js';
import { OCR_TIMEOUT_MS } from './ocr-engine.js';

type TesseractWorker = Worker;

let sharedWorker: TesseractWorker | null = null;
let sharedInitPromise: Promise<TesseractWorker> | null = null;
let initializedOnce = false;

function isExtensionPage(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function';
}

function workerOptions(): Parameters<typeof createWorker>[2] {
  if (isExtensionPage()) {
    return {
      workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
      corePath: chrome.runtime.getURL('ocr/tesseract-core-simd-lstm.wasm.js'),
      langPath: chrome.runtime.getURL('ocr'),
      gzip: false,
      cacheMethod: 'none',
      workerBlobURL: false,
    };
  }
  return {
    gzip: false,
    cacheMethod: 'none',
    langPath: new URL(/* @vite-ignore */ '../../ocr-assets/', import.meta.url).pathname,
  };
}

async function createLocalWorker(): Promise<TesseractWorker> {
  // PRIVACY: workerPath/corePath/langPath are extension-local. Never fall back to the Tesseract CDN.
  const worker = await createWorker('eng', 1, workerOptions());
  return worker;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OCR_TIMEOUT'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Tesseract.js OCR engine (Zone 3).
 * OWNS: On-device WASM OCR. Reuses one worker (warm) after the first load (cold).
 * MUST NEVER: Send pixels to Gemini or any remote endpoint.
 */
export class TesseractOcrEngine implements OcrEngine {
  readonly id = 'tesseract.js';

  public async warmup(): Promise<number> {
    const start = performance.now();
    await this.ensureWorker();
    return performance.now() - start;
  }

  public async recognize(input: OcrRecognizeInput): Promise<OcrEngineResult> {
    try {
      const worker = await this.ensureWorker();
      const image = this.toImageLike(input);
      const result = await withTimeout(
        worker.recognize(image as Parameters<TesseractWorker['recognize']>[0]),
        OCR_TIMEOUT_MS
      );
      const blocks = (result.data.blocks || []).map((block) => {
        const box = block.bbox;
        return {
          text: (block.text || '').replace(/\s+/g, ' ').trim(),
          confidence: typeof block.confidence === 'number' ? block.confidence / 100 : undefined,
          bbox: {
            x: box?.x0 ?? 0,
            y: box?.y0 ?? 0,
            width: Math.max(0, (box?.x1 ?? 0) - (box?.x0 ?? 0)),
            height: Math.max(0, (box?.y1 ?? 0) - (box?.y0 ?? 0)),
          },
        };
      }).filter((b) => b.text.length > 0);

      if (blocks.length === 0 && result.data.text.trim()) {
        return {
          engineId: this.id,
          blocks: [
            {
              text: result.data.text.replace(/\s+/g, ' ').trim(),
              confidence: typeof result.data.confidence === 'number' ? result.data.confidence / 100 : undefined,
              bbox: { x: 0, y: 0, width: input.width, height: input.height },
            },
          ],
        };
      }

      return { engineId: this.id, blocks };
    } catch (err) {
      if (err instanceof Error && err.message === 'OCR_TIMEOUT') {
        return { engineId: this.id, blocks: [], timedOut: true };
      }
      throw err;
    }
  }

  public async terminate(): Promise<void> {
    if (sharedWorker) {
      await sharedWorker.terminate();
      sharedWorker = null;
      sharedInitPromise = null;
      initializedOnce = false;
    }
  }

  public get isWarm(): boolean {
    return initializedOnce && sharedWorker !== null;
  }

  private async ensureWorker(): Promise<TesseractWorker> {
    if (sharedWorker) return sharedWorker;
    if (!sharedInitPromise) {
      sharedInitPromise = createLocalWorker()
        .then((worker) => {
          sharedWorker = worker;
          initializedOnce = true;
          return worker;
        })
        .catch((err: unknown) => {
          sharedInitPromise = null;
          throw err;
        });
    }
    return sharedInitPromise;
  }

  private toImageLike(input: OcrRecognizeInput): ImageData | Blob | Uint8Array {
    if (input.png) {
      if (typeof globalThis.Buffer !== 'undefined') {
        return globalThis.Buffer.from(input.png);
      }
      return new Blob([Uint8Array.from(input.png)], { type: 'image/png' });
    }
    if (input.rgba) {
      if (typeof ImageData !== 'undefined') {
        const copy = new Uint8ClampedArray(input.rgba.length);
        copy.set(input.rgba);
        return new ImageData(copy, input.width, input.height);
      }
      throw new Error('RGBA OCR requires ImageData in this runtime; pass PNG bytes instead.');
    }
    throw new Error('OCR input missing rgba and png payloads.');
  }
}

export function tesseractWasColdStart(): boolean {
  return !initializedOnce;
}
