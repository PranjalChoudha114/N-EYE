import {
  computeSemanticIdentity,
  createTargetFingerprint,
  type ElementId,
  type FrameId,
  type StaleActionOutcome,
  type TargetFingerprint,
  TOP_FRAME_ID,
} from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { collectCandidates, computeElementNeighborhoodHint, getSanitizedLabelCandidate, mapInputType } from '../content/observer.js';
import { discoverFrames, ownerFrameId } from '../content/frames.js';
import { decideStaleActionOutcome, defaultFrameId, liveInteractable, semanticKeyOf } from './stale-action.js';

export class TargetStaleError extends Error {
  readonly outcome: StaleActionOutcome;

  constructor(message: string, outcome: StaleActionOutcome = 'REOBSERVE') {
    super(message);
    this.name = 'TargetStaleError';
    this.outcome = outcome;
  }
}

export interface RegroundResult {
  node: HTMLElement;
  isFingerprintMatch: boolean;
  outcome: StaleActionOutcome;
  reason: string;
  candidateCount: number;
}

function liveInputType(liveNode: HTMLElement): ReturnType<typeof mapInputType> | null {
  if (liveNode instanceof HTMLInputElement) return mapInputType(liveNode.type);
  if (liveNode instanceof HTMLTextAreaElement) return 'textarea';
  if (liveNode instanceof HTMLSelectElement) return 'select';
  if (liveNode.getAttribute('role') === 'textbox') return 'text';
  return null;
}

export function computeLiveFingerprint(liveNode: HTMLElement): TargetFingerprint {
  const view = liveNode.ownerDocument.defaultView || window;
  const viewWidth = Math.max(view.innerWidth || 1, 1);
  const viewHeight = Math.max(view.innerHeight || 1, 1);
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
    relBbox,
    computeElementNeighborhoodHint(liveNode)
  );
}

function centerDistance(a: DOMRect, b: { xPercent: number; yPercent: number }, viewW: number, viewH: number): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = (b.xPercent / 100) * viewW;
  const by = (b.yPercent / 100) * viewH;
  return Math.hypot(ax - bx, ay - by);
}

interface ScoredCandidate {
  node: HTMLElement;
  semantic: boolean;
  neighborhood: boolean;
  distance: number;
  frameId: FrameId;
}

function scoreCandidates(
  expected: TargetFingerprint,
  expectedFrame: FrameId,
  nodes: HTMLElement[],
  frames: ReturnType<typeof discoverFrames>
): ScoredCandidate[] {
  const expectedKey = semanticKeyOf(expected);
  const viewW = Math.max(window.innerWidth || 1, 1);
  const viewH = Math.max(window.innerHeight || 1, 1);
  const scored: ScoredCandidate[] = [];

  for (const node of nodes) {
    if (!node.isConnected) continue;
    const interact = liveInteractable(node);
    if (!interact.visible || !interact.enabled) continue;
    const frameId = ownerFrameId(node, frames);
    if (frameId !== expectedFrame) continue;
    const liveFp = computeLiveFingerprint(node);
    const semantic = semanticKeyOf(liveFp) === expectedKey;
    if (!semantic) continue;
    const neighborhood =
      Boolean(expected.neighborhoodHint) &&
      Boolean(liveFp.neighborhoodHint) &&
      expected.neighborhoodHint === liveFp.neighborhoodHint;
    scored.push({
      node,
      semantic,
      neighborhood,
      distance: centerDistance(node.getBoundingClientRect(), expected.relativeBbox, viewW, viewH),
      frameId,
    });
  }
  return scored;
}

/**
 * Re-grounds an opaque target against the live DOM immediately before execution.
 * SEMANTIC MATCH > GEOMETRIC CONVENIENCE. Ambiguity abstains. Semantic swap blocks.
 */
