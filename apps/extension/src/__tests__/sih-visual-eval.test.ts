/**
 * SIH visual evaluation harness (T009/T010 historical writer).
 * T019/T020 formal visual RESULT is written by bench-t019.test.ts to t019-t020-*.json.
 */
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { runVisualEval } from '../eval/visual-bench.js';

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

    expect(report.cascade.correct).toBe(report.cascade.total);
    expect(report.grounding.correct).toBe(report.grounding.total);
    expect(report.privacy.leakCount).toBe(0);
    expect(report.ocr.hits).toBeGreaterThan(0);
    expect(report.modelAdmission.decision).toBe('REJECTED');
  }, 120_000);
});
