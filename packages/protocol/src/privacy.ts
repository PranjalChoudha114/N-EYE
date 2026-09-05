import type { ElementId, TaskId, TokenId } from './identifiers.js';

export type PrivacyClass =
  | 'SECRET_PASSWORD'
  | 'SECRET_OTP'
  | 'SECRET_API_KEY'
  | 'SECRET_AUTH_TOKEN'
  | 'SECRET_SESSION'
  | 'PII_EMAIL'
  | 'PII_PHONE'
  | 'PII_NAME'
  | 'PII_ADDRESS'
  | 'PII_ACCOUNT_ID'
  | 'PUBLIC_UI'
  | 'CONTEXTUAL'
  | 'SENSITIVE_UNKNOWN';

export type PrivacyPolicyDecision =
  | 'ALLOW'
  | 'MINIMIZE'
  | 'GENERALIZE'
  | 'TOKENIZE'
  | 'MASK'
  | 'REMOVE'
  | 'NEVER_SEND'
  | 'ASK_USER';

export interface PrivacyFinding {
  findingId: string;
  privacyClass: PrivacyClass;
  confidence: number;
  source: 'input_semantics' | 'pattern' | 'context' | 'ocr';
  elementId?: ElementId;
  fieldLocation: string; // e.g. "input.label", "button.text", "task.goal", "aria-label"
  textSpan?: string;
  detector: string;
  reason: string;
  /**
   * false = sensitive control with no current value (empty password field).
   * Omit or true = a value/pattern is present. Legacy fixtures omit this field.
   */
  valuePresent?: boolean;
}

export interface PrivacyDecision {
  findingId: string;
  elementId?: ElementId;
  privacyClass: PrivacyClass;
  decision: PrivacyPolicyDecision;
  tokenRole?: string; // e.g. "[EMAIL_1]"
  reason: string;
}

export interface TokenBinding {
  tokenId: TokenId;
  tokenSymbol: string; // e.g. "[EMAIL_1]"
  privacyClass: PrivacyClass;
  realValue: string;
  taskId: TaskId;
  tabId: number;
  origin: string;
  allowedTargetSemantics: string[]; // e.g. ['email', 'textbox', 'text']
  createdAt: number;
  expiresAt: number;
  status: 'ACTIVE' | 'EXPIRED' | 'DESTROYED';
}

export interface StageMetric {
  stage: 'SEE' | 'PERCEIVE' | 'PROTECT' | 'PLAN' | 'VALIDATE' | 'ACT' | 'VERIFY';
  durationMs: number;
  status: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'MOCK';
  details?: string;
}
