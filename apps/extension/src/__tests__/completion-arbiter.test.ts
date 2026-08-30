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

  it('treats naturalistic Search For X In Y Search Bar as search-submit, not type-only complete', () => {
    const goal = 'Search For OpenAi In Youtube Search Bar';
    const typedOnly = arbitratePlannerComplete({
      goal,
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(typedOnly.phase).toBe('ASK_USER');
    expect(typedOnly.kind).toBe('PARTIAL');
    expect(typedOnly.phase).not.toBe('COMPLETED');

    const typedAndClicked = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
    });
    expect(typedAndClicked.phase).toBe('ASK_USER');
    expect(typedAndClicked.kind).toBe('PARTIAL');
    expect(typedAndClicked.message).not.toMatch(/Typed text and search action were verified locally/);

    const typedClickedAndNavigated = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(typedClickedAndNavigated.phase).toBe('COMPLETED');
    expect(typedClickedAndNavigated.kind).toBe('VERIFIED_SEQUENCE');
    expect(typedClickedAndNavigated.message).toMatch(/Typed text and search action were verified locally/);
  });

  it('treats search-for as partial until a verified search outcome exists', () => {
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
