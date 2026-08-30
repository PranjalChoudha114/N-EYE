/**
 * Human action copy.
 * OWNS: Plain-language proposal text. Never hashes or vault values.
 */

import type { ActionProposal, RiskLevel } from '@n-eye/protocol';

export function describeAction(proposal: ActionProposal | null, targetLabel?: string): string {
  if (!proposal) return 'No action proposed.';
  const target = targetLabel || proposal.targetId || 'this page';
  switch (proposal.type) {
    case 'CLICK':
      return `Click ${target}`;
    case 'TYPE_TOKEN':
      return `Type ${proposal.tokenSymbol || 'a local token'} into ${target}`;
    case 'TYPE_TEXT':
      return `Type text into ${target}`;
    case 'SCROLL':
      return 'Scroll the page';
    case 'SELECT':
      return `Choose an option in ${target}`;
    case 'WAIT':
      return 'Wait for the page to settle';
    case 'ASK_USER':
      return 'Ask you for the next instruction';
    case 'COMPLETE':
      return 'Planner suggested completion (untrusted)';
    default:
      return proposal.type;
  }
}

export function riskLabel(risk: RiskLevel | undefined): string {
  if (risk === 'HIGH') return 'HIGH';
  if (risk === 'MEDIUM') return 'MEDIUM';
  if (risk === 'BLOCKED') return 'BLOCKED';
  return 'LOW';
}
