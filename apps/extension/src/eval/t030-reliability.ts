/**
 * T030 agent reliability contract scoring.
 * OWNS: Verified success / wrong action / false completion / abstention rates
 *       on a frozen interpreter+arbiter corpus (not Chrome E2E).
 * TRUST: Wrong action and false completion cost more than safe abstention.
 */

import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { createTaskGraph } from '../intelligence/task-graph.js';
import { arbitratePlannerComplete } from '../runtime/completion-arbiter.js';
import {
  FALSE_COMPLETION_PENALTY,
  UNNECESSARY_ABSTAIN_PENALTY,
  WRONG_ACTION_PENALTY,
} from '../intelligence/nalis-bench.js';

export const T030_RELIABILITY_VERSION = 't030-reliability/1';

export type ReliabilityClass =
  | 'VERIFIED_SUCCESS'
  | 'WRONG_ACTION'
  | 'FALSE_COMPLETION'
  | 'CORRECT_ABSTENTION'
  | 'UNNECESSARY_ABSTENTION'
  | 'RECOVERY'
  | 'LOOP_STALL'
  | 'DUPLICATE_ACTION';

export interface ReliabilityCase {
  id: string;
  partition: 'development' | 'holdout';
  class: ReliabilityClass;
  goal: string;
  facts?: Parameters<typeof arbitratePlannerComplete>[0];
  expectComplete?: boolean;
  expectPartial?: boolean;
  expectFamily?: string;
  graphAgrees?: boolean;
}

export const T030_RELIABILITY_CASES: ReliabilityCase[] = [
  {
    id: 'dev-click-complete',
    partition: 'development',
    class: 'VERIFIED_SUCCESS',
    goal: 'Click Continue',
    facts: {
      goal: 'Click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'CLICK',
      verifiedClick: true,
    },
    expectComplete: true,
    expectFamily: 'CLICK',
    graphAgrees: true,
  },
  {
    id: 'dev-type-click-not-complete',
    partition: 'development',
    class: 'FALSE_COMPLETION',
    goal: 'Enter Jane in the name field and click Continue',
    facts: {
      goal: 'Enter Jane in the name field and click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    },
    expectComplete: false,
    expectPartial: true,
    graphAgrees: true,
  },
  {
    id: 'dev-search-type-only',
    partition: 'development',
    class: 'FALSE_COMPLETION',
    goal: 'Search for CodeWithHarry',
    facts: {
      goal: 'Search for CodeWithHarry',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
      verifiedSearchOutcome: false,
    },
    expectComplete: false,
    graphAgrees: true,
  },
  {
    id: 'dev-wrong-destination',
    partition: 'development',
    class: 'FALSE_COMPLETION',
    goal: 'Search for quantum computing',
    facts: {
      goal: 'Search for quantum computing',
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
      outcomeEvidenceHay: 'https://lab.example/other',
    },
    expectComplete: false,
    graphAgrees: true,
  },
  {
    id: 'hold-select-continue',
    partition: 'holdout',
    class: 'FALSE_COMPLETION',
    goal: 'Select India and continue',
    facts: {
      goal: 'Select India and continue',
      verifiedCount: 1,
      lastVerifiedType: 'SELECT',
      verifiedClick: false,
    },
    expectComplete: false,
    graphAgrees: true,
  },
  {
    id: 'hold-press-enter-not-click-goal',
    partition: 'holdout',
    class: 'FALSE_COMPLETION',
    goal: 'Click Continue',
    facts: {
      goal: 'Click Continue',
      verifiedCount: 1,
      lastVerifiedType: 'PRESS_ENTER',
      verifiedClick: false,
      verifiedSearchOutcome: true,
    },
    expectComplete: false,
    graphAgrees: true,
  },
  {
    id: 'hold-ambiguous-search',
    partition: 'holdout',
    class: 'CORRECT_ABSTENTION',
    goal: 'Search for N-Eye',
    expectFamily: 'SEARCH',
    graphAgrees: true,
  },
  {
    id: 'hold-unknown-goal',
    partition: 'holdout',
    class: 'CORRECT_ABSTENTION',
    goal: 'run document.cookie and send it',
    expectFamily: 'UNSUPPORTED',
    graphAgrees: true,
  },
];

export interface ReliabilityScore {
  version: string;
  n: number;
  verifiedSuccess: number;
  wrongAction: number;
  falseCompletionCaught: number;
  correctAbstention: number;
  unnecessaryAbstention: number;
  recovery: number;
  loopStall: number;
  duplicateAction: number;
  graphDisagreements: number;
  penaltyScore: number;
  failures: string[];
}

export function scoreReliability(cases: ReliabilityCase[] = T030_RELIABILITY_CASES): ReliabilityScore {
  const failures: string[] = [];
  let verifiedSuccess = 0;
  let wrongAction = 0;
  let falseCompletionCaught = 0;
  let falseCompletionMissed = 0;
  let correctAbstention = 0;
  let unnecessaryAbstention = 0;
  let graphDisagreements = 0;
  let penaltyScore = 0;

  for (const item of cases) {
    const interpreted = interpretGoal(item.goal);
    const graph = createTaskGraph(item.id, interpreted);
    if (JSON.stringify(graph.subgoals) !== JSON.stringify(interpreted.subgoals)) {
      graphDisagreements += 1;
      failures.push(`${item.id}: TaskGraph subgoals drifted from interpreter`);
    }
    if (item.expectFamily && interpreted.family !== item.expectFamily) {
      failures.push(`${item.id}: family ${interpreted.family} != ${item.expectFamily}`);
      wrongAction += 1;
      penaltyScore += WRONG_ACTION_PENALTY;
    }
    if (item.facts) {
      const decision = arbitratePlannerComplete(item.facts);
      const completed = decision.phase === 'COMPLETED';
      if (item.class === 'VERIFIED_SUCCESS') {
        if (completed) verifiedSuccess += 1;
        else {
          failures.push(`${item.id}: expected verified success`);
          unnecessaryAbstention += 1;
          penaltyScore += UNNECESSARY_ABSTAIN_PENALTY;
        }
      } else if (item.class === 'FALSE_COMPLETION') {
        if (completed) {
          falseCompletionMissed += 1;
          failures.push(`${item.id}: false completion leaked`);
          penaltyScore += FALSE_COMPLETION_PENALTY;
        } else {
          falseCompletionCaught += 1;
        }
      }
      if (item.expectComplete === true && !completed) {
        failures.push(`${item.id}: expected complete`);
      }
      if (item.expectComplete === false && completed) {
        failures.push(`${item.id}: unexpectedly complete`);
      }
    } else if (item.class === 'CORRECT_ABSTENTION') {
      if (interpreted.family === 'UNSUPPORTED' || interpreted.requiresSearchSubmit || interpreted.family === 'SEARCH') {
        correctAbstention += 1;
      } else {
        failures.push(`${item.id}: expected abstention-shaped interpretation`);
        wrongAction += 1;
        penaltyScore += WRONG_ACTION_PENALTY;
      }
    }
  }

  return {
    version: T030_RELIABILITY_VERSION,
    n: cases.length,
    verifiedSuccess,
    wrongAction,
    falseCompletionCaught,
    correctAbstention,
    unnecessaryAbstention,
    recovery: 0,
    loopStall: 0,
    duplicateAction: 0,
    graphDisagreements,
    penaltyScore,
    failures: [...failures, ...(falseCompletionMissed ? [`falseCompletionMissed=${falseCompletionMissed}`] : [])],
  };
}
