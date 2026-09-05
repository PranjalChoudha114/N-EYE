import type { FieldValueState, LocalCompletionKind } from '@n-eye/protocol';
import { looksLikeSearchSubmitGoal, parseMockGoal } from '../planner/mock-grammar.js';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
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
  /** URL/origin transition after a verified action. Not click() and not field MATCHED. */
  verifiedSearchOutcome?: boolean;
  /**
   * Composite search-then-open: the tail resource was uniquely activated after search proof.
   * TRUST: Step count is not this signal. TYPE→SCROLL→search-CLICK must not count as opened.
   */
  verifiedResourceOpen?: boolean;
  /**
   * Privacy-safe navigation/title haystack after the last verified action (origin+path, sanitized title).
   * TRUST: Used to refuse task-complete when search navigated somewhere that does not mention the query.
   */
  outcomeEvidenceHay?: string;
}

export interface CompletionDecision {
  kind: LocalCompletionKind;
  phase: Extract<ProductPhase, 'COMPLETED' | 'ASK_USER'>;
  message: string;
  alreadySatisfied: boolean;
}

const ACTIONABLE = new Set(['CLICK', 'TYPE_TEXT', 'TYPE_TOKEN', 'SELECT']);

function compactHay(text: string): string {
  return text.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Search/navigation task success needs the query to appear in the observed destination evidence.
 * Missing haystack preserves prior behavior (do not invent a destination check).
 */
export function queryMentionedInOutcome(query: string | undefined, hay: string | undefined): boolean {
  if (!hay) return true;
  const raw = (query || '').trim();
  if (raw.length < 3) return true;
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const hayCompact = compactHay(hay);
  const hits = tokens.filter((t) => hayCompact.includes(t)).length;
  return hits >= Math.ceil(tokens.length * 0.5);
}

export function arbitratePlannerComplete(facts: CompletionFacts): CompletionDecision {
  const intent = parseMockGoal(facts.goal);
  const searchSubmit =
    (intent.kind === 'type_text' && intent.requiresSearchSubmit) || looksLikeSearchSubmitGoal(facts.goal);

  if (searchSubmit) {
    const fieldOverwritten =
      facts.liveFieldState === 'EMPTY' ||
      facts.liveFieldState === 'DIVERGED' ||
      facts.lastFieldState === 'EMPTY' ||
      facts.lastFieldState === 'DIVERGED';
    const typed =
      facts.lastFieldState === 'MATCHED' || facts.liveFieldState === 'MATCHED';
    // TRUST: TYPE_TEXT MATCHED proves typing. Search requires a verified resulting-state transition.
    if (facts.verifiedSearchOutcome === true && typed && !fieldOverwritten) {
      const interpreted = interpretGoal(facts.goal);
      if (interpreted.family === 'MULTI_STEP' && interpreted.tailEntity) {
        if (facts.verifiedResourceOpen !== true) {
          return {
            kind: 'PARTIAL',
            phase: 'ASK_USER',
            message:
              'Search was verified, but the requested resource was not opened. This is not task completion.',
            alreadySatisfied: false,
          };
        }
      }
      if (!queryMentionedInOutcome(interpreted.queryText || interpreted.entity, facts.outcomeEvidenceHay)) {
        return {
          kind: 'PARTIAL',
          phase: 'ASK_USER',
          message:
            'Navigation occurred, but the resulting page does not mention the requested query. This is not task completion.',
          alreadySatisfied: false,
        };
      }
      return {
        kind: 'VERIFIED_SEQUENCE',
        phase: 'COMPLETED',
        message: 'Typed text and search action were verified locally.',
        alreadySatisfied: false,
      };
    }
    if (fieldOverwritten && facts.verifiedCount >= 1) {
      return {
        kind: 'PARTIAL',
        phase: 'ASK_USER',
        message: 'The search field no longer holds the requested text. This is not task completion.',
        alreadySatisfied: false,
      };
    }
    if (typed && facts.verifiedClick && facts.verifiedSearchOutcome !== true) {
      return {
        kind: 'PARTIAL',
        phase: 'ASK_USER',
        message:
          'A search control was activated, but N-Eye could not verify that search actually occurred. This is not task completion.',
        alreadySatisfied: false,
      };
    }
    if (typed) {
      return {
        kind: 'PARTIAL',
        phase: 'ASK_USER',
        message: 'Text is in the search field, but search was not submitted. This is not task completion.',
        alreadySatisfied: false,
      };
    }
    return unproven();
  }

  if (intent.kind === 'click_labeled') {
    const interpreted = interpretGoal(facts.goal);
    if (
      interpreted.family === 'NAVIGATE' &&
      facts.verifiedCount >= 1 &&
      facts.lastVerifiedType &&
      ACTIONABLE.has(facts.lastVerifiedType)
    ) {
      if (!queryMentionedInOutcome(interpreted.entity, facts.outcomeEvidenceHay)) {
        return {
          kind: 'PARTIAL',
          phase: 'ASK_USER',
          message:
            'Navigation occurred, but the resulting page does not mention the requested resource. This is not task completion.',
          alreadySatisfied: false,
        };
      }
    }
  }

  if (facts.lastVerifiedType === 'SCROLL') {
    if (intent.kind === 'scroll') {
      return {
        kind: 'VERIFIED_SEQUENCE',
        phase: 'COMPLETED',
        message: 'Requested scroll was executed and verified locally.',
        alreadySatisfied: false,
      };
    }
    return unproven();
  }

  if (intent.kind === 'type_text') {
    const interpreted = interpretGoal(facts.goal);
    const typed =
      facts.lastFieldState === 'MATCHED' || facts.liveFieldState === 'MATCHED';
    const submitted =
      (facts.verifiedClick && facts.lastVerifiedType === 'CLICK') ||
      (facts.lastVerifiedType === 'PRESS_ENTER' && facts.verifiedSearchOutcome === true);
    const needsSubmitProof =
      interpreted.forbidSubmit !== true &&
      (interpreted.subgoals.includes('SUBMIT') ||
        (interpreted.family === 'MULTI_STEP' && interpreted.labelHints.includes('submit')));
    // TRUST: TYPE then CLICK Continue is not type-only success. Remaining ACTIVATE is still work.
    const needsTailActivate =
      interpreted.family === 'MULTI_STEP' &&
      interpreted.forbidSubmit !== true &&
      !needsSubmitProof &&
      (interpreted.subgoals.includes('ACTIVATE_TARGET') ||
        interpreted.subgoals.includes('PROVE_ACTIVATION') ||
        interpreted.subgoals.includes('CONTINUE'));
    if (needsSubmitProof) {
      if (typed && submitted) {
        return {
          kind: 'VERIFIED_SEQUENCE',
          phase: 'COMPLETED',
          message: 'Typed text and form submit were verified locally.',
          alreadySatisfied: false,
        };
      }
      if (typed) {
        return {
          kind: 'PARTIAL',
          phase: 'ASK_USER',
          message: 'The field holds the requested text, but the form was not submitted. This is not task completion.',
          alreadySatisfied: false,
        };
      }
      return unproven();
    }
    if (needsTailActivate) {
      if (typed && facts.verifiedClick && facts.lastVerifiedType === 'CLICK') {
        return {
          kind: 'VERIFIED_SEQUENCE',
          phase: 'COMPLETED',
          message: 'Typed text and the next requested control were verified locally.',
          alreadySatisfied: false,
        };
      }
      if (typed) {
        return {
          kind: 'PARTIAL',
          phase: 'ASK_USER',
          message:
            'The field holds the requested text, but the next requested control was not activated. This is not task completion.',
          alreadySatisfied: false,
        };
      }
      return unproven();
    }
    if (
      (facts.lastVerifiedType === 'TYPE_TEXT' || facts.lastVerifiedType === 'PRESS_ENTER') &&
      facts.lastFieldState === 'MATCHED'
    ) {
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

  if (intent.kind === 'select') {
    const interpreted = interpretGoal(facts.goal);
    const needsTailActivate =
      interpreted.family === 'MULTI_STEP' &&
      (interpreted.subgoals.includes('ACTIVATE_TARGET') ||
        interpreted.subgoals.includes('PROVE_ACTIVATION') ||
        interpreted.subgoals.includes('CONTINUE'));
    if (needsTailActivate) {
      if (facts.verifiedClick && facts.lastVerifiedType === 'CLICK') {
        return {
          kind: 'VERIFIED_SEQUENCE',
          phase: 'COMPLETED',
          message: 'Select and the next requested control were verified locally.',
          alreadySatisfied: false,
        };
      }
      if (facts.lastVerifiedType === 'SELECT') {
        return {
          kind: 'PARTIAL',
          phase: 'ASK_USER',
          message:
            'The option was selected, but the next requested control was not activated. This is not task completion.',
          alreadySatisfied: false,
        };
      }
      return unproven();
    }
    if (facts.lastVerifiedType === 'SELECT') {
      return {
        kind: 'VERIFIED_SEQUENCE',
        phase: 'COMPLETED',
        message: 'Required actions were executed and verified locally.',
        alreadySatisfied: false,
      };
    }
    return unproven();
  }

  // TRUST: PRESS_ENTER + navigation is not click-goal success. Search/type-submit already returned above.
  if (facts.lastVerifiedType === 'PRESS_ENTER') {
    return {
      kind: 'PARTIAL',
      phase: 'ASK_USER',
      message:
        'Enter was sent, but N-Eye could not prove the requested goal on the current page. This is not task completion.',
      alreadySatisfied: false,
    };
  }

  if (facts.verifiedCount >= 1 && facts.lastVerifiedType && ACTIONABLE.has(facts.lastVerifiedType)) {
    if (facts.lastVerifiedType === 'TYPE_TEXT' && looksLikeSearchSubmitGoal(facts.goal)) {
      return unproven();
    }
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
