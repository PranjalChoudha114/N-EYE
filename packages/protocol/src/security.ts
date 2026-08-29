import type { ActionId, ElementId, FrameId, PageEpoch, TaskId, TokenId } from './identifiers.js';
import type { ActionType, RiskLevel } from './action-proposal.js';

/**
 * Security reason vocabulary (Zone 3).
 * WHY: Blocks must be explainable to the user and to evidence without echoing attack payloads.
 * PRIVACY: A reason code is safe to log and render. Raw page text, OCR text, and vault values are not.
 */
export type SecurityReasonCode =
  | 'MALFORMED_PROPOSAL'
  | 'POLICY_VIOLATION'
  | 'INVALID_TARGET'
  | 'STALE_TARGET'
  | 'FRAME_VIOLATION'
  | 'TOKEN_SCOPE_VIOLATION'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_STALE'
  | 'CONFIRMATION_REPLAY'
  | 'RISK_ESCALATED'
  | 'UNTRUSTED_AUTHORITY_CLAIM';

/**
 * ConfirmationRequest: the exact authority the user is being asked to grant.
 *
 * OWNS: The identity of one high-risk action in one context at one moment.
 * WHY: `confirmed = true` is too weak. A user approves THIS action on THIS target in THIS
 *      context — never a standing permission for N-Eye to do dangerous things.
 * TRUST: Issued only by the local authority. Neither the page nor the planner can mint one.
 * MUST NEVER: Carry vault realValue, raw page text, or a resolved token value.
 */
export interface ConfirmationRequest {
  /** Locally minted, unguessable, single-use. Not derived from planner output. */
  readonly confirmationId: string;
  readonly taskId: TaskId;
  readonly actionId: ActionId;
  readonly origin: string;
  /** origin + pathname + search. SPA route identity, without fragment noise. */
  readonly routeKey: string;
  readonly frameId: FrameId;
  readonly actionType: ActionType;
  readonly targetElementId?: ElementId;
  /** Semantic identity of the target at approval time (role/tag/inputType/label). */
  readonly targetSemanticKey: string;
  readonly riskLevel: RiskLevel;
  /** Evidence only. Epoch drift alone does not invalidate; material change does. */
  readonly pageEpoch: PageEpoch;
  readonly tokenId?: TokenId;
  readonly reasonCode: SecurityReasonCode;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * ConfirmationGrant: proof that a human approved one specific ConfirmationRequest.
 * TRUST: The `_isUserConfirmed` brand is a local type guard, not a cryptographic capability.
 *        Authority still comes from re-verifying the binding against live page state.
 */
export interface ConfirmationGrant {
  readonly _isUserConfirmed: true;
  readonly confirmationId: string;
  readonly grantedAt: number;
}

/** Fields whose change between approval and execution revokes the grant. */
export type ConfirmationBinding = Pick<
  ConfirmationRequest,
  'taskId' | 'actionId' | 'origin' | 'routeKey' | 'frameId' | 'actionType' | 'targetElementId' | 'targetSemanticKey' | 'riskLevel' | 'tokenId'
>;

export interface ConfirmationCheck {
  ok: boolean;
  reasonCode?: SecurityReasonCode;
  reason?: string;
  /** Which bound dimension changed. Safe to show: names a field, not page content. */
  changedField?: keyof ConfirmationBinding | 'expiry';
}
