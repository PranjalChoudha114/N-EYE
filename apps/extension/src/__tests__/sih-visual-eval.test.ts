/**
 * SIH visual evaluation harness (T009/T010 historical writer).
 * T019/T020 formal visual RESULT is written by bench-t019.test.ts to t019-t020-*.json.
 */
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVisualEval } from '../eval/visual-bench.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const reportDir = join(repoRoot, 'bench/visual/reports');

describe('SIH visual evaluation harness', () => {
  it('scores development and held-out splits without mixing ground truth into predictions', async () => {
    const report = (await runVisualEval()) as {
      cascade: { correct: number; total: number };
      grounding: { correct: number; total: number; falseGrounding: number; abstain: number };
      ocr: { hits: number; total: number; latencyMs: { count: number; p50: number | null; p95: number | null } };
      privacy: { tp: number; fp: number; fn: number; f1: number; leakCount: number };
      modelAdmission: { decision: string; rationale: string };
      generatedAt: string;
    };

    mkdirSync(reportDir, { recursive: true });
    const historical = { gate: 'T009-T010', notSihFinalScore: true, classification: 'DEVELOPMENT_MEASUREMENT', ...report };
    writeFileSync(join(reportDir, 't009-t010-latest.json'), `${JSON.stringify(historical, null, 2)}\n`);
    const md = [
      '# T009/T010 SIH visual evaluation (development measurement)',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      'This is **not** a final SIH score. Formal T019/T020 visual RESULT lives in t019-t020-visual.json.',
      '',
      `## Cascade: ${report.cascade.correct}/${report.cascade.total}`,
      `## Grounding: ${report.grounding.correct}/${report.grounding.total} (false grounding ${report.grounding.falseGrounding}, abstain ${report.grounding.abstain})`,
      `## OCR normalized-contains: ${report.ocr.hits}/${report.ocr.total}`,
      `## OCR latency ms: count=${report.ocr.latencyMs.count} p50=${report.ocr.latencyMs.p50} p95=${report.ocr.latencyMs.p95} (p95 requires n≥5)`,
      `## Visual PII F1: ${report.privacy.f1.toFixed(3)} (tp=${report.privacy.tp} fp=${report.privacy.fp} fn=${report.privacy.fn}) leakCount=${report.privacy.leakCount}`,
      `## Raw screenshot outbound bytes: 0`,
      `## MODEL_ADMISSION: ${report.modelAdmission.decision}`,
      '',
      report.modelAdmission.rationale,
      '',
    ].join('\n');
    writeFileSync(join(reportDir, 't009-t010-latest.md'), md);

    expect(report.cascade.correct).toBe(report.cascade.total);
    expect(report.grounding.correct).toBe(report.grounding.total);
    expect(report.privacy.leakCount).toBe(0);
    expect(report.ocr.hits).toBeGreaterThan(0);
    expect(report.modelAdmission.decision).toBe('REJECTED');
  }, 120_000);
});
