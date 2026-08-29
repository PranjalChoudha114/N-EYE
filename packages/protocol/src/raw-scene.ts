import { createFrameId, type ElementId, type FrameId, type PageEpoch } from './identifiers.js';
import type { TargetFingerprint } from './fingerprint.js';
import type { PrivacyFinding } from './privacy.js';
import type { PerceptionSource, VisualRegion } from './perception.js';

export type FrameKind = 'top' | 'same-origin' | 'inaccessible';

/**
 * Local authority metadata for the document that owns a target.
 * PRIVACY: Never include raw iframe URLs or query strings. Opaque frameId only.
 */
export interface FrameProvenance {
  frameId: FrameId;
  frameKind: FrameKind;
  depth: number;
  /** True when this document's origin equals the top document origin. */
  sameOriginAsTop: boolean;
}

export const TOP_FRAME_ID = createFrameId('top');

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'number'
  | 'checkbox'
  | 'radio'
  | 'submit'
  | 'button'
  | 'search'
  | 'textarea'
  | 'select'
  | 'file'
  | 'other';

export interface RawElement {
  id: ElementId;
  tagName: string;
  role: string | null;
  ariaLabel: string | null;
  innerTextCandidate: string | null;
  inputType: InputType | null;
  isEnabled: boolean;
  isSelected?: boolean;
  bbox: BoundingBox;
  fingerprint?: TargetFingerprint;
  xpath?: string; // Local-only for DOM re-grounding
  /** DOM | OCR | FUSED. Omitted means DOM-only observation. */
  perceptionSource?: PerceptionSource;
  /**
   * True when this control submits an owning form (input[type=submit] or a form-associated
   * submit button). RISK: derived from DOM structure, not from the label, so a page cannot
   * relabel a submit control to escape high-risk confirmation.
   */
  formSubmitting?: boolean;
  /** Local frame authority. Required for execution; omitted only on legacy fixtures. */
  frameProvenance?: FrameProvenance;
}

/**
 * RawScene represents the un-sanitized, local-only browser observation.
 * Non-serializable flag prevents direct transport to remote planner.
 */
export interface RawScene {
  readonly _isLocalOnly: true;
  pageEpoch: PageEpoch;
  url: string;
  origin: string;
  title: string;
  viewport: { width: number; height: number };
  elements: RawElement[];
  privacyFindings: PrivacyFinding[];
  timestamp: number;
  observationDurationMs?: number;
  /** Visual surfaces that may justify OCR. Geometry only — never pixels. */
  visualRegions?: VisualRegion[];
  /**
   * Inaccessible frames discovered during observation.
   * LOCAL ONLY. Never copied into SafeContext. No fabricated target semantics.
   */
  inaccessibleFrames?: Array<{
    frameId: FrameId;
    reason: 'cross-origin' | 'sandbox' | 'detached';
  }>;
}
