import {
  type ActionProposal,
  type RawElement,
  type RawScene,
  type RiskLevel,
  type TaskId,
  type ValidatedAction,
} from '@n-eye/protocol';
import type { PrivateTokenVault } from '../privacy/vault.js';

export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionValidationError';
  }
}

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, BLOCKED: 3 };

const HIGH_CLICK_LABEL = /\b(submit|login|sign in|sign-in|pay|purchase|delete|checkout|transfer|send payment)\b/i;

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Local risk classification (Zone 3)
 * TRUST: Planner-declared riskLevel is untrusted advice and cannot downgrade a locally HIGH action.
 * WHY: Confirmation must not depend on a model choosing riskLevel=LOW for submit/pay/delete.
 */
export function classifyLocalRisk(proposal: ActionProposal, target?: RawElement): RiskLevel {
  if (proposal.riskLevel === 'BLOCKED') return 'BLOCKED';
  if (proposal.type === 'CLICK' && target) {
    const label = `${target.innerTextCandidate || ''} ${target.ariaLabel || ''}`;
    if (target.inputType === 'submit' || HIGH_CLICK_LABEL.test(label)) {
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
  proposal: ActionProposal,
  scene: RawScene,
  vault: PrivateTokenVault,
  taskId: TaskId,
  origin: string
): ValidatedAction {
  if (!proposal || !proposal.actionId || !proposal.type) {
    throw new ActionValidationError('Invalid proposal structure: missing actionId or type.');
  }

  if (proposal.riskLevel === 'BLOCKED') {
    throw new ActionValidationError('Proposal is BLOCKED by risk policy and cannot be executed.');
  }

  // COMPLETE / WAIT / ASK_USER / SCROLL do not require a live target.
  if (
    proposal.type === 'COMPLETE' ||
    proposal.type === 'WAIT' ||
    proposal.type === 'ASK_USER' ||
    proposal.type === 'SCROLL'
  ) {
    return {
      _isValidated: true,
      proposal,
      approvedRiskLevel: maxRisk(classifyLocalRisk(proposal), proposal.riskLevel || 'LOW'),
      timestamp: Date.now(),
    };
  }

  if (!proposal.targetId) {
    throw new ActionValidationError(`Action type ${proposal.type} requires a targetId.`);
  }

  const target = scene.elements.find((e) => e.id === proposal.targetId);
  if (!target) {
    throw new ActionValidationError(
      `Target element ${proposal.targetId} was not found in current scene (epoch: ${scene.pageEpoch}). Stale proposal.`
    );
  }

  if (!target.isEnabled) {
    throw new ActionValidationError(`Target element ${proposal.targetId} is disabled.`);
  }

  // SECURITY: untrusted TYPE_TEXT must never write into password fields.
  if ((proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') && target.inputType === 'password') {
    throw new ActionValidationError(
      `Security violation: Attempted to type into a password field via ${proposal.type}. Access blocked.`
    );
  }

  let resolvedTokenValue: string | undefined;

  if (proposal.type === 'TYPE_TOKEN') {
    const tokenIdentifier = proposal.tokenId || proposal.tokenSymbol;
    if (!tokenIdentifier) {
      throw new ActionValidationError('TYPE_TOKEN proposal must provide tokenId or tokenSymbol.');
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
    approvedRiskLevel,
    timestamp: Date.now(),
  };
}
