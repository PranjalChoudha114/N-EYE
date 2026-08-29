import type { PerceptionSource } from './perception.js';

/**
 * Human-assurance contracts (Zone 2 UI).
 * OWNS: Truthful protection states and Privacy Receipts.
 * PRIVACY: Receipts must never carry vault realValue, raw OTP/password, or full sensitive URLs.
 */

export type ProtectionState =
  | 'LOCAL_MONITORING'
  | 'PROTECTING'
  | 'REMOTE_REASONING'
  | 'PROTECTED'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'DEGRADED';

export type ProtectionEventKind = 'PROTECTED' | 'BLOCKED' | 'LOCAL_ONLY';

export type AssuranceEventKind =
  | 'SITE_CHANGE'
  | 'PROTECTED'
  | 'BLOCKED'
  | 'OCR_PROTECTED'
  | 'PASSWORD_EXCLUDED'
  | 'LOCAL_ONLY';

export interface PrivacyTransformationRecord {
  privacyClass: string;
  action: string;
}

export interface PrivacyReceipt {
  receiptId: string;
  timestamp: number;
  hostname: string;
  protectionEvent: ProtectionEventKind;
  perceptionSource: PerceptionSource | 'NONE';
  sensitiveClasses: string[];
  transformations: PrivacyTransformationRecord[];
  rawScreenshotSent: boolean;
  safeCropSent: boolean;
  safeContextBytes: number;
  plannerProvider?: string;
  plannerModel?: string;
  egressResult: 'PASS' | 'BLOCKED' | 'NOT_ATTEMPTED';
  requestId?: string;
  latencyMs?: number;
  actionStatus?: string;
  humanSummary: string;
  technicalEvidence: Record<string, string | number | boolean>;
}

export interface AssuranceEvent {
  kind: AssuranceEventKind;
  hostname: string;
  message: string;
  severity: 'info' | 'success' | 'warning';
  dedupeKey: string;
  timestamp: number;
}
