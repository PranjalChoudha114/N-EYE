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

    const typedEnterAndNavigated = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'PRESS_ENTER',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(typedEnterAndNavigated.phase).toBe('COMPLETED');
    expect(typedEnterAndNavigated.kind).toBe('VERIFIED_SEQUENCE');

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

  it('does not complete a composite search-then-open goal after search proof alone', () => {
    const afterSearch = arbitratePlannerComplete({
      goal: 'Search YouTube for CodeWithHarry and open the latest C tutorial',
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(afterSearch.phase).toBe('ASK_USER');
    expect(afterSearch.kind).toBe('PARTIAL');
    expect(afterSearch.message).toMatch(/resource was not opened/i);

    const afterOpen = arbitratePlannerComplete({
      goal: 'Search YouTube for CodeWithHarry and open the latest C tutorial',
      verifiedCount: 3,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
      verifiedResourceOpen: true,
    });
    expect(afterOpen.phase).toBe('COMPLETED');
    expect(afterOpen.kind).toBe('VERIFIED_SEQUENCE');

    const typeScrollSearchClick = arbitratePlannerComplete({
      goal: 'Search YouTube for CodeWithHarry and open the latest C tutorial',
      verifiedCount: 3,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(typeScrollSearchClick.phase).toBe('ASK_USER');
    expect(typeScrollSearchClick.kind).toBe('PARTIAL');
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

  it('does not treat a verified PRESS_ENTER as completion of an unrelated click goal', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'PRESS_ENTER',
      verifiedClick: true,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
    expect(decision.phase).not.toBe('COMPLETED');
  });

  it('PRESS_ENTER plus navigation still does not complete an unrelated click goal', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'PRESS_ENTER',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
    expect(decision.phase).not.toBe('COMPLETED');
  });

  it('TYPE then click Continue does not complete after typing alone', () => {
    const goal = 'Enter Jane in the name field and click Continue';
    const typedOnly = arbitratePlannerComplete({
      goal,
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(typedOnly.phase).toBe('ASK_USER');
    expect(typedOnly.kind).toBe('PARTIAL');

    const typedAndClicked = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
    });
    expect(typedAndClicked.phase).toBe('COMPLETED');
  });

  it('TYPE then submit may complete via verified Enter navigation, not Enter dispatch alone', () => {
    const goal = 'Enter Pranjal Choudha in the Text input field and submit the form';
    const enterOnly = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'PRESS_ENTER',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: false,
    });
    expect(enterOnly.phase).toBe('ASK_USER');

    const enterNav = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'PRESS_ENTER',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(enterNav.phase).toBe('COMPLETED');
  });

  it('SELECT then continue does not complete after select alone', () => {
    const goal = 'Select India and continue';
    const selected = arbitratePlannerComplete({
      goal,
      verifiedCount: 1,
      lastVerifiedType: 'SELECT',
      verifiedClick: false,
    });
    expect(selected.phase).toBe('ASK_USER');
    expect(selected.kind).toBe('PARTIAL');
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
