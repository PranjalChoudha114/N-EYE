import type { ActionId, ElementId, TokenId } from './identifiers.js';

export type ActionType =
  | 'CLICK'
  | 'TYPE_TOKEN'
  | 'TYPE_TEXT'
  | 'SCROLL'
  | 'SELECT'
  | 'WAIT'
  | 'ASK_USER'
  | 'COMPLETE';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * ActionProposal: Untrusted advice returned by the remote planner.
 * Must be validated locally against the live DOM and risk policies before execution.
 */
export interface ActionProposal {
  actionId: ActionId;
  type: ActionType;
  targetId?: ElementId;
  tokenId?: TokenId;
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
export interface ValidatedAction {
  readonly _isValidated: true;
  proposal: ActionProposal;
  targetElementId?: ElementId;
  resolvedTokenValue?: string; // Injected purely at execution time if TYPE_TOKEN
  approvedRiskLevel: RiskLevel;
  timestamp: number;
}
