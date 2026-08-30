/**
 * Runtime recovery taxonomy (Zone 2/3).
 *
 * OWNS: Named outcomes for planner, perception, and execution failures.
 * WHY: Failures must terminate in an explainable category — not ad-hoc catch strings.
 * INVARIANT: Recovery must never increase authority or egress. A retry uses the same
 *            protected SafeContext class. A restart must not reconstruct confirmation.
 */

export type RecoveryOutcome =
  | 'RETRY'
  | 'REOBSERVE'
  | 'REPLAN'
  | 'ASK_USER'
  | 'BLOCK'
  | 'DEGRADED'
  | 'CANCELLED'
  | 'UNSUPPORTED'
  | 'FAILED'
  | 'SAFE_REGROUND';

export type PlannerFailureClass =
  | 'RETRYABLE'
  | 'NON_RETRYABLE'
  | 'CANCELLED'
  | 'MALFORMED_RESPONSE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'MISCONFIGURED'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'UNKNOWN_SAFE_FAILURE';

export type PlannerTransportCode =
  | 'RATE_LIMITED'
  | 'MISCONFIGURED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'MALFORMED_RESPONSE'
  | 'CANCELLED'
  | 'AUTH_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_SAFE_FAILURE';

/** Local resulting-state evidence. Never includes the raw typed/token value. */
export type FieldValueState = 'MATCHED' | 'EMPTY' | 'DIVERGED' | 'UNREADABLE' | 'NOT_APPLICABLE';

export interface ExecutionEvidence {
  fieldState?: FieldValueState;
  scrollMoved?: boolean;
  atScrollBoundary?: boolean;
  selectMatched?: boolean;
}
