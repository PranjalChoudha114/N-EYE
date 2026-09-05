import { describe, expect, it } from 'vitest';
import { createElementId, createPageEpoch, createTaskId, type SafeContext } from '@n-eye/protocol';
import {
  MAX_EXPLORE_SCROLLS,
  explorationSignature,
  shouldExploreForMissingTarget,
} from '../intelligence/exploration-policy.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';

function context(goal: string): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-explore'),
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: goal,
    pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
    safeElements: [
      {
        id: createElementId('e1'),
        role: 'button',
        safeLabel: 'Home',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 40, height: 20 },
      },
    ],
    availableTokens: [],
  };
}

describe('Bounded exploration policy', () => {
  it('allows a finite SCROLL when grounding found nothing', () => {
    const verdict = shouldExploreForMissingTarget({
      groundingReason: 'none',
      exploreScrollsUsed: 0,
      lastSignature: null,
      nextSignature: 'e1|button|Home|0',
    });
    expect(verdict.explore).toBe(true);
    expect(MAX_EXPLORE_SCROLLS).toBeLessThanOrEqual(2);
  });

  it('does not scroll to break an ambiguous tie', () => {
    const verdict = shouldExploreForMissingTarget({
      groundingReason: 'ambiguous',
      exploreScrollsUsed: 0,
      lastSignature: null,
      nextSignature: 'x',
    });
    expect(verdict.explore).toBe(false);
  });

  it('stops when the semantic signature is unchanged after a scroll', () => {
    const sig = explorationSignature([
      { id: 'e1', role: 'button', safeLabel: 'Home', bbox: { y: 0 } },
    ]);
    const verdict = shouldExploreForMissingTarget({
      groundingReason: 'none',
      exploreScrollsUsed: 1,
      lastSignature: sig,
      nextSignature: sig,
      priorSummary: 'Scroll position changed.',
    });
    expect(verdict.explore).toBe(false);
  });

  it('stops at a documented scroll boundary', () => {
    const verdict = shouldExploreForMissingTarget({
      groundingReason: 'none',
      exploreScrollsUsed: 0,
      lastSignature: null,
      nextSignature: 'x',
      priorSummary: 'Already at scroll boundary; no additional movement.',
    });
    expect(verdict.explore).toBe(false);
  });

  it('planner proposes SCROLL then ASK_USER rather than looping', async () => {
    const planner = new DeterministicPlanner();
    const page = context('Click the Missing Control');
    const first = await planner.proposeAction(page);
    expect(first.proposal.type).toBe('SCROLL');
    expect(first.proposal.reasoning).toMatch(/exploration, not completion/i);
    const second = await planner.proposeAction({
      ...page,
      priorOutcome: {
        actionId: first.proposal.actionId,
        status: 'VERIFIED',
        summary: 'Scroll position changed.',
      },
    });
    expect(['SCROLL', 'ASK_USER']).toContain(second.proposal.type);
    const third = await planner.proposeAction({
      ...page,
      priorOutcome: {
        actionId: second.proposal.actionId,
        status: 'VERIFIED',
        summary: 'Scroll position changed.',
      },
    });
    expect(third.proposal.type).toBe('ASK_USER');
    expect(third.proposal.type).not.toBe('COMPLETE');
  });
});
