import type {
  BoundingBox,
  ElementId,
  FrameId,
  OcrTextBlock,
  PageEpoch,
  PerceptionConfidence,
  PerceptionSource,
  RawElement,
  VisualCandidate,
  VisualGrounding,
} from '@n-eye/protocol';
import { OCR_LOW_CONFIDENCE_THRESHOLD } from './ocr-engine.js';

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

function centerDistance(a: BoundingBox, b: BoundingBox): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function confidenceFromOcr(value: number | undefined): PerceptionConfidence {
  if (value === undefined) {
    return 'MEDIUM';
  }
  if (value < OCR_LOW_CONFIDENCE_THRESHOLD) return 'INSUFFICIENT';
  if (value >= 0.8) return 'HIGH';
  if (value >= 0.6) return 'MEDIUM';
  return 'LOW';
}

export function transformRoiBoxToViewport(
  roiOrigin: BoundingBox,
  local: BoundingBox,
  buffer?: { width: number; height: number }
): BoundingBox {
  // OCR boxes are in the captured buffer's pixels. ROI specs are CSS viewport.
  // Tab-capture DPR and canvas CSS≠intrinsic both require this scale. Identity when omitted.
  const scaleX = buffer && buffer.width > 0 ? roiOrigin.width / buffer.width : 1;
  const scaleY = buffer && buffer.height > 0 ? roiOrigin.height / buffer.height : 1;
  return {
    x: roiOrigin.x + local.x * scaleX,
    y: roiOrigin.y + local.y * scaleY,
    width: local.width * scaleX,
    height: local.height * scaleY,
  };
}

export interface GroundingOutput {
  candidates: VisualCandidate[];
  groundings: VisualGrounding[];
  fusedElementIds: ElementId[];
  fallback?: 'OCR_LOW_CONFIDENCE' | 'NO_TEXT' | 'GROUNDING_AMBIGUOUS';
}

/** Minimum VisualBindingScore before OCR may become a live target. Uncertainty reduces authority. */
export const VISUAL_BIND_MIN_SCORE = 0.34;
/** best − secondBest must clear this margin or the block stays unbound (ASK_USER, not a guess). */
export const VISUAL_BIND_UNIQUENESS_MARGIN = 0.12;

