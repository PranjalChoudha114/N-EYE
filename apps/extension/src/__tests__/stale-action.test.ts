import { describe, it, expect } from 'vitest';
import { decideStaleActionOutcome } from '../authority/stale-action.js';

const ok = {
  originCompatible: true,
  targetExists: true,
  targetVisible: true,
  targetEnabled: true,
  frameMatches: true,
  semanticMatches: true,
  tokenScopeValid: true,
  riskStillValid: true,
};

describe('Stale-action contract', () => {
  it('safe-regrounds a unique matching live target', () => {
    const decided = decideStaleActionOutcome({
      checks: ok,
      uniqueSemanticCandidate: true,
      ambiguousCandidates: false,
      semanticChangedOnLiveNode: false,
      frameInaccessible: false,
    });
    expect(decided.outcome).toBe('SAFE_REGROUND');
  });

  it('blocks semantic swap and inaccessible frames', () => {
    expect(
      decideStaleActionOutcome({
        checks: ok,
        uniqueSemanticCandidate: true,
        ambiguousCandidates: false,
        semanticChangedOnLiveNode: true,
        frameInaccessible: false,
      }).outcome
    ).toBe('BLOCK');
    expect(
      decideStaleActionOutcome({
        checks: ok,
        uniqueSemanticCandidate: true,
        ambiguousCandidates: false,
        semanticChangedOnLiveNode: false,
        frameInaccessible: true,
      }).outcome
    ).toBe('BLOCK');
  });

  it('abstains on duplicate candidates and reobserves missing targets', () => {
    expect(
      decideStaleActionOutcome({
        checks: ok,
        uniqueSemanticCandidate: false,
        ambiguousCandidates: true,
        semanticChangedOnLiveNode: false,
        frameInaccessible: false,
      }).outcome
    ).toBe('REOBSERVE');
    expect(
      decideStaleActionOutcome({
        checks: { ...ok, targetExists: false, targetVisible: false, targetEnabled: false, semanticMatches: false },
        uniqueSemanticCandidate: false,
        ambiguousCandidates: false,
        semanticChangedOnLiveNode: false,
        frameInaccessible: false,
      }).outcome
    ).toBe('REOBSERVE');
  });
});
