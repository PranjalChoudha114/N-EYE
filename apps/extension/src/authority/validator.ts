import {
  type ActionProposal,
  type RawElement,
  type RawScene,
  type RiskLevel,
  type SecurityReasonCode,
  type TaskId,
  type ValidatedAction,
} from '@n-eye/protocol';
import type { PrivateTokenVault } from '../privacy/vault.js';
import { assertProposalShape, MalformedProposalError } from './proposal-schema.js';

export class ActionValidationError extends Error {
  public readonly reasonCode: SecurityReasonCode;

  constructor(message: string, reasonCode: SecurityReasonCode = 'POLICY_VIOLATION') {
    super(message);
    this.name = 'ActionValidationError';
    this.reasonCode = reasonCode;
  }
}

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, BLOCKED: 3 };

/**
 * Consequential-action vocabulary for the controlled prototype.
 * WHY: These verbs cover submission, deletion, upload, publication, and value transfer — the
 *      classes an unwanted action cannot be undone from. Escalation is the only direction, so a
 *      false positive costs one confirmation prompt and a false negative is never silent.
 */
const HIGH_CLICK_LABEL =
  /\b(submit|log ?in|sign[ -]?in|pay|payment|purchase|buy|order|checkout|transfer|withdraw|wire|remit|send|publish|delete|remove|erase|wipe|deactivate|deregister|close account|upload|attach file|apply)\b/i;

/**
 * Structural high-risk semantics that a page cannot relabel away.
 * RISK: label text is page-controlled, so an attacker could aria-label a Delete control
 *       "Continue". Structure (form submit control, file input) is not label-derived.
 */
