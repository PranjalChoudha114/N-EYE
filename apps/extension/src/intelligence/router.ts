/**
 * Intelligence router (Zone 3/4).
 *
 * OWNS: Choosing a reasoning source from capability + privacy, not marketing labels.
 * TRUST: No source receives execution authority. Remote still requires EgressGuard.
 * MUST NOT: Silently present deterministic output as remote success (ADR-0012).
 */

import type { ActionProposal } from '@n-eye/protocol';
import type { PlannerMode } from '../planner/types.js';
import type { IntelligenceRoutingPolicy, InterpretedGoal, ReasoningProvenance } from './types.js';
import type { ProviderHealth } from './provider.js';

export type ReasoningDecision =
  | { source: ReasoningProvenance; reason: string }
  | { source: 'ABSTAIN'; reason: string };

export type NalisPath =
  | 'DETERMINISTIC_FAST'
  | 'LOCAL_MODEL'
  | 'LOCAL_VISUAL'
  | 'PROTECTED_REMOTE'
  | 'ASK_USER';

const CONCRETE = new Set(['CLICK', 'TYPE_TEXT', 'TYPE_TOKEN', 'SELECT', 'SCROLL', 'PRESS_ENTER']);

export function isAmbiguousAbstention(proposal: ActionProposal): boolean {
  return (
    proposal.type === 'ASK_USER' &&
    /multiple|ambiguous|will not guess/i.test(proposal.reasoning)
  );
}

export function isUnsupportedAbstention(proposal: ActionProposal, interpreted: InterpretedGoal): boolean {
  return interpreted.family === 'UNSUPPORTED' || /outside the Mock planner grammar/i.test(proposal.reasoning);
}

export function deterministicIsSufficient(
  interpreted: InterpretedGoal,
  proposal: ActionProposal
): boolean {
  if (proposal.type === 'ASK_USER') return false;
  if (proposal.type === 'COMPLETE') return true;
  if (CONCRETE.has(proposal.type)) return true;
  if (interpreted.confidence < 0.7) return false;
  return false;
}

/**
 * Capability routing: use deterministic when it can uniquely act; otherwise Remote if enabled.
 * Exclusive routing: MOCK always local, REMOTE always gateway (honest demo / ADR-0012).
 */
export function decideReasoningSource(args: {
  mode: PlannerMode;
  policy: IntelligenceRoutingPolicy;
  interpreted: InterpretedGoal;
  deterministicProposal: ActionProposal;
}): ReasoningDecision {
  if (args.mode === 'MOCK') {
    return { source: 'DETERMINISTIC_LOCAL', reason: 'Offline Mock mode is deterministic-only.' };
  }

  if (args.policy === 'exclusive') {
    return { source: 'REMOTE_PROVIDER', reason: 'Remote mode is an explicit gateway path.' };
  }

  if (isAmbiguousAbstention(args.deterministicProposal)) {
    return {
      source: 'ABSTAIN',
      reason: 'Ambiguous targets fail closed. Remote must not guess a control.',
    };
  }

  if (deterministicIsSufficient(args.interpreted, args.deterministicProposal)) {
    return {
      source: 'DETERMINISTIC_LOCAL',
      reason: 'Deterministic interpreter uniquely grounded a supported action.',
    };
  }

  if (isUnsupportedAbstention(args.deterministicProposal, args.interpreted) || args.deterministicProposal.type === 'ASK_USER') {
    return {
      source: 'REMOTE_PROVIDER',
      reason: 'Deterministic grammar abstained; Remote is enabled and payload class is unchanged.',
    };
  }

  return { source: 'REMOTE_PROVIDER', reason: 'Remote mode selected.' };
}

/**
 * Cheapest sufficient NALIS path. Local model is skipped unless admitted AND ready.
 * TRUST: Ambiguous targets never escalate to a guessing model or Remote.
 */
export function decideNalisPath(args: {
  interpreted: InterpretedGoal;
  deterministicProposal: ActionProposal;
  localModelHealth: ProviderHealth;
  localModelAdmitted: boolean;
  missingVisualEvidence: boolean;
  remoteAvailable: boolean;
  remoteModeEnabled: boolean;
}): { path: NalisPath; reason: string } {
  if (isAmbiguousAbstention(args.deterministicProposal)) {
    return { path: 'ASK_USER', reason: 'Ambiguous targets fail closed.' };
  }
  if (deterministicIsSufficient(args.interpreted, args.deterministicProposal)) {
    return { path: 'DETERMINISTIC_FAST', reason: 'Deterministic path uniquely grounded a supported action.' };
  }
  if (args.missingVisualEvidence) {
    return { path: 'LOCAL_VISUAL', reason: 'Structure is insufficient; bounded local visual escalation is next.' };
  }
  if (args.localModelAdmitted && args.localModelHealth === 'READY' && args.interpreted.confidence < 0.7) {
    return { path: 'LOCAL_MODEL', reason: 'Admitted local task model may interpret remaining language ambiguity.' };
  }
  if (args.remoteModeEnabled && args.remoteAvailable && !isAmbiguousAbstention(args.deterministicProposal)) {
    if (isUnsupportedAbstention(args.deterministicProposal, args.interpreted) || args.deterministicProposal.type === 'ASK_USER') {
      return { path: 'PROTECTED_REMOTE', reason: 'Deterministic grammar abstained; protected Remote may advise.' };
    }
  }
  return { path: 'ASK_USER', reason: 'Insufficient evidence after local paths.' };
}