function intersectionArea(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function visualBindingScore(args: {
  block: OcrTextBlock;
  el: RawElement;
  roiOwnerId?: ElementId;
}): number {
  const { block, el, roiOwnerId } = args;
  const ocrArea = Math.max(1, block.bbox.width * block.bbox.height);
  const inter = intersectionArea(block.bbox, el.bbox);
  const containment = inter / ocrArea;
  const overlap = iou(block.bbox, el.bbox);
  const dist = centerDistance(block.bbox, el.bbox);
  const diag = Math.hypot(el.bbox.width, el.bbox.height) || 1;
  const proximity = dist <= 48 ? 0.15 : dist <= Math.max(120, diag * 0.6) ? 0.05 : 0;
  const role = (el.role || el.tagName || '').toLowerCase();
  const liveSurface = role === 'canvas' || role === 'img' || role === 'image' ? 0.05 : 0;
  const owner = roiOwnerId && roiOwnerId === el.id ? 0.5 : 0;
  const sameFrame =
    !block.frameId || !el.frameProvenance?.frameId || block.frameId === el.frameProvenance.frameId;
  if (!sameFrame) return 0;
  return owner + 0.4 * containment + 0.2 * overlap + proximity + liveSurface;
}

/**
 * Visual grounding + DOM/OCR fusion (Zone 3).
 * OWNS: Associating OCR evidence with opaque local targets.
 * COORDINATE TRANSFORM: OCR boxes are ROI-local; grounding uses viewport space.
 * MUST NOT: Grant a live target from nearest-neighbor or IoU-of-unequal-boxes alone.
 * Painted text on a large canvas has low IoU but high containment / ROI ownership.
 */
export function groundAndFuse(args: {
  elements: RawElement[];
  ocrBlocks: OcrTextBlock[];
  pageEpoch: PageEpoch;
  /** roiId → live element that owns that visual region (from observation, not OCR). */
  roiOwners?: ReadonlyMap<string, ElementId>;
}): GroundingOutput {
  const { elements, ocrBlocks, pageEpoch, roiOwners } = args;
  const candidates: VisualCandidate[] = [];
  const groundings: VisualGrounding[] = [];
  const fusedElementIds: ElementId[] = [];
  const claimed = new Set<string>();
  let ambiguous = false;

  const usableBlocks = ocrBlocks.filter((block) => {
    const conf = confidenceFromOcr(block.confidence);
    const text = block.text.trim();
    if (text.length < 2) return false;
    return conf !== 'INSUFFICIENT';
  });

  if (ocrBlocks.length === 0) {
    return { candidates: [], groundings: [], fusedElementIds: [], fallback: 'NO_TEXT' };
  }
  if (usableBlocks.length === 0) {
    return { candidates: [], groundings: [], fusedElementIds: [], fallback: 'OCR_LOW_CONFIDENCE' };
  }

  for (const block of usableBlocks) {
    const conf = confidenceFromOcr(block.confidence);
    const ocrNorm = normalizeLabel(block.text);
    const roiOwnerId = block.roiId ? roiOwners?.get(block.roiId) : undefined;

    const scored = elements
      .map((el) => ({
        el,
        score: visualBindingScore({ block, el, roiOwnerId }),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];
    const uniqueEnough =
      best &&
      best.score >= VISUAL_BIND_MIN_SCORE &&
      (!second || best.score - second.score >= VISUAL_BIND_UNIQUENESS_MARGIN);

    if (best && second && best.score >= VISUAL_BIND_MIN_SCORE && !uniqueEnough) {
      ambiguous = true;
      continue;
    }

    // LOW OCR confidence may emit an OCR-only hint; it must not become a DOM target.
    if (uniqueEnough && best && conf !== 'LOW') {
      const el = best.el;
      const domNorm = normalizeLabel(el.innerTextCandidate || el.ariaLabel || '');
      const duplicate = Boolean(domNorm) && (domNorm === ocrNorm || domNorm.includes(ocrNorm) || ocrNorm.includes(domNorm));
      let source: PerceptionSource = 'OCR';
      if (duplicate || (domNorm && ocrNorm)) {
        source = 'FUSED';
      }
      if (!domNorm) {
        source = 'OCR';
      }
      if (!claimed.has(el.id)) {
        fusedElementIds.push(el.id);
        claimed.add(el.id);
      }
      const candidateId = `vc_${block.blockId}`;
      candidates.push({
        candidateId,
        elementId: el.id,
        label: duplicate ? el.innerTextCandidate || block.text.trim() : block.text.trim().slice(0, 120),
        bbox: el.bbox,
        source,
        confidence: conf,
        pageEpoch,
        frameId: el.frameProvenance?.frameId,
      });
      groundings.push({
        candidateId,
        elementId: el.id,
        ocrBlockIds: [block.blockId],
        source,
        confidence: conf,
        pageEpoch,
        frameId: el.frameProvenance?.frameId,
      });
      continue;
    }

    const candidateId = `vc_${block.blockId}`;
    candidates.push({
      candidateId,
      label: block.text.trim().slice(0, 120),
      bbox: block.bbox,
      source: 'OCR',
      confidence: conf,
      pageEpoch,
    });
    groundings.push({
      candidateId,
      ocrBlockIds: [block.blockId],
      source: 'OCR',
      confidence: conf,
      pageEpoch,
    });
  }

  return {
    candidates,
    groundings,
    fusedElementIds,
    fallback: ambiguous ? 'GROUNDING_AMBIGUOUS' : undefined,
  };
}

export function applyFusionLabels(elements: RawElement[], candidates: VisualCandidate[]): RawElement[] {
  const byElement = new Map<string, VisualCandidate>();
  for (const candidate of candidates) {
    if (candidate.elementId) {
      byElement.set(candidate.elementId, candidate);
    }
  }
  return elements.map((el) => {
    const hit = byElement.get(el.id);
    if (!hit) {
      return { ...el, perceptionSource: el.perceptionSource || 'DOM' };
    }
    const existing = (el.innerTextCandidate || '').trim();
    const nextLabel = existing.length > 1 ? existing : hit.label;
    return {
      ...el,
      innerTextCandidate: nextLabel.slice(0, 120),
      perceptionSource: hit.source,
    };
  });
}

export function isVisualEvidenceStale(
  evidenceEpoch: PageEpoch,
  currentEpoch: PageEpoch,
  evidenceFrameId?: FrameId,
  currentFrameId?: FrameId
): boolean {
  if (evidenceEpoch !== currentEpoch) return true;
  if (evidenceFrameId && currentFrameId && evidenceFrameId !== currentFrameId) return true;
  return false;
}
