import type { BoundingBox, EscalationReason, PageEpoch, RawScene, RoiSpec, VisualRegion } from '@n-eye/protocol';
import { createPageEpoch } from '@n-eye/protocol';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { pickUniqueClickTarget, pickUniqueTypeTextTarget } from '../planner/mock-grammar.js';
import {
  MAX_SIMULTANEOUS_ROIS,
  ROI_LIFETIME_MS,
  RoiBoundsError,
  assertRoiBounds,
  clampRoiToViewport,
  fitRoiToBounds,
  roiPixelCount,
} from './roi.js';

const UNLABELED_MAX_CHARS = 1;

function hasUsableLabel(label: string | null | undefined): boolean {
  return Boolean(label && label.trim().length > UNLABELED_MAX_CHARS);
}

function regionArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

const GOAL_VISUAL_HINT = /\b(image|canvas|screenshot|ocr|pdf|visual|scan|pixel)\b/i;

function uniqueReasons(reasons: EscalationReason[]): EscalationReason[] {
  return [...new Set(reasons)];
}

function toRoiSpec(
  region: VisualRegion,
  origin: string,
  viewport: { width: number; height: number },
  epoch: PageEpoch
): RoiSpec | null {
  try {
    const geo = fitRoiToBounds(clampRoiToViewport(region.bbox, viewport));
    assertRoiBounds(geo);
    return {
      roiId: `roi_${region.regionId}`,
      bbox: { x: geo.x, y: geo.y, width: geo.width, height: geo.height },
      source: region.reason,
      pageEpoch: epoch,
      origin,
      widthPx: geo.width,
      heightPx: geo.height,
      pixelCount: roiPixelCount(geo),
      lifetimeMs: ROI_LIFETIME_MS,
    };
  } catch (err) {
    if (err instanceof RoiBoundsError) {
      return null;
    }
    throw err;
  }
}

/**
 * AdaptivePerceptionController (Zone 3).
 * OWNS: Structure-first decision of whether local OCR is necessary.
 * WHEN: After DOM observation, before any pixel capture.
 * MUST NOT: Invoke OCR on every page. Records WHY, not merely that OCR ran.
 */
export function decidePerception(
  scene: RawScene,
  options?: { origin?: string; goal?: string }
): {
  escalate: boolean;
  reasons: EscalationReason[];
  roiSpecs: RoiSpec[];
  skippedReason?: string;
} {
  const epoch = scene.pageEpoch || createPageEpoch(1);
  const origin = options?.origin || scene.origin;
  const reasons: EscalationReason[] = [];
  const candidateRegions: VisualRegion[] = [...(scene.visualRegions || [])];

  for (const region of candidateRegions) {
    if (region.kind === 'canvas') reasons.push('CANVAS_RENDERED');
    if (region.kind === 'image') reasons.push('IMAGE_TEXT');
    if (region.kind === 'pdf' || region.kind === 'document') reasons.push('PDF_OR_DOCUMENT_PREVIEW');
    if (region.kind === 'icon_control') reasons.push('ICON_ONLY_CONTROL');
    if (region.kind === 'unlabeled') reasons.push('UNEXPLAINED_VISIBLE_REGION');
  }

  const unlabeledControls = scene.elements.filter(
    (el) =>
      el.isEnabled &&
      !hasUsableLabel(el.innerTextCandidate) &&
      !hasUsableLabel(el.ariaLabel) &&
      el.inputType !== 'password' &&
      el.inputType !== 'email' &&
      el.inputType !== 'tel'
  );
  if (unlabeledControls.length > 0) {
    reasons.push('ICON_ONLY_CONTROL');
  }

  const labeledInteractive = scene.elements.filter(
    (el) => hasUsableLabel(el.innerTextCandidate) || hasUsableLabel(el.ariaLabel)
  );
  const goalWantsVisual = Boolean(options?.goal && GOAL_VISUAL_HINT.test(options.goal));
  if (goalWantsVisual && candidateRegions.length === 0 && unlabeledControls.length > 0) {
    reasons.push('UNRESOLVED_VISUAL_TARGET');
  }

  const unique = uniqueReasons(reasons);
  const shouldEscalate = unique.length > 0 && (candidateRegions.length > 0 || unlabeledControls.length > 0);

  // Task-conditioned: if the interpreted goal uniquely grounds on DOM/ARIA, skip decorative OCR.
  if (options?.goal && shouldEscalate && !goalWantsVisual && structureSufficientForGoal(scene, options.goal)) {
    return {
      escalate: false,
      reasons: [],
      roiSpecs: [],
      skippedReason: 'Task-conditioned: DOM uniquely grounds this goal; visual escalation skipped',
    };
  }

  if (!shouldEscalate) {
    return {
      escalate: false,
      reasons: [],
      roiSpecs: [],
      skippedReason:
        labeledInteractive.length > 0
          ? 'DOM/ARIA labels are sufficient; no unresolved visual region'
          : 'No visual escalation evidence on this page',
    };
  }

  const rois: RoiSpec[] = [];
  const sortedRegions = [...candidateRegions].sort((a, b) => regionArea(b.bbox) - regionArea(a.bbox));
  for (const region of sortedRegions) {
    if (rois.length >= MAX_SIMULTANEOUS_ROIS) break;
    const spec = toRoiSpec(region, origin, scene.viewport, epoch);
    if (spec) rois.push(spec);
  }

  for (const el of unlabeledControls) {
    if (rois.length >= MAX_SIMULTANEOUS_ROIS) break;
    const already = rois.some(
      (r) => Math.abs(r.bbox.x - el.bbox.x) < 2 && Math.abs(r.bbox.y - el.bbox.y) < 2
    );
    if (already) continue;
    const spec = toRoiSpec(
      {
        regionId: `unlabeled_${el.id}`,
        kind: 'icon_control',
        bbox: el.bbox,
        pageEpoch: epoch,
        reason: 'ICON_ONLY_CONTROL',
        associatedElementId: el.id,
      },
      origin,
      scene.viewport,
      epoch
    );
    if (spec) rois.push(spec);
  }

  if (rois.length === 0) {
    return {
      escalate: false,
      reasons: unique,
      roiSpecs: [],
      skippedReason: 'Escalation evidence existed but every ROI failed bounds checks',
    };
  }

  return {
    escalate: true,
    reasons: unique,
    roiSpecs: rois,
  };
}

export function isDomSufficient(scene: RawScene): boolean {
  return !decidePerception(scene).escalate;
}

function structureSufficientForGoal(scene: RawScene, goal: string): boolean {
  const interpreted = interpretGoal(goal);
  if (interpreted.family === 'UNSUPPORTED' || interpreted.family === 'SCROLL') return false;
  const elements = scene.elements.map((el) => ({
    ...el,
    safeLabel: el.innerTextCandidate || el.ariaLabel || '',
  }));
  if (interpreted.family === 'SEARCH' || interpreted.family === 'FORM_FILL') {
    return pickUniqueTypeTextTarget(elements, interpreted.fieldHints).ok;
  }
  if (
    interpreted.family === 'CLICK' ||
    interpreted.family === 'NAVIGATE' ||
    interpreted.family === 'FIND' ||
    interpreted.family === 'RECOVERY'
  ) {
    return pickUniqueClickTarget(elements, interpreted.labelHints).ok;
  }
  return false;
}
