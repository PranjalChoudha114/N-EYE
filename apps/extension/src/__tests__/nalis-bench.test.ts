import { describe, expect, it } from 'vitest';
import { NALIS_CORPUS, runNalisIntelligenceBench } from '../intelligence/nalis-bench.js';
import { decideLocalLanguageModelAdmission, runGoalIntelligenceBench } from '../intelligence/admission-bench.js';

describe('NALIS intelligence benchmark', () => {
  it('has a frozen holdout split and scores wrong-action higher than ASK_USER', () => {
    const dev = NALIS_CORPUS.filter((c) => c.split === 'dev');
    const hold = NALIS_CORPUS.filter((c) => c.split === 'holdout');
    expect(dev.length).toBeGreaterThan(40);
    expect(hold.length).toBeGreaterThan(15);
    expect(new Set(hold.map((c) => c.id)).size).toBe(hold.length);
    const result = runNalisIntelligenceBench();
    expect(result.n).toBe(NALIS_CORPUS.length);
    expect(result.devN + result.holdoutN).toBe(result.n);
    expect(result.p50Ms).toBeGreaterThanOrEqual(0);
    expect(result.intentAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(result.entityAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(result.decompositionAccuracy).toBeGreaterThanOrEqual(0.5);
    expect(result.poisoningBlocked).toBeGreaterThan(0);
    expect(result.memoryPrivacyBlocked).toBeGreaterThan(0);
    expect(result.invalidSchemaCaught).toBe(1);
    expect(result.falseCompletionCaught).toBeGreaterThan(0);
    expect(result.wrongAction).toBeLessThan(result.n * 0.2);
    expect(result.localModelDecision).toBe('REJECT');
    expect(result.warmMs).toBeLessThan(25);
    const holdout = runNalisIntelligenceBench('holdout');
    expect(holdout.n).toBe(hold.length);
    expect(holdout.intentAccuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps ADR-0015 local LLM admission REJECTED on the language bench', () => {
    const bench = runGoalIntelligenceBench();
    expect(decideLocalLanguageModelAdmission(bench).decision).toBe('REJECT');
  });
});
