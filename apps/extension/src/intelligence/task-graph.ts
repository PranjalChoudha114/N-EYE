/**
 * TaskGraph (Zone 3) — first-class task state for NALIS.
 *
 * OWNS: Subgoals, success contracts, exploration/replan budgets, failure history.
 * TRUST: Completion remains a local arbiter decision from fresh evidence.
 * MUST NOT: Treat SCROLL, planner COMPLETE, or step count as goal success.
 */

import type { IntentFamily, InterpretedGoal, SubgoalKind } from './types.js';
import { createTaskGoalState, type TaskGoalState } from './task-state.js';
import { MAX_EXPLORE_SCROLLS } from './exploration-policy.js';
import type { FailureRecord } from './failure-taxonomy.js';

export const MAX_REPLANS = 3;
export const MAX_VISUAL_ESCALATIONS = 2;
export const MAX_CANDIDATE_RETRIES = 2;

export type SuccessContractKind =
  | 'SEARCH'
  | 'OPEN_RESOURCE'
  | 'TYPE'
  | 'SUBMIT'
  | 'FIND'
  | 'SCROLL'
  | 'COMPOSITE'
  | 'ABSTAIN';

export interface SuccessContract {
  kind: SuccessContractKind;
  observable: string;
}

export interface TaskGraph {
  taskId: string;
  originalGoal: string;
  normalizedGoal: string;
  intent: IntentFamily;
  entities: string[];
  constraints: string[];
  subgoals: SubgoalKind[];
  currentSubgoal?: SubgoalKind;
  completedSubgoals: SubgoalKind[];
  pendingSubgoals: SubgoalKind[];
  successContract: SuccessContract;
  failureHistory: FailureRecord[];
  explorationBudget: number;
  replanBudget: number;
  visualEscalationBudget: number;
  privacyNeed: 'NONE' | 'MINIMIZE' | 'NEVER_SEND';
  createdAt: number;
  cancelled: boolean;
  askUserContinuation: boolean;
  runtime: TaskGoalState;
}

export function successContractFor(interpreted: InterpretedGoal): SuccessContract {
  if (interpreted.family === 'MULTI_STEP') {
    return {
      kind: 'COMPOSITE',
      observable: interpreted.expectedPostcondition,
    };
  }
  if (interpreted.family === 'SEARCH' || interpreted.requiresSearchSubmit) {
    return {
      kind: 'SEARCH',
      observable: 'Typed query is present and a verified search/navigation outcome is observed.',
    };
  }
  if (interpreted.family === 'FORM_FILL') {
    return {
      kind: interpreted.forbidSubmit ? 'TYPE' : 'TYPE',
      observable: interpreted.expectedPostcondition,
    };
  }
  if (interpreted.family === 'SCROLL') {
    return {
      kind: 'SCROLL',
      observable: 'Viewport or container scroll position changes or is at a boundary. SCROLL is never search/click success.',
    };
  }
  if (interpreted.family === 'UNSUPPORTED') {
    return { kind: 'ABSTAIN', observable: 'Ask the user rather than invent success.' };
  }
  if (interpreted.family === 'FIND') {
    return { kind: 'FIND', observable: interpreted.expectedPostcondition };
  }
  return { kind: 'OPEN_RESOURCE', observable: interpreted.expectedPostcondition };
}

export function createTaskGraph(taskId: string, interpreted: InterpretedGoal): TaskGraph {
  const runtime = createTaskGoalState(interpreted);
  return {
    taskId,
    originalGoal: interpreted.rawGoal,
    normalizedGoal: interpreted.rawGoal,
    intent: interpreted.family,
    entities: [interpreted.entity, interpreted.tailEntity, interpreted.queryText].filter(
      (item): item is string => Boolean(item)
    ),
    constraints: interpreted.constraints,
    subgoals: [...interpreted.subgoals],
    currentSubgoal: runtime.remaining[0],
    completedSubgoals: [],
    pendingSubgoals: [...runtime.remaining],
    successContract: successContractFor(interpreted),
    failureHistory: [],
    explorationBudget: MAX_EXPLORE_SCROLLS,
    replanBudget: MAX_REPLANS,
    visualEscalationBudget: MAX_VISUAL_ESCALATIONS,
    privacyNeed: 'MINIMIZE',
    createdAt: Date.now(),
    cancelled: false,
    askUserContinuation: false,
    runtime,
  };
}

export function syncGraphFromRuntime(graph: TaskGraph, runtime: TaskGoalState): TaskGraph {
  return {
    ...graph,
    runtime,
    completedSubgoals: [...runtime.completed],
    pendingSubgoals: [...runtime.remaining],
    currentSubgoal: runtime.remaining[0],
  };
}

export function recordGraphFailure(graph: TaskGraph, failure: FailureRecord): TaskGraph {
  return {
    ...graph,
    failureHistory: [...graph.failureHistory, failure],
    replanBudget: Math.max(0, graph.replanBudget - 1),
  };
}

export function consumeExploration(graph: TaskGraph): TaskGraph {
  return { ...graph, explorationBudget: Math.max(0, graph.explorationBudget - 1) };
}

export function compositeStillNeedsResourceOpen(interpreted: InterpretedGoal, remaining: SubgoalKind[]): boolean {
  return (
    interpreted.family === 'MULTI_STEP' &&
    Boolean(interpreted.tailEntity) &&
    (remaining.includes('ACTIVATE_TARGET') || remaining.includes('PROVE_ACTIVATION'))
  );
}
