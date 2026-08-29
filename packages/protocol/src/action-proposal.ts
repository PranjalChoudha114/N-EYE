import type { ActionId, ElementId, FrameId, PageEpoch, TokenId } from './identifiers.js';
import type { TargetFingerprint } from './fingerprint.js';

export type ActionType =
  | 'CLICK'
  | 'TYPE_TOKEN'
  | 'TYPE_TEXT'
  | 'SCROLL'
  | 'SELECT'
  | 'WAIT'
  | 'ASK_USER'
  | 'COMPLETE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

/**
 * ActionProposal: Untrusted advice returned by the remote planner.
 * Must be validated locally against the live DOM and risk policies before execution.
 */
export interface ActionProposal {
  actionId: ActionId;
  type: ActionType;
  targetId?: ElementId;
  tokenId?: TokenId;
  tokenSymbol?: string; // e.g. "[EMAIL_1]"
  textValue?: string; // Only for harmless non-sensitive text
  scrollDelta?: { x: number; y: number };
  reasoning: string;
  expectedOutcome: string;
  riskLevel: RiskLevel;
}

/**
 * ValidatedAction: Action that has passed local target verification, schema checking,
 * pageEpoch freshness checks, token scope checks, and user risk confirmations.
 * Executor only accepts this type.
 */
export type StaleActionOutcome = 'SAFE_REGROUND' | 'REOBSERVE' | 'REPLAN' | 'ASK_USER' | 'BLOCK';

export interface ValidatedAction {
  readonly _isValidated: true;
  proposal: ActionProposal;
  targetElementId?: ElementId;
  resolvedTokenValue?: string; // Injected purely at execution time if TYPE_TOKEN
  expectedFingerprint?: TargetFingerprint; // Observation-time identity for live re-grounding
  /** Local frame token the target was observed in. Authority must match at execute time. */
  expectedFrameId?: FrameId;
  /** Scene epoch at validation. Hint for re-grounding; not planner authority. */
  observedEpoch?: PageEpoch;
  /** Observation-time page URL. Used to invalidate SPA route changes. Never sent to the planner. */
  observedUrl?: string;
  approvedRiskLevel: RiskLevel;
  timestamp: number;
}

export type VerificationStatus = 'VERIFIED_SUCCESS' | 'VERIFIED_FAILURE' | 'AMBIGUOUS';

export interface VerificationResult {
  actionId: ActionId;
  status: VerificationStatus;
  observedDelta: string;
  preEpoch: PageEpoch;
  postEpoch: PageEpoch;
  timestamp: number;
}
