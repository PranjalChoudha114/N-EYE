/**
 * Real local OCR fixture.
 * Feeds actual PNG pixels through Tesseract.js (not a mocked recognize()).
 */
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TesseractOcrEngine } from '../perception/tesseract-engine.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../ocr-assets/fixtures');

describe('Real Tesseract.js OCR fixture', () => {
  it('reads useful text from an actual PNG (cold then warm)', async () => {
    const png = new Uint8Array(readFileSync(join(fixtureDir, 'hello-neye.png')));
    const engine = new TesseractOcrEngine();
    const coldStart = performance.now();
    const coldInit = await engine.warmup();
    const coldRecognizeStart = performance.now();
    const cold = await engine.recognize({
      roiId: 'roi_hello',
      width: 900,
      height: 140,
      png,
    });
    const coldMs = performance.now() - coldStart;
    const warmStart = performance.now();
    const warm = await engine.recognize({
      roiId: 'roi_hello_warm',
      width: 900,
      height: 140,
      png,
    });
    const warmMs = performance.now() - warmStart;

    const coldText = (cold.blocks.map((b) => b.text).join(' ') || '').toUpperCase();
    const warmText = (warm.blocks.map((b) => b.text).join(' ') || '').toUpperCase();
    expect(coldText).toMatch(/HELLO/);
    expect(coldText).toMatch(/NEYE/);
    expect(warmText).toMatch(/HELLO/);
    expect(engine.isWarm).toBe(true);

    // DEVELOPMENT MEASUREMENT only — printed for the gate report, not a SIH claim.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        kind: 'DEVELOPMENT_MEASUREMENT',
        engine: 'tesseract.js',
        fixture: 'hello-neye.png',
        coldInitMs: Math.round(coldInit),
        coldTotalMs: Math.round(coldMs),
        coldRecognizeMs: Math.round(performance.now() - coldRecognizeStart),
        warmMs: Math.round(warmMs),
        roi: { width: 900, height: 140, pixels: 900 * 140 },
        coldText,
        warmText,
      })
    );

    await engine.terminate();
  }, 60_000);
});
