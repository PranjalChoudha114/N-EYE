/**
 * NALIS failure taxonomy (Zone 3).
 *
 * OWNS: Named intelligence/perception/recovery failures.
 * TRUST: Failures never raise authority, widen egress, or skip confirmation.
 * MUST NOT: Carry raw secrets, vault mappings, or model chain-of-thought.
 */

import type { RecoveryOutcome } from '@n-eye/protocol';

export const NALIS_VERSION = '1.0.0';

export type NalisFailureCode =
  | 'GOAL_UNDERSTOOD_LOW_CONFIDENCE'
  | 'GOAL_AMBIGUOUS'
  | 'UNSUPPORTED_INTENT'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_BELOW_VIEWPORT'
  | 'TARGET_AMBIGUOUS'
  | 'TARGET_STALE'
  | 'TARGET_OCCLUDED'
  | 'TARGET_DISABLED'
  | 'FRAME_INACCESSIBLE'
  | 'SHADOW_INACCESSIBLE'
  | 'VISUAL_EVIDENCE_REQUIRED'
  | 'OCR_FAILED'
  | 'VISUAL_GROUNDING_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_INIT_FAILED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_INVALID_OUTPUT'
  | 'WEBGPU_UNAVAILABLE'
  | 'WASM_FAILED'
  | 'REMOTE_UNAVAILABLE'
  | 'REMOTE_INVALID_OUTPUT'
  | 'PRIVACY_BLOCKED'
  | 'RISK_CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_STALE'
  | 'EXECUTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'NO_PROGRESS_LOOP'
  | 'BUDGET_EXHAUSTED'
  | 'USER_CANCELLED'
  | 'FALSE_COMPLETION'
  | 'MEMORY_UNAVAILABLE'
  | 'UNSUPPORTED_CONTROL'
  | 'REMOTE_TIMEOUT'
  | 'INVALID_PROPOSAL'
  | 'PLATFORM_LIMITATION'
  | 'INTERNAL_ERROR';

export interface FailureRecord {
  stage: string;
  reasonCode: NalisFailureCode;
  safeEvidence: string;
  attemptedStrategies: string[];
  fallbackTaken: RecoveryOutcome;
  retryCount: number;
  recoverable: boolean;
  userActionRequired: boolean;
  timestamp: number;
}

export function mapFailureToRecovery(code: NalisFailureCode): {
  outcome: RecoveryOutcome;
  recoverable: boolean;
  userActionRequired: boolean;
} {
  switch (code) {
    case 'TARGET_NOT_FOUND':
    case 'TARGET_BELOW_VIEWPORT':
      return { outcome: 'REOBSERVE', recoverable: true, userActionRequired: false };
    case 'TARGET_STALE':
    case 'TARGET_OCCLUDED':
      return { outcome: 'SAFE_REGROUND', recoverable: true, userActionRequired: false };
    case 'TARGET_AMBIGUOUS':
    case 'GOAL_AMBIGUOUS':
    case 'NO_PROGRESS_LOOP':
    case 'BUDGET_EXHAUSTED':
    case 'UNSUPPORTED_INTENT':
      return { outcome: 'ASK_USER', recoverable: false, userActionRequired: true };
    case 'MODEL_UNAVAILABLE':
    case 'MODEL_INIT_FAILED':
    case 'MODEL_TIMEOUT':
    case 'MODEL_INVALID_OUTPUT':
    case 'WEBGPU_UNAVAILABLE':
    case 'WASM_FAILED':
    case 'MEMORY_UNAVAILABLE':
      return { outcome: 'DEGRADED', recoverable: true, userActionRequired: false };
    case 'REMOTE_UNAVAILABLE':
    case 'REMOTE_INVALID_OUTPUT':
      return { outcome: 'DEGRADED', recoverable: true, userActionRequired: false };
    case 'PRIVACY_BLOCKED':
    case 'CONFIRMATION_STALE':
    case 'FALSE_COMPLETION':
      return { outcome: 'BLOCK', recoverable: false, userActionRequired: false };
    case 'RISK_CONFIRMATION_REQUIRED':
      return { outcome: 'ASK_USER', recoverable: true, userActionRequired: true };
    case 'USER_CANCELLED':
      return { outcome: 'CANCELLED', recoverable: false, userActionRequired: false };
    case 'FRAME_INACCESSIBLE':
    case 'SHADOW_INACCESSIBLE':
      return { outcome: 'UNSUPPORTED', recoverable: false, userActionRequired: true };
    case 'OCR_FAILED':
    case 'VISUAL_GROUNDING_FAILED':
    case 'VISUAL_EVIDENCE_REQUIRED':
      return { outcome: 'DEGRADED', recoverable: true, userActionRequired: false };
    case 'VERIFICATION_FAILED':
    case 'EXECUTION_FAILED':
      return { outcome: 'REPLAN', recoverable: true, userActionRequired: false };
    case 'REMOTE_TIMEOUT':
      return { outcome: 'DEGRADED', recoverable: true, userActionRequired: false };
    case 'INVALID_PROPOSAL':
    case 'INTERNAL_ERROR':
      return { outcome: 'BLOCK', recoverable: false, userActionRequired: false };
    case 'PLATFORM_LIMITATION':
    case 'UNSUPPORTED_CONTROL':
      return { outcome: 'ASK_USER', recoverable: false, userActionRequired: true };
    default:
      return { outcome: 'ASK_USER', recoverable: false, userActionRequired: true };
  }
}

export function createFailureRecord(
  stage: string,
  reasonCode: NalisFailureCode,
  safeEvidence: string,
  extras?: Partial<FailureRecord>
): FailureRecord {
  const mapped = mapFailureToRecovery(reasonCode);
  return {
    stage,
    reasonCode,
    safeEvidence,
    attemptedStrategies: extras?.attemptedStrategies || [],
    fallbackTaken: extras?.fallbackTaken || mapped.outcome,
    retryCount: extras?.retryCount || 0,
    recoverable: extras?.recoverable ?? mapped.recoverable,
    userActionRequired: extras?.userActionRequired ?? mapped.userActionRequired,
    timestamp: extras?.timestamp || Date.now(),
  };
}
