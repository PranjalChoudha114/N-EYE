import type { ElementId, TargetFingerprint } from '@n-eye/protocol';
import { createTargetFingerprint } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { getSanitizedLabelCandidate, mapInputType } from '../content/observer.js';

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

function liveInputType(liveNode: HTMLElement): ReturnType<typeof mapInputType> | null {
  if (liveNode instanceof HTMLInputElement) return mapInputType(liveNode.type);
  if (liveNode instanceof HTMLTextAreaElement) return 'textarea';
  if (liveNode instanceof HTMLSelectElement) return 'select';
  if (liveNode.getAttribute('role') === 'textbox') return 'text';
  return null;
}

function computeLiveFingerprint(liveNode: HTMLElement): TargetFingerprint {
  const viewWidth = Math.max(window.innerWidth || 1, 1);
  const viewHeight = Math.max(window.innerHeight || 1, 1);
  const rect = liveNode.getBoundingClientRect();
  const role = liveNode.getAttribute('role') || liveNode.tagName.toLowerCase();
  const tagName = liveNode.tagName.toLowerCase();
  const relBbox = {
    xPercent: Math.max(0, Math.min(100, (rect.x / viewWidth) * 100)),
    yPercent: Math.max(0, Math.min(100, (rect.y / viewHeight) * 100)),
    widthPercent: Math.max(0, Math.min(100, (rect.width / viewWidth) * 100)),
    heightPercent: Math.max(0, Math.min(100, (rect.height / viewHeight) * 100)),
  };
  return createTargetFingerprint(
    role,
    tagName,
    liveInputType(liveNode),
    getSanitizedLabelCandidate(liveNode),
    relBbox
  );
}

function semanticIdentity(fp: TargetFingerprint): string {
  // TRUST: Fail closed on role/tag/label change. Ignore bbox so scroll/layout cannot invalidate a live node.
  return `${fp.role.toLowerCase()}|${fp.tagName.toLowerCase()}|${fp.inputType || 'none'}|${fp.normalizedLabelCandidate.trim().toLowerCase()}`;
}

/**
 * Re-grounds an opaque target ElementId against the live browser DOM immediately before action execution.
 * Verifies that the node remains mounted (.isConnected) and still matches observation-time semantics.
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
  if (expectedFingerprint) {
    const liveFp = computeLiveFingerprint(liveNode);
    isFingerprintMatch = semanticIdentity(liveFp) === semanticIdentity(expectedFingerprint);
  }

  return {
    node: liveNode,
    isFingerprintMatch,
  };
}
