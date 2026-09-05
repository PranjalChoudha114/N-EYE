/**
 * Bounded recovery policy (Zone 3).
 *
 * OWNS: Whether a failed step may be retried without raising authority or egress.
 * INVARIANT: Uncertainty yields less authority, never more. Identical failures do not loop.
 */

export const MAX_IDENTICAL_ACTION_FAILURES = 2;
export const MAX_RECOVERY_ATTEMPTS = 3;

export type RecoveryFailureClass =
  | 'NO_STATE_CHANGE'
  | 'TARGET_MISSING'
  | 'AMBIGUOUS_TARGET'
  | 'VERIFICATION_FAILED'
  | 'PROVIDER_FAILURE'
  | 'RUNTIME_FAILURE'
  | 'CANCELLED';

export interface RecoverySnapshot {
  failureClass: RecoveryFailureClass;
  attemptedAction: string;
  observationEpoch: number;
  stateChanged: boolean;
  remainingRetryBudget: number;
  perceptionEscalationAllowed: boolean;
  remoteEscalationPermitted: boolean;
}

export function beginRecoveryBudget(): number {
  return MAX_RECOVERY_ATTEMPTS;
}

/**
 * Semantic no-progress key. Epoch is freshness, not identity.
 * WHY: A reminted pageEpoch without UI progress must not reset loop detection.
 */
export function identicalFailureKey(
  actionType: string,
  targetId: string | undefined,
  _epoch?: number,
  progressSignature = 'noprogress'
): string {
  void _epoch;
  return `${actionType}:${targetId || 'none'}:${progressSignature}`;
}

/**
 * FAIL-CLOSED: repeating the same unsuccessful action on an unchanged epoch is not recovery.
 */
export function shouldAbstainAfterFailure(args: {
  previousKey: string | null;
  nextKey: string;
  identicalCount: number;
  stateChanged: boolean;
  remainingRetryBudget: number;
}): { abstain: boolean; identicalCount: number; reason?: string } {
  if (args.remainingRetryBudget <= 0) {
    return { abstain: true, identicalCount: args.identicalCount, reason: 'Recovery budget exhausted.' };
  }
  // WHY: Epoch ticks are not progress. Only a different semantic failure key resets the streak.
  if (args.stateChanged && args.previousKey !== args.nextKey) {
    return { abstain: false, identicalCount: 1 };
  }
  const same = args.previousKey === args.nextKey;
  const identicalCount = same ? args.identicalCount + 1 : 1;
  if (identicalCount >= MAX_IDENTICAL_ACTION_FAILURES) {
    return {
      abstain: true,
      identicalCount,
      reason: 'The same action failed twice without a page-state change. N-Eye will not loop.',
    };
  }
  return { abstain: false, identicalCount };
}

/**
 * Provider/OCR failure must not widen the payload class or skip confirmation.
 */
export function remoteEscalationPermittedAfterFailure(
  failureClass: RecoveryFailureClass,
  remoteModeEnabled: boolean
): boolean {
  if (!remoteModeEnabled) return false;
  if (failureClass === 'AMBIGUOUS_TARGET' || failureClass === 'CANCELLED') return false;
  // Failure must not automatically escalate disclosure. Remote stays an explicit mode, same payload class.
  return false;
}
