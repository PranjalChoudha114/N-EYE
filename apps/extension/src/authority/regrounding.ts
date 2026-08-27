import type { ElementId, TargetFingerprint } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';

export class TargetStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetStaleError';
  }
}

export interface RegroundResult {
  node: HTMLElement;
  isFingerprintMatch: boolean;
}

/**
 * Re-grounds an opaque target ElementId against the live browser DOM immediately before action execution.
 * Verifies that the node remains mounted (.isConnected) and matches its structural fingerprint.
 */
export function regroundTarget(
  targetId: ElementId,
  registry: ElementRegistry,
  expectedFingerprint?: TargetFingerprint
): RegroundResult {
  const entry = registry.get(targetId);
  if (!entry) {
    throw new TargetStaleError(`Target ${targetId} was not found in active element registry. Re-observation required.`);
  }

  const liveNode = registry.getLiveNode(targetId);
  if (!liveNode || !liveNode.isConnected) {
    throw new TargetStaleError(`Target ${targetId} is detached from the active DOM. Live re-grounding failed.`);
  }

  let isFingerprintMatch = true;
  if (expectedFingerprint && entry.fingerprint) {
    // Verify digest compatibility
    if (entry.fingerprint.digest !== expectedFingerprint.digest) {
      isFingerprintMatch = false;
    }
  }

  return {
    node: liveNode,
    isFingerprintMatch,
  };
}
