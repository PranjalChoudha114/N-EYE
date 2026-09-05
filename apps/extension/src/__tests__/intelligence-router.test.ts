import { describe, expect, it } from 'vitest';
import { createActionId, createElementId } from '@n-eye/protocol';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { decideReasoningSource } from '../intelligence/router.js';

describe('Intelligence router', () => {
  it('keeps MOCK exclusive to deterministic local reasoning', () => {
    const decision = decideReasoningSource({
      mode: 'MOCK',
      policy: 'capability',
      interpreted: interpretGoal('Open N-EYE'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'ASK_USER',
        reasoning: 'outside the Mock planner grammar',
        expectedOutcome: 'ask',
        riskLevel: 'LOW',
      },
    });
    expect(decision.source).toBe('DETERMINISTIC_LOCAL');
  });

  it('exclusive REMOTE never pretends Mock is the remote provider', () => {
    const decision = decideReasoningSource({
      mode: 'REMOTE',
      policy: 'exclusive',
      interpreted: interpretGoal('Open N-EYE'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'CLICK',
        targetId: createElementId('e1'),
        reasoning: 'unique',
        expectedOutcome: 'clicked',
        riskLevel: 'LOW',
      },
    });
    expect(decision.source).toBe('REMOTE_PROVIDER');
  });

  it('capability policy uses deterministic when uniquely grounded', () => {
    const decision = decideReasoningSource({
      mode: 'REMOTE',
      policy: 'capability',
      interpreted: interpretGoal('Click Continue'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'CLICK',
        targetId: createElementId('e1'),
        reasoning: 'unique continue',
        expectedOutcome: 'clicked',
        riskLevel: 'LOW',
      },
    });
    expect(decision.source).toBe('DETERMINISTIC_LOCAL');
  });

  it('does not escalate ambiguous targets to Remote', () => {
    const decision = decideReasoningSource({
      mode: 'REMOTE',
      policy: 'capability',
      interpreted: interpretGoal('Click Continue'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'ASK_USER',
        reasoning: 'Multiple matching click targets. N-Eye will not guess which control to activate.',
        expectedOutcome: 'ask',
        riskLevel: 'LOW',
      },
    });
    expect(decision.source).toBe('ABSTAIN');
  });

  it('treats a uniquely grounded click as sufficient even when possessive confidence is low', () => {
    const decision = decideReasoningSource({
      mode: 'REMOTE',
      policy: 'capability',
      interpreted: interpretGoal('Open my repo'),
      deterministicProposal: {
        actionId: createActionId('a'),
        type: 'CLICK',
        targetId: createElementId('e1'),
        reasoning: 'unique preferred repo',
        expectedOutcome: 'clicked',
        riskLevel: 'LOW',
      },
    });
    expect(decision.source).toBe('DETERMINISTIC_LOCAL');
    expect(interpretGoal('Open my repo').confidence).toBeLessThan(0.7);
  });
});
