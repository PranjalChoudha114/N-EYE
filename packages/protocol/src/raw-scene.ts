import type { ElementId, PageEpoch } from './identifiers.js';
import type { TargetFingerprint } from './fingerprint.js';

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
}

export type PrivacyClass =
  | 'SECRET_AUTH'
  | 'SECRET_OTP'
  | 'SECRET_TOKEN'
  | 'PII_DIRECT'
  | 'PII_CONTEXT'
  | 'PUBLIC_UI';

export interface PrivacyFinding {
  elementId?: ElementId;
  privacyClass: PrivacyClass;
  confidence: number;
  source: 'browser_input_type' | 'pattern' | 'ocr' | 'visual_model' | 'context';
  reason: string;
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
}
