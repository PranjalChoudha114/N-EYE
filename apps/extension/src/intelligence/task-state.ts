/**
 * Local task/subgoal state (Zone 3).
 *
 * OWNS: Remaining work for a composite goal after each verified observation.
 * TRUST: Completion is still decided by the local arbiter from fresh evidence.
 * MUST NOT: Treat planner COMPLETE or step count as success.
 */

import type { InterpretedGoal, SubgoalKind } from './types.js';

export interface TaskGoalState {
  interpreted: InterpretedGoal;
  completed: SubgoalKind[];
  remaining: SubgoalKind[];
  attemptCount: number;
  lastFailureClass?: string;
}

export function createTaskGoalState(interpreted: InterpretedGoal): TaskGoalState {
  return {
    interpreted,
    completed: [],
    remaining: [...interpreted.subgoals],
    attemptCount: 0,
  };
}

export function markSubgoalComplete(state: TaskGoalState, kind: SubgoalKind): TaskGoalState {
  if (!state.remaining.includes(kind) && !state.completed.includes(kind)) {
    return state;
  }
  return {
    ...state,
    completed: state.completed.includes(kind) ? state.completed : [...state.completed, kind],
    remaining: state.remaining.filter((item) => item !== kind),
  };
}

/**
 * Advance SEARCH / type-then-act after a verified local outcome.
 * WHY: Typing proof is not search proof. Submit proof is not navigation proof.
 */
export function reconcileAfterVerifiedAction(
  state: TaskGoalState,
  verifiedType: string,
  facts: { fieldMatched?: boolean; navigation?: boolean }
): TaskGoalState {
  let next = { ...state, remaining: [...state.remaining], completed: [...state.completed] };
  if (verifiedType === 'TYPE_TEXT' || verifiedType === 'TYPE_TOKEN') {
    if (facts.fieldMatched) {
      next = markSubgoalComplete(markSubgoalComplete(next, 'ENTER_QUERY'), 'PROVE_QUERY');
      next = markSubgoalComplete(next, 'FILL_FIELD');
      next = markSubgoalComplete(next, 'PROVE_FIELD');
    }
  }
  if (verifiedType === 'CLICK' || verifiedType === 'PRESS_ENTER') {
    if (next.remaining.includes('SUBMIT') || next.remaining.includes('IDENTIFY_SUBMIT')) {
      next = markSubgoalComplete(markSubgoalComplete(next, 'IDENTIFY_SUBMIT'), 'SUBMIT');
      if (facts.navigation) {
        next = markSubgoalComplete(next, 'PROVE_SEARCH_OUTCOME');
      }
    } else {
      next = markSubgoalComplete(next, 'ACTIVATE_TARGET');
      if (facts.navigation) {
        next = markSubgoalComplete(next, 'PROVE_ACTIVATION');
      }
    }
  }
  if (verifiedType === 'SELECT') {
    next = markSubgoalComplete(next, 'SELECT_OPTION');
  }
  if (verifiedType === 'SCROLL') {
    next = markSubgoalComplete(next, 'SCROLL_VIEW');
  }
  return next;
}

export function currentSubgoal(state: TaskGoalState): SubgoalKind | undefined {
  return state.remaining[0];
}

export function searchStillRequiresSubmit(state: TaskGoalState): boolean {
  return (
    (state.interpreted.family === 'SEARCH' || state.interpreted.requiresSearchSubmit) &&
    (state.remaining.includes('SUBMIT') || state.remaining.includes('PROVE_SEARCH_OUTCOME'))
  );
}
