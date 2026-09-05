import { describe, expect, it } from 'vitest';
import {
  MAX_IDENTICAL_ACTION_FAILURES,
  identicalFailureKey,
  remoteEscalationPermittedAfterFailure,
  shouldAbstainAfterFailure,
} from '../intelligence/recovery-policy.js';

describe('Bounded recovery policy', () => {
  it('abstains after identical failures on an unchanged epoch', () => {
    const key = identicalFailureKey('CLICK', 'e1', 4);
    const first = shouldAbstainAfterFailure({
      previousKey: null,
      nextKey: key,
      identicalCount: 0,
      stateChanged: false,
      remainingRetryBudget: 3,
    });
    expect(first.abstain).toBe(false);
    const second = shouldAbstainAfterFailure({
      previousKey: key,
      nextKey: key,
      identicalCount: first.identicalCount,
      stateChanged: false,
      remainingRetryBudget: 2,
    });
    expect(second.identicalCount).toBe(MAX_IDENTICAL_ACTION_FAILURES);
    expect(second.abstain).toBe(true);
    expect(second.reason).toMatch(/will not loop/i);
  });

  it('does not reset the identical-failure streak on a meaningless epoch change', () => {
    const key = identicalFailureKey('CLICK', 'submit:Submit', 4);
    const nextEpochSameSemantic = identicalFailureKey('CLICK', 'submit:Submit', 9);
    expect(nextEpochSameSemantic).toBe(key);
    const first = shouldAbstainAfterFailure({
      previousKey: key,
      nextKey: nextEpochSameSemantic,
      identicalCount: 1,
      stateChanged: true,
      remainingRetryBudget: 2,
    });
    expect(first.abstain).toBe(true);
  });

  it('does not escalate Remote disclosure after a local failure', () => {
    expect(remoteEscalationPermittedAfterFailure('VERIFICATION_FAILED', true)).toBe(false);
    expect(remoteEscalationPermittedAfterFailure('AMBIGUOUS_TARGET', true)).toBe(false);
    expect(remoteEscalationPermittedAfterFailure('PROVIDER_FAILURE', false)).toBe(false);
  });

  it('stops when the retry budget is exhausted even if the page changed', () => {
    const verdict = shouldAbstainAfterFailure({
      previousKey: 'CLICK:e1:3',
      nextKey: 'CLICK:e2:4',
      identicalCount: 1,
      stateChanged: true,
      remainingRetryBudget: 0,
    });
    expect(verdict.abstain).toBe(true);
    expect(verdict.reason).toMatch(/budget exhausted/i);
  });
});
