import {
  computeSemanticIdentity,
  TOP_FRAME_ID,
  type ConfirmationBinding,
  type ConfirmationCheck,
  type ConfirmationGrant,
  type ConfirmationRequest,
  type SecurityReasonCode,
  type TargetFingerprint,
  type TaskId,
  type ValidatedAction,
} from '@n-eye/protocol';

/**
 * Confirmation capability (Zone 3 — Local Authority).
 *
 * OWNS: Issuing, resolving, and single-use consumption of human approval for high-risk actions.
 * WHY: A boolean `confirmed` grants a standing permission. A capability grants exactly one
 *      action, on one target, in one context, for a bounded time.
 * TRUST BOUNDARY: Only this module mints ConfirmationRequests. A webpage cannot mint one; a
 *      remote planner cannot mint one; neither can claim a grant already exists.
 * WHAT MAY CROSS to the UI: confirmationId, action type, target label, risk, reason code.
 * WHAT MUST NEVER CROSS: vault realValue, resolved token value, raw page text.
 */

/** Approval is short-lived. A dialog left open across a browsing session must not stay valid. */
export const CONFIRMATION_TTL_MS = 120_000;

export function routeKeyOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Fragment is excluded: a hash change is not a different route for authority purposes.
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function semanticKeyOfFingerprint(fingerprint?: TargetFingerprint): string {
  if (!fingerprint) return '';
  return computeSemanticIdentity(
    fingerprint.role,
    fingerprint.tagName,
    fingerprint.inputType,
    fingerprint.normalizedLabelCandidate
  );
}

function randomConfirmationId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return `cnf_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `cnf_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Derives the exact authority a user is being asked to approve from a locally validated action.
 * Every field is local: none of it is taken from planner output except the action vocabulary.
 */
export function buildConfirmationBinding(
  action: ValidatedAction,
  ctx: { taskId: TaskId; origin: string }
): ConfirmationBinding {
  return {
    taskId: ctx.taskId,
    actionId: action.proposal.actionId,
    origin: ctx.origin,
    routeKey: routeKeyOf(action.observedUrl),
    frameId: action.expectedFrameId ?? TOP_FRAME_ID,
    actionType: action.proposal.type,
    targetElementId: action.targetElementId,
    targetSemanticKey: semanticKeyOfFingerprint(action.expectedFingerprint),
    riskLevel: action.approvedRiskLevel,
    tokenId: action.proposal.tokenId,
  };
}

const BOUND_FIELDS: Array<keyof ConfirmationBinding> = [
  'taskId',
  'actionId',
  'origin',
  'routeKey',
  'frameId',
  'actionType',
  'targetElementId',
  'targetSemanticKey',
  'riskLevel',
  'tokenId',
];

/**
 * Re-verifies an approved request against the authority derived from freshly observed state.
 * FAIL-CLOSED: any material difference revokes the grant. Approving "Submit" never authorizes
 * "Delete", a different target, a different frame, a different origin, or a different task.
 */
export function verifyConfirmationBinding(
  approved: ConfirmationRequest,
  live: ConfirmationBinding,
  now: number = Date.now()
): ConfirmationCheck {
  if (now > approved.expiresAt) {
    return {
      ok: false,
      reasonCode: 'CONFIRMATION_STALE',
      reason: 'Approval expired before execution. A new confirmation is required.',
      changedField: 'expiry',
    };
  }

  for (const field of BOUND_FIELDS) {
    if (approved[field] === live[field]) continue;
    const reasonCode: SecurityReasonCode = field === 'riskLevel' ? 'RISK_ESCALATED' : 'CONFIRMATION_STALE';
    return {
      ok: false,
      reasonCode,
      reason: `Approval no longer matches the live action (${field} changed). Refusing to execute.`,
      changedField: field,
    };
  }

  return { ok: true };
}

interface PendingConfirmation {
  request: ConfirmationRequest;
  /** Set once the human answers. Undefined means still awaiting an answer. */
  approved?: boolean;
  /** True once consumed, so a grant can authorize at most one execution. */
  consumed: boolean;
}

