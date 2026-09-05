import { describe, expect, it } from 'vitest';
import { decideLocalLanguageModelAdmission, runGoalIntelligenceBench } from '../intelligence/admission-bench.js';

describe('Local language-model admission bench', () => {
  it('measures deterministic parser vs regex baseline and rejects a heavy local LLM', () => {
    const bench = runGoalIntelligenceBench();
    expect(bench.n).toBeGreaterThanOrEqual(10);
    expect(bench.malformed).toBe(0);
    expect(bench.interpreterAccuracy).toBeGreaterThan(bench.baselineAccuracy);
    expect(bench.interpreterAccuracy).toBeGreaterThanOrEqual(0.8);
    expect(bench.warmMs).toBeLessThan(20);
    const admission = decideLocalLanguageModelAdmission(bench);
    expect(admission.decision).toBe('REJECT');
    expect(admission.rationale).toMatch(/not admitted/i);
  });
});
