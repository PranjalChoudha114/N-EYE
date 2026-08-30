import { describe, expect, it } from 'vitest';
import {
  arbitratePlannerComplete,
  completedStageContradiction,
  pipelineForAlreadySatisfied,
  pipelineForUnprovenComplete,
  pipelineForVerifiedCompletion,
} from '../runtime/completion-arbiter.js';
import { idlePipeline } from '../runtime/ui-snapshot.js';

describe('Local completion arbiter', () => {
  it('rejects planner COMPLETE with no local proof', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Type OpenAI in the YouTube search box',
      verifiedCount: 0,
      verifiedClick: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PLANNER_COMPLETE_UNPROVEN');
  });

  it('accepts verified TYPE_TEXT MATCHED for a type-only goal', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Type OpenAI in the search box',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(decision.phase).toBe('COMPLETED');
    expect(decision.kind).toBe('VERIFIED_SEQUENCE');
    expect(decision.alreadySatisfied).toBe(false);
  });

  it('treats search-for as partial until a verified click exists', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
  });

  it('allows already-satisfied only with a live field MATCHED and no actions', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Type OpenAI in the search box',
      verifiedCount: 0,
      verifiedClick: false,
      liveFieldState: 'MATCHED',
    });
    expect(decision.kind).toBe('ALREADY_SATISFIED');
    expect(decision.message).toMatch(/already satisfied/i);
  });

  it('forbids Completed with pending ACT/VERIFY unless already satisfied', () => {
    const pending = idlePipeline();
    expect(completedStageContradiction('COMPLETED', pending, false)).toBe(true);
    expect(completedStageContradiction('ASK_USER', pending, false)).toBe(false);
    const satisfied = pipelineForAlreadySatisfied(pending);
    expect(completedStageContradiction('COMPLETED', satisfied, true)).toBe(false);
    expect(completedStageContradiction('COMPLETED', { ...satisfied, VERIFY: 'pending' }, true)).toBe(true);
    const verified = pipelineForVerifiedCompletion(pending);
    expect(completedStageContradiction('COMPLETED', verified, false)).toBe(false);
    expect(completedStageContradiction('COMPLETED', pipelineForUnprovenComplete(pending), false)).toBe(true);
  });
});
