import type { ElementId, FrameId, PageEpoch, TaskId } from './identifiers.js';
import type { BoundingBox } from './raw-scene.js';

/**
 * Perception contracts (Zone 1→3, local-only).
 * OWNS: Adaptive OCR/ROI types. NEVER include raw pixels or data-URL screenshots.
 * MUST NOT: Become an outbound network schema. SafeContext remains the sole egress contract.
 */

export type PerceptionSource = 'DOM' | 'OCR' | 'FUSED';

export type PerceptionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export type EscalationReason =
  | 'IMAGE_TEXT'
  | 'CANVAS_RENDERED'
  | 'ICON_ONLY_CONTROL'
  | 'PDF_OR_DOCUMENT_PREVIEW'
  | 'UNEXPLAINED_VISIBLE_REGION'
  | 'INSUFFICIENT_SAFE_CONTEXT'
  | 'UNRESOLVED_VISUAL_TARGET';

export type PerceptionFallback =
  | 'CAPTURE_UNAVAILABLE'
  | 'OCR_LOAD_FAILURE'
  | 'OCR_TIMEOUT'
  | 'OCR_LOW_CONFIDENCE'
  | 'NO_TEXT'
  | 'GROUNDING_AMBIGUOUS'
  | 'OVERSIZED_ROI'
  | 'PAGE_CHANGED'
  | 'UNSUPPORTED_VISUAL'
  | 'FRAME_INACCESSIBLE'
  | 'CANCELLED';

export type VisualRegionKind = 'image' | 'canvas' | 'pdf' | 'icon_control' | 'unlabeled' | 'document';

/** Geometry of a visual-only surface. Contains NO pixels. */
export interface VisualRegion {
  regionId: string;
  kind: VisualRegionKind;
  bbox: BoundingBox;
  pageEpoch: PageEpoch;
  reason: EscalationReason;
  associatedElementId?: ElementId;
  altText?: string | null;
  frameId?: FrameId;
}

export interface RoiSpec {
  roiId: string;
  bbox: BoundingBox;
  source: EscalationReason;
  pageEpoch: PageEpoch;
  origin: string;
  taskId?: TaskId;
  widthPx: number;
  heightPx: number;
  pixelCount: number;
  lifetimeMs: number;
}

export interface OcrTextBlock {
  text: string;
  /** Present only when the OCR engine actually reports confidence. Never invented. */
  confidence?: number;
  /** Viewport-space box after ROI → page transform. */
  bbox: BoundingBox;
  roiId: string;
  pageEpoch: PageEpoch;
  blockId: string;
  frameId?: FrameId;
}

export interface VisualCandidate {
  candidateId: string;
  elementId?: ElementId;
  label: string;
  bbox: BoundingBox;
  source: PerceptionSource;
  confidence: PerceptionConfidence;
  pageEpoch: PageEpoch;
  frameId?: FrameId;
}

export interface VisualGrounding {
  candidateId: string;
  elementId?: ElementId;
  ocrBlockIds: string[];
  source: PerceptionSource;
  confidence: PerceptionConfidence;
  pageEpoch: PageEpoch;
  frameId?: FrameId;
}

export interface PerceptionTimings {
  roiSelectionMs: number;
  captureMs: number;
  ocrInitMs: number;
  ocrExecutionMs: number;
  privacyMs: number;
  groundingMs: number;
  fusionMs: number;
  totalMs: number;
  ocrCold: boolean;
}

export interface PerceptionDecision {
  escalate: boolean;
  reasons: EscalationReason[];
  roiSpecs: RoiSpec[];
  /** Why OCR was skipped. Empty when escalate is true. */
  skippedReason?: string;
}

export interface PerceptionResult {
  readonly _isLocalOnly: true;
  invoked: boolean;
  decision: PerceptionDecision;
  ocrBlocks: OcrTextBlock[];
  candidates: VisualCandidate[];
  groundings: VisualGrounding[];
  timings: PerceptionTimings;
  fallback?: PerceptionFallback;
  pageEpoch: PageEpoch;
  fusedElementIds: ElementId[];
}