function structurallyConsequential(target: RawElement): boolean {
  return target.inputType === 'submit' || target.inputType === 'file' || target.formSubmitting === true;
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Local risk classification (Zone 3)
 * TRUST: Planner-declared riskLevel is untrusted advice and cannot downgrade a locally HIGH action.
 * WHY: Confirmation must not depend on a model choosing riskLevel=LOW for submit/pay/delete/upload.
 */
export function classifyLocalRisk(proposal: ActionProposal, target?: RawElement): RiskLevel {
  if (proposal.riskLevel === 'BLOCKED') return 'BLOCKED';
  if (!target) return proposal.riskLevel || 'LOW';

  // Writing into a file input is an upload decision, whatever the action verb says.
  if (target.inputType === 'file') return 'HIGH';

  if (proposal.type === 'CLICK' || proposal.type === 'SELECT') {
    const label = `${target.innerTextCandidate || ''} ${target.ariaLabel || ''}`;
    if (structurallyConsequential(target) || HIGH_CLICK_LABEL.test(label)) {
      return 'HIGH';
    }
  }
  return proposal.riskLevel || 'LOW';
}

/**
 * LocalValidator (Zone 3 - Local Action Authority)
 * OWNS: Local evaluation of untrusted ActionProposals against the live RawScene and PrivateTokenVault.
 * INVARIANT: Remote planner is advisory only. Actions CANNOT execute without producing a ValidatedAction.
 * ENFORCES: Target existence, enabled state, local risk elevation, token scope, and password-field isolation.
 */
export function validateActionProposal(
  untrustedProposal: ActionProposal,
  scene: RawScene,
  vault: PrivateTokenVault,
  taskId: TaskId,
  origin: string
): ValidatedAction {
  if (!untrustedProposal || !untrustedProposal.actionId || !untrustedProposal.type) {
    throw new ActionValidationError(
      'Invalid proposal structure: missing actionId or type.',
      'MALFORMED_PROPOSAL'
    );
  }

  // Shape gate first: an unknown or authority-claiming field is rejected, never ignored.
  // This runs here as well as at the network boundary so mock and internal paths are covered.
  let proposal: ActionProposal;
  try {
    proposal = assertProposalShape(untrustedProposal);
  } catch (err) {
    if (err instanceof MalformedProposalError) {
      throw new ActionValidationError(err.message, err.reasonCode);
    }
    throw err;
  }

  if (proposal.riskLevel === 'BLOCKED') {
    throw new ActionValidationError(
      'Proposal is BLOCKED by risk policy and cannot be executed.',
      'POLICY_VIOLATION'
    );
  }

  // COMPLETE / WAIT / ASK_USER do not require a live target.
  // SCROLL may target a container or the viewport (no targetId).
  if (proposal.type === 'COMPLETE' || proposal.type === 'WAIT' || proposal.type === 'ASK_USER') {
    return {
      _isValidated: true,
      proposal,
      approvedRiskLevel: maxRisk(classifyLocalRisk(proposal), proposal.riskLevel || 'LOW'),
      timestamp: Date.now(),
    };
  }

  if (proposal.type === 'SCROLL') {
    if (!proposal.scrollDelta) {
      throw new ActionValidationError('SCROLL requires a finite scrollDelta.', 'MALFORMED_PROPOSAL');
    }
    if (!proposal.targetId) {
      return {
        _isValidated: true,
        proposal,
        approvedRiskLevel: maxRisk(classifyLocalRisk(proposal), proposal.riskLevel || 'LOW'),
        timestamp: Date.now(),
      };
    }
  }

  if (!proposal.targetId) {
    throw new ActionValidationError(`Action type ${proposal.type} requires a targetId.`, 'INVALID_TARGET');
  }

  const target = scene.elements.find((e) => e.id === proposal.targetId);
  if (!target) {
    throw new ActionValidationError(
      `Target element ${proposal.targetId} was not found in current scene (epoch: ${scene.pageEpoch}). Stale proposal.`,
      'INVALID_TARGET'
    );
  }

  if (!target.isEnabled) {
    throw new ActionValidationError(`Target element ${proposal.targetId} is disabled.`, 'INVALID_TARGET');
  }

  if (proposal.type === 'SELECT') {
    const tag = (target.tagName || '').toLowerCase();
    const role = (target.role || '').toLowerCase();
    const selectLike = target.inputType === 'select' || tag === 'select' || role === 'combobox' || role === 'listbox';
    if (!selectLike) {
      throw new ActionValidationError(
        `SELECT target ${proposal.targetId} is not a native select-like control.`,
        'INVALID_TARGET'
      );
    }
    if (!proposal.textValue || !proposal.textValue.trim()) {
      throw new ActionValidationError(
        'SELECT requires textValue naming the option label or value.',
        'INVALID_TARGET'
      );
    }
  }

  if (target.frameProvenance?.frameKind === 'inaccessible') {
    throw new ActionValidationError(
      `Target element ${proposal.targetId} belongs to an inaccessible frame. Execution blocked.`,
      'FRAME_VIOLATION'
    );
  }

  // SECURITY: untrusted TYPE_TEXT must never write into password fields.
  if ((proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') && target.inputType === 'password') {
    throw new ActionValidationError(
      `Security violation: Attempted to type into a password field via ${proposal.type}. Access blocked.`,
      'POLICY_VIOLATION'
    );
  }

  // SECURITY: a file input's value is set by the user, not by N-Eye. Typing a path here would
  // be an upload decision the human never made, so it is refused outright rather than confirmed.
  if ((proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') && target.inputType === 'file') {
    throw new ActionValidationError(
      `Security violation: Attempted to write into a file upload field via ${proposal.type}. Access blocked.`,
      'POLICY_VIOLATION'
    );
  }

  let resolvedTokenValue: string | undefined;

  if (proposal.type === 'TYPE_TOKEN') {
    const tokenIdentifier = proposal.tokenId || proposal.tokenSymbol;
    if (!tokenIdentifier) {
      throw new ActionValidationError(
        'TYPE_TOKEN proposal must provide tokenId or tokenSymbol.',
        'TOKEN_SCOPE_VIOLATION'
      );
    }

    const targetSemantic = target.inputType || target.role || target.tagName;
    resolvedTokenValue = vault.resolve(tokenIdentifier, taskId, origin, targetSemantic);
  }

  const approvedRiskLevel = maxRisk(classifyLocalRisk(proposal, target), proposal.riskLevel || 'LOW');

  return {
    _isValidated: true,
    proposal,
    targetElementId: proposal.targetId,
    resolvedTokenValue,
    expectedFingerprint: target.fingerprint,
    expectedFrameId: target.frameProvenance?.frameId,
    observedEpoch: scene.pageEpoch,
    observedUrl: scene.url,
    approvedRiskLevel,
    timestamp: Date.now(),
  };
}