/**
 * ConfirmationBroker: the only source of ConfirmationGrants.
 * Single-pending by design — N-Eye runs one task step at a time, so there is never a legitimate
 * reason to hold two open approvals, and holding one removes an entire class of confusion bugs.
 */
export class ConfirmationBroker {
  private pending: PendingConfirmation | null = null;

  public issue(
    binding: ConfirmationBinding,
    opts: { pageEpoch: ConfirmationRequest['pageEpoch']; reasonCode?: SecurityReasonCode; ttlMs?: number }
  ): ConfirmationRequest {
    const issuedAt = Date.now();
    const request: ConfirmationRequest = {
      ...binding,
      confirmationId: randomConfirmationId(),
      pageEpoch: opts.pageEpoch,
      reasonCode: opts.reasonCode ?? 'CONFIRMATION_REQUIRED',
      issuedAt,
      expiresAt: issuedAt + (opts.ttlMs ?? CONFIRMATION_TTL_MS),
    };
    // Issuing a new request abandons any previous one. Old ids can never be answered later.
    this.pending = { request, consumed: false };
    return request;
  }

  public pendingRequest(): ConfirmationRequest | null {
    return this.pending && this.pending.approved === undefined ? this.pending.request : null;
  }

  /**
   * Records the human answer. Rejects any id that is not the currently pending request, so a
   * replayed or fabricated confirmationId cannot answer on behalf of the user.
   */
  public resolve(confirmationId: string, approved: boolean): ConfirmationCheck {
    const pending = this.pending;
    if (!pending) {
      return { ok: false, reasonCode: 'UNTRUSTED_AUTHORITY_CLAIM', reason: 'No confirmation is awaiting an answer.' };
    }
    if (pending.request.confirmationId !== confirmationId) {
      return {
        ok: false,
        reasonCode: 'CONFIRMATION_REPLAY',
        reason: 'Confirmation id does not match the pending approval request.',
      };
    }
    if (pending.approved !== undefined) {
      return { ok: false, reasonCode: 'CONFIRMATION_REPLAY', reason: 'This confirmation was already answered.' };
    }
    if (Date.now() > pending.request.expiresAt) {
      pending.approved = false;
      return { ok: false, reasonCode: 'CONFIRMATION_STALE', reason: 'Confirmation expired before it was answered.' };
    }
    pending.approved = approved;
    return { ok: true };
  }

  /**
   * Consumes an approved request exactly once. A second call cannot reuse the same approval,
   * so approving Submit A can never be replayed to authorize Delete B.
   */
  public consume(confirmationId: string): { grant: ConfirmationGrant; request: ConfirmationRequest } | ConfirmationCheck {
    const pending = this.pending;
    if (!pending || pending.request.confirmationId !== confirmationId) {
      return { ok: false, reasonCode: 'CONFIRMATION_REPLAY', reason: 'Unknown or superseded confirmation id.' };
    }
    if (pending.consumed) {
      return { ok: false, reasonCode: 'CONFIRMATION_REPLAY', reason: 'Confirmation was already used for an action.' };
    }
    if (pending.approved !== true) {
      return { ok: false, reasonCode: 'CONFIRMATION_REQUIRED', reason: 'Confirmation was not approved by the user.' };
    }
    if (Date.now() > pending.request.expiresAt) {
      return { ok: false, reasonCode: 'CONFIRMATION_STALE', reason: 'Approval expired before it was used.' };
    }
    pending.consumed = true;
    return {
      grant: { _isUserConfirmed: true, confirmationId, grantedAt: Date.now() },
      request: pending.request,
    };
  }

  /** Drops any pending approval. Used on cancel, tab change, origin change, and task end. */
  public invalidate(): void {
    this.pending = null;
  }
}

export function isConfirmationCheck(value: unknown): value is ConfirmationCheck {
  return Boolean(value) && typeof value === 'object' && 'ok' in (value as Record<string, unknown>);
}
