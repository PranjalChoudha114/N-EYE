import type { ElementId, PageEpoch } from './identifiers.js';
import type { TargetFingerprint } from './fingerprint.js';
import type { PrivacyFinding } from './privacy.js';
import type { PerceptionSource, VisualRegion } from './perception.js';

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
}
