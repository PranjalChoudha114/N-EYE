import {
  computeSemanticIdentity,
  type FrameId,
  type StaleActionOutcome,
  type TargetFingerprint,
  TOP_FRAME_ID,
} from '@n-eye/protocol';
import { isControlEnabled, isElementVisible } from '../content/observer.js';

export interface StaleActionCheck {
  originCompatible: boolean;
  targetExists: boolean;
  targetVisible: boolean;
  targetEnabled: boolean;
  frameMatches: boolean;
  semanticMatches: boolean;
  tokenScopeValid: boolean;
  riskStillValid: boolean;
}

/**
 * Canonical stale-action contract (Zone 3).
 * OWNS: Mapping live evidence onto SAFE_REGROUND / REOBSERVE / REPLAN / ASK_USER / BLOCK.
 * TRUST: The planner's old target ID is never execution authority by itself.
 */
export function decideStaleActionOutcome(args: {
  checks: StaleActionCheck;
  uniqueSemanticCandidate: boolean;
  ambiguousCandidates: boolean;
  semanticChangedOnLiveNode: boolean;
  frameInaccessible: boolean;
}): { outcome: StaleActionOutcome; reason: string } {
  if (args.frameInaccessible) {
    return { outcome: 'BLOCK', reason: 'Target frame is inaccessible. Authority cannot expand into a cross-origin document.' };
  }
  if (!args.checks.originCompatible) {
    return { outcome: 'BLOCK', reason: 'Active origin is no longer compatible with the validated action.' };
  }
  if (!args.checks.riskStillValid) {
    return { outcome: 'BLOCK', reason: 'Local risk classification no longer permits this action.' };
  }
  if (!args.checks.tokenScopeValid) {
    return { outcome: 'BLOCK', reason: 'Token capability is no longer scoped to this target.' };
  }
  if (args.semanticChangedOnLiveNode) {
    return { outcome: 'BLOCK', reason: 'Live target semantics changed. Refusing to execute the old plan.' };
  }
  if (args.ambiguousCandidates) {
    return { outcome: 'REOBSERVE', reason: 'Multiple plausible targets. Abstaining rather than guessing.' };
  }
  if (!args.checks.targetExists) {
    return { outcome: 'REOBSERVE', reason: 'Original target is gone. Re-observation required before planning.' };
  }
  if (!args.checks.frameMatches) {
    return { outcome: 'REOBSERVE', reason: 'Frame provenance no longer matches. Re-observation required.' };
  }
  if (!args.checks.targetVisible || !args.checks.targetEnabled) {
    return { outcome: 'BLOCK', reason: 'Target is hidden or disabled. Refusing execution.' };
  }
  if (args.checks.semanticMatches && args.uniqueSemanticCandidate) {
    return { outcome: 'SAFE_REGROUND', reason: 'Live target still matches intended semantics and frame provenance.' };
  }
  return { outcome: 'REPLAN', reason: 'Stale authority cannot be repaired locally.' };
}

export function liveInteractable(node: HTMLElement): { visible: boolean; enabled: boolean } {
  return {
    visible: isElementVisible(node),
    enabled: isControlEnabled(node),
  };
}

export function semanticKeyOf(fp: TargetFingerprint): string {
  return computeSemanticIdentity(fp.role, fp.tagName, fp.inputType, fp.normalizedLabelCandidate);
}

export function defaultFrameId(frameId?: FrameId): FrameId {
  return frameId ?? TOP_FRAME_ID;
}
