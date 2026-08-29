import type { ActionId, ElementId, FrameId, PageEpoch, TaskId, TokenId } from './identifiers.js';
import type { BoundingBox, InputType } from './raw-scene.js';
import type { PrivacyClass } from './privacy.js';
import type { PerceptionSource } from './perception.js';

export interface SafeElement {
  id: ElementId;
  role: string | null;
  safeLabel: string;
  inputType: InputType | null;
  isEnabled: boolean;
  isSelected?: boolean;
  bbox: BoundingBox;
  perceptionSource?: PerceptionSource;
  /**
   * Opaque local frame token (`f1`, `f2`). Omitted for the top document.
   * PRIVACY: Never a URL, hostname, or query string.
   */
  frameId?: FrameId;
}

export interface TokenCapability {
  tokenId: TokenId;
  tokenSymbol: string; // e.g. "[EMAIL_1]"
  privacyClass: PrivacyClass;
  descriptionRole: string; // e.g. "Primary user email"
}

/** Geometry + sanitized description only. Never image bytes. */
export interface SafeVisualHint {
  hintId: string;
  bbox: BoundingBox;
  description: string;
}

/**
 * SafeContext: The sole allowed schema for outbound network requests to remote planner.
 * Any additional or un-sanitized fields are strictly forbidden.
 */
export interface SafeContext {
  protocolVersion: '1.0.0';
  taskId: TaskId;
  pageEpoch: PageEpoch;
  sanitizedGoal: string;
  pageMetadata: {
    origin: string;
    sanitizedTitle: string;
    viewport: { width: number; height: number };
  };
  safeElements: SafeElement[];
  availableTokens: TokenCapability[];
  visualHints?: SafeVisualHint[];
  priorOutcome?: {
    actionId: ActionId;
    status: 'SUCCESS' | 'FAILURE' | 'VERIFIED';
    summary?: string;
  };
}