export function regroundTarget(
  targetId: ElementId,
  registry: ElementRegistry,
  expectedFingerprint?: TargetFingerprint,
  expectedFrameId?: FrameId
): RegroundResult {
  const entry = registry.get(targetId);
  if (!entry) {
    throw new TargetStaleError(
      `Target ${targetId} was not found in active element registry. Re-observation required.`,
      'REOBSERVE'
    );
  }

  const expectedFrame = defaultFrameId(expectedFrameId ?? entry.frameId);
  const frames = discoverFrames(document);
  const frameMeta = frames.find((frame) => frame.frameId === expectedFrame);
  if (expectedFrame !== TOP_FRAME_ID && (!frameMeta || frameMeta.frameKind === 'inaccessible' || !frameMeta.document)) {
    throw new TargetStaleError(
      `Target ${targetId} frame ${expectedFrame} is gone or inaccessible. Refusing stale frame authority.`,
      'BLOCK'
    );
  }

  const expected = expectedFingerprint ?? entry.fingerprint;
  const liveNode = entry.liveNode.isConnected ? entry.liveNode : null;

  if (liveNode) {
    const liveFp = computeLiveFingerprint(liveNode);
    const semanticMatch = computeSemanticIdentity(
      liveFp.role,
      liveFp.tagName,
      liveFp.inputType,
      liveFp.normalizedLabelCandidate
    ) === semanticKeyOf(expected);
    const interact = liveInteractable(liveNode);
    const liveFrame = ownerFrameId(liveNode, frames);

    if (!interact.visible || !interact.enabled) {
      throw new TargetStaleError(
        `Target ${targetId} is hidden or disabled. Refusing execution.`,
        'BLOCK'
      );
    }

    if (liveFrame !== expectedFrame) {
      throw new TargetStaleError(
        `Target ${targetId} frame provenance mismatch. Refusing cross-frame execution.`,
        'BLOCK'
      );
    }

    if (expectedFingerprint && !semanticMatch) {
      throw new TargetStaleError(
        `Target ${targetId} semantic fingerprint mismatch. Re-observation required.`,
        'BLOCK'
      );
    }

    return {
      node: liveNode,
      isFingerprintMatch: true,
      outcome: 'SAFE_REGROUND',
      reason: 'Live node still matches intended semantics.',
      candidateCount: 1,
    };
  }

  const searchRoots = frames
    .filter((frame) => frame.frameId === expectedFrame && frame.document)
    .map((frame) => frame.document as Document);
  const liveNodes = searchRoots.flatMap((doc) => collectCandidates(doc));
  const scored = scoreCandidates(expected, expectedFrame, liveNodes, frames);

  const neighborhoodHits = scored.filter((candidate) => candidate.neighborhood);
  const unique = neighborhoodHits.length === 1 ? neighborhoodHits : scored;
  const decision = decideStaleActionOutcome({
    checks: {
      originCompatible: true,
      targetExists: unique.length > 0,
      targetVisible: unique.length > 0,
      targetEnabled: unique.length > 0,
      frameMatches: true,
      semanticMatches: unique.length > 0,
      tokenScopeValid: true,
      riskStillValid: true,
    },
    uniqueSemanticCandidate: unique.length === 1,
    ambiguousCandidates: unique.length > 1,
    semanticChangedOnLiveNode: false,
    frameInaccessible: false,
  });

  if (decision.outcome !== 'SAFE_REGROUND' || unique.length !== 1 || !unique[0]) {
    throw new TargetStaleError(
      `Target ${targetId} ${decision.reason}`,
      decision.outcome === 'SAFE_REGROUND' ? 'REOBSERVE' : decision.outcome
    );
  }

  return {
    node: unique[0].node,
    isFingerprintMatch: true,
    outcome: 'SAFE_REGROUND',
    reason: decision.reason,
    candidateCount: scored.length,
  };
}

/**
 * Final pre-dispatch authority check (TOCTOU).
 * WHY: Validation can be stale by the time native click/type runs. Browser DOM cannot be locked.
 */
export function assertLiveAuthority(
  node: HTMLElement,
  expectedFingerprint?: TargetFingerprint,
  expectedFrameId?: FrameId
): void {
  if (!node.isConnected) {
    throw new TargetStaleError('Target detached immediately before dispatch.', 'BLOCK');
  }
  const interact = liveInteractable(node);
  if (!interact.visible || !interact.enabled) {
    throw new TargetStaleError('Target became hidden or disabled immediately before dispatch.', 'BLOCK');
  }
  if (expectedFingerprint) {
    const liveFp = computeLiveFingerprint(node);
    if (semanticKeyOf(liveFp) !== semanticKeyOf(expectedFingerprint)) {
      throw new TargetStaleError('Target semantics changed immediately before dispatch.', 'BLOCK');
    }
  }
  if (expectedFrameId) {
    const frames = discoverFrames(document);
    if (ownerFrameId(node, frames) !== expectedFrameId) {
      throw new TargetStaleError('Target frame changed immediately before dispatch.', 'BLOCK');
    }
  }
}
