import type {
  BoundingBox,
  ElementId,
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

export function transformRoiBoxToViewport(roiOrigin: BoundingBox, local: BoundingBox): BoundingBox {
  return {
    x: roiOrigin.x + local.x,
    y: roiOrigin.y + local.y,
    width: local.width,
    height: local.height,
  };
}

export interface GroundingOutput {
  candidates: VisualCandidate[];
  groundings: VisualGrounding[];
  fusedElementIds: ElementId[];
  fallback?: 'OCR_LOW_CONFIDENCE' | 'NO_TEXT' | 'GROUNDING_AMBIGUOUS';
}

/**
 * Visual grounding + DOM/OCR fusion (Zone 3).
 * OWNS: Associating OCR evidence with opaque local targets.
 * COORDINATE TRANSFORM: OCR boxes are ROI-local; grounding uses viewport space.
 * MUST NOT: Emit a second target when DOM and OCR describe the same control.
 */
export function groundAndFuse(args: {
  elements: RawElement[];
  ocrBlocks: OcrTextBlock[];
  pageEpoch: PageEpoch;
}): GroundingOutput {
  const { elements, ocrBlocks, pageEpoch } = args;
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
    const nearby = elements
      .map((el) => ({
        el,
        iou: iou(block.bbox, el.bbox),
        dist: centerDistance(block.bbox, el.bbox),
      }))
      .filter((hit) => hit.iou >= 0.12 || hit.dist <= 48)
      .sort((a, b) => b.iou - a.iou || a.dist - b.dist);

    const best = nearby[0];
    const second = nearby[1];
    if (best && second && Math.abs(best.iou - second.iou) < 0.05 && Math.abs(best.dist - second.dist) < 8) {
      ambiguous = true;
      continue;
    }

    // LOW OCR confidence may emit an OCR-only hint; it must not become a DOM target.
    if (best && conf !== 'LOW') {
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
      });
      groundings.push({
        candidateId,
        elementId: el.id,
        ocrBlockIds: [block.blockId],
        source,
        confidence: conf,
        pageEpoch,
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

export function isVisualEvidenceStale(evidenceEpoch: PageEpoch, currentEpoch: PageEpoch): boolean {
  return evidenceEpoch !== currentEpoch;
}
