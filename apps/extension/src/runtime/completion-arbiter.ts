import type { FieldValueState, LocalCompletionKind } from '@n-eye/protocol';
import { parseMockGoal } from '../planner/mock-grammar.js';
import type { PipelineState, ProductPhase } from './ui-snapshot.js';

/**
 * Local completion arbiter (Zone 3).
 *
 * OWNS: Whether a planner COMPLETE (or loop end) may become product COMPLETED.
 * TRUST: Planner COMPLETE is advice. Only local verified actions or a live field
 *        probe may prove success. Empty/no-action paths are not success.
 */

export interface CompletionFacts {
  goal: string;
  verifiedCount: number;
  lastVerifiedType?: string;
  lastFieldState?: FieldValueState;
  verifiedClick: boolean;
  liveFieldState?: FieldValueState;
}

export interface CompletionDecision {
  kind: LocalCompletionKind;
  phase: Extract<ProductPhase, 'COMPLETED' | 'ASK_USER'>;
  message: string;
  alreadySatisfied: boolean;
}

const ACTIONABLE = new Set(['CLICK', 'TYPE_TEXT', 'TYPE_TOKEN', 'SELECT', 'SCROLL']);

export function arbitratePlannerComplete(facts: CompletionFacts): CompletionDecision {
  const intent = parseMockGoal(facts.goal);

  if (intent.kind === 'type_text' && intent.requiresSearchSubmit) {
    if (facts.verifiedCount >= 1 && facts.verifiedClick && facts.lastFieldState === 'MATCHED') {
      return {
        kind: 'VERIFIED_SEQUENCE',
        phase: 'COMPLETED',
        message: 'Typed text and search action were verified locally.',
        alreadySatisfied: false,
      };
    }
    if (facts.lastFieldState === 'MATCHED' || facts.liveFieldState === 'MATCHED') {
      return {
        kind: 'PARTIAL',
        phase: 'ASK_USER',
        message: 'Text is in the search field, but search was not submitted. This is not task completion.',
        alreadySatisfied: false,
      };
    }
    return unproven();
  }

  if (intent.kind === 'type_text') {
    if (facts.lastVerifiedType === 'TYPE_TEXT' && facts.lastFieldState === 'MATCHED') {
      return {
        kind: 'VERIFIED_SEQUENCE',
        phase: 'COMPLETED',
        message: 'The live field holds the requested text (value not recorded).',
        alreadySatisfied: false,
      };
    }
    if (facts.verifiedCount === 0 && facts.liveFieldState === 'MATCHED') {
      return {
        kind: 'ALREADY_SATISFIED',
        phase: 'COMPLETED',
        message: 'Goal already satisfied. No action was required.',
        alreadySatisfied: true,
      };
    }
    return unproven();
  }

  if (facts.verifiedCount >= 1 && facts.lastVerifiedType && ACTIONABLE.has(facts.lastVerifiedType)) {
    return {
      kind: 'VERIFIED_SEQUENCE',
      phase: 'COMPLETED',
      message: 'Required actions were executed and verified locally.',
      alreadySatisfied: false,
    };
  }

  return unproven();
}

function unproven(): CompletionDecision {
  return {
    kind: 'PLANNER_COMPLETE_UNPROVEN',
    phase: 'ASK_USER',
    message:
      'The planner suggested completion, but N-Eye could not prove this goal on the current page. This is not success.',
    alreadySatisfied: false,
  };
}

/**
 * Green Completed with ACT/VERIFY still pending is a trust contradiction
 * unless the goal was proven already satisfied and VERIFY is skipped/done.
 */
export function completedStageContradiction(
  phase: ProductPhase,
  pipeline: PipelineState,
  alreadySatisfied: boolean
): boolean {
  if (phase !== 'COMPLETED') return false;
  if (alreadySatisfied) {
    return pipeline.ACT !== 'skipped' || (pipeline.VERIFY !== 'done' && pipeline.VERIFY !== 'skipped');
  }
  return pipeline.VALIDATE !== 'done' || pipeline.ACT !== 'done' || pipeline.VERIFY !== 'done';
}

export function pipelineForVerifiedCompletion(base: PipelineState): PipelineState {
  return { ...base, VALIDATE: 'done', ACT: 'done', VERIFY: 'done' };
}

export function pipelineForAlreadySatisfied(base: PipelineState): PipelineState {
  return { ...base, VALIDATE: 'skipped', ACT: 'skipped', VERIFY: 'done' };
}

export function pipelineForUnprovenComplete(base: PipelineState): PipelineState {
  return { ...base, VALIDATE: 'skipped', ACT: 'skipped', VERIFY: 'skipped' };
}
