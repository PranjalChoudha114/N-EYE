import {
  type ActionProposal,
  type RawScene,
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

  // 1. Validate complete or wait actions
  if (proposal.type === 'COMPLETE' || proposal.type === 'WAIT') {
    return {
      _isValidated: true,
      proposal,
      approvedRiskLevel: proposal.riskLevel || 'LOW',
      timestamp: Date.now(),
    };
  }

  // 2. Validate target existence
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

  let resolvedTokenValue: string | undefined;

  // 3. Validate TYPE_TOKEN
  if (proposal.type === 'TYPE_TOKEN') {
    const tokenIdentifier = proposal.tokenId || proposal.tokenSymbol;
    if (!tokenIdentifier) {
      throw new ActionValidationError('TYPE_TOKEN proposal must provide tokenId or tokenSymbol.');
    }

    // Security invariant: never allow token insertion into password inputs
    if (target.inputType === 'password') {
      throw new ActionValidationError(
        `Security violation: Attempted to inject token ${tokenIdentifier} into a password field. Access blocked.`
      );
    }

    const targetSemantic = target.inputType || target.role || target.tagName;
    resolvedTokenValue = vault.resolve(tokenIdentifier, taskId, origin, targetSemantic);
  }

  return {
    _isValidated: true,
    proposal,
    targetElementId: proposal.targetId,
    resolvedTokenValue,
    approvedRiskLevel: proposal.riskLevel || 'LOW',
    timestamp: Date.now(),
  };
}
