/**
 * Serializable product UI state (Zone 2).
 * OWNS: What product UI may render. Overlay and Side Panel project this snapshot.
 * MUST NEVER: Carry vault realValue, RawScene, screenshots, or raw secrets.
 */

import type {
  ContentScriptHealth,
  PrivacyReceipt,
  RiskLevel,
  SecurityReasonCode,
  VerificationStatus,
} from '@n-eye/protocol';
import type { PlannerMode } from '../planner/types.js';
import type { PrivacySummary } from '../ui/privacy-summary.js';
import type { ProductToast } from '../ui/notification-map.js';
import type { ReceiptViewModel } from '../ui/receipt-map.js';
import type { AskUserView } from '../ui/ask-user.js';
import type { VisualizerModel } from '../assurance/privacy-visualizer.js';

export type ProductPhase =
  | 'IDLE'
  | 'READY'
  | 'OBSERVING'
  | 'RECOVERING'
  | 'UNSUPPORTED'
  | 'DISCONNECTED'
  | 'PROTECTING'
  | 'PERCEIVING'
  | 'PLANNING'
  | 'VALIDATING'
  | 'AWAITING_CONFIRMATION'
  | 'ACTING'
  | 'VERIFYING'
  | 'PROTECTED'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'ERROR'
  | 'RATE_LIMITED'
  | 'GATEWAY_UNREACHABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'RETRYING'
  | 'OCR_UNAVAILABLE'
  | 'ASK_USER';

export type StatusTone = 'neutral' | 'ok' | 'info' | 'warning' | 'danger';

export type PipelineId = 'SEE' | 'PERCEIVE' | 'PROTECT' | 'THINK' | 'VALIDATE' | 'ACT' | 'VERIFY';

export type PipelineVisual = 'pending' | 'active' | 'done' | 'skipped';

export interface PipelineState {
  SEE: PipelineVisual;
  PERCEIVE: PipelineVisual;
  PROTECT: PipelineVisual;
  THINK: PipelineVisual;
  VALIDATE: PipelineVisual;
  ACT: PipelineVisual;
  VERIFY: PipelineVisual;
}

export interface ValidationChecks {
  targetCurrent: boolean | null;
  frameCurrent: boolean | null;
  pageCurrent: boolean | null;
  tokenScopeValid: boolean | null;
  riskPolicy: string | null;
}

export interface ActionViewModel {
  proposalText: string;
  targetLabel: string;
  risk: RiskLevel;
  reasoning: string;
  validation: ValidationChecks;
  verification?: VerificationStatus;
  verificationDelta?: string;
  blockedReason?: string;
  proposalType?: string;
  targetId?: string;
  frame?: string;
  confirmationRequired?: boolean;
  /** Sanitized reason code for a security refusal. Never the attacker's payload. */
  securityReason?: SecurityReasonCode;
}

/**
 * What the user sees before granting a high-risk capability.
 * TRUST: `confirmationId` binds the answer to one pending request. The UI echoes it back.
 * MUST NEVER: Carry a vault realValue, a resolved token value, or raw page text.
 */
export interface ConfirmationView {
  confirmationId: string;
  actionName: string;
  targetLabel: string;
  /** Locally classified risk. Never the planner's self-declared level. */
  risk: RiskLevel;
  why: string;
  stayedLocal: string[];
  dataUsed: string[];
}

export interface EvidenceViewModel {
  requestId: string;
  plannerMode: string;
  provider: string;
  model: string;
  payloadBytes: number;
  findingsCount: number;
  vaultTokenCount: number;
  screenshotOutBytes: number;
  ocrInvoked: boolean;
  roiCount: number;
  perceptionSource: string;
  contentScriptHealth: ContentScriptHealth;
  pageEpoch: number;
  frameNote: string;
  egressResult: string;
  plannerLatency: string;
  validationResult: string;
  executionResult: string;
  verificationResult: string;
  ocrReason: string;
  cropOutbound: string;
  observedControls: number;
  safeContextJson: string;
  /** Latest security decision, as a reason code. Sanitized: no attack strings, no secrets. */
  securityReason: string;
  plannerAttempts: number;
  recoveryPath: string;
}

export interface LatencyView {
  see: string;
  perceive: string;
  protect: string;
  plan: string;
  validate: string;
  act: string;
  verify: string;
  total: string;
}

export interface ProductState {
  schemaVersion: 1;
  phase: ProductPhase;
  headline: string;
  message: string;
  tone: StatusTone;
  siteHostname: string;
  siteTitle: string;
  supported: boolean;
  unsupportedReason?: string;
  tabId?: number;
  origin?: string;
  url?: string;
  running: boolean;
  canRun: boolean;
  canCancel: boolean;
  plannerMode: PlannerMode;
  gatewayReachable: boolean | null;
  lastPlannerProvider?: string;
  lastPlannerModel?: string;
  lastRequestId?: string;
  contentScriptHealth: ContentScriptHealth;
  pipeline: PipelineState;
  perceiveLabel: string;
  step?: { index: number; max: number; summary: string };
  privacySummary: PrivacySummary | null;
  visualizer: VisualizerModel;
  action?: ActionViewModel;
  confirmation?: ConfirmationView;
  /** Clarification pause. Never a confirmation capability. */
  askUser?: AskUserView | null;
  evidence: EvidenceViewModel;
  receipt?: PrivacyReceipt;
  receiptView?: ReceiptViewModel;
  toast?: ProductToast | null;
  advisories: string[];
  latency: LatencyView;
  goal: string;
}

export function idlePipeline(): PipelineState {
  return {
    SEE: 'pending',
    PERCEIVE: 'skipped',
    PROTECT: 'pending',
    THINK: 'pending',
    VALIDATE: 'pending',
    ACT: 'pending',
    VERIFY: 'pending',
  };
}

export function emptyEvidence(health: ContentScriptHealth = 'UNKNOWN'): EvidenceViewModel {
  return {
    requestId: '—',
    plannerMode: 'MOCK (Deterministic)',
    provider: '—',
    model: '—',
    payloadBytes: 0,
    findingsCount: 0,
    vaultTokenCount: 0,
    screenshotOutBytes: 0,
    ocrInvoked: false,
    roiCount: 0,
    perceptionSource: 'DOM',
    contentScriptHealth: health,
    pageEpoch: 0,
    frameNote: '—',
    egressResult: 'NOT_ATTEMPTED',
    plannerLatency: '—',
    validationResult: '—',
    executionResult: '—',
    verificationResult: '—',
    ocrReason: 'Not invoked',
    cropOutbound: 'NO',
    observedControls: 0,
    safeContextJson: '{}',
    securityReason: '—',
    plannerAttempts: 0,
    recoveryPath: '—',
  };
}

export function emptyLatency(): LatencyView {
  return {
    see: '—',
    perceive: 'skipped',
    protect: '—',
    plan: '—',
    validate: '—',
    act: '—',
    verify: '—',
    total: '—',
  };
}

export function isTerminalOutcome(phase: ProductPhase): boolean {
  return (
    phase === 'COMPLETED' ||
    phase === 'CANCELLED' ||
    phase === 'BLOCKED' ||
    phase === 'ERROR' ||
    phase === 'PROTECTED' ||
    phase === 'RATE_LIMITED' ||
    phase === 'GATEWAY_UNREACHABLE' ||
    phase === 'PROVIDER_UNAVAILABLE' ||
    phase === 'OCR_UNAVAILABLE' ||
    phase === 'ASK_USER'
  );
}

export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function markSessionInterrupted(state: ProductState, message: string): ProductState {
  return {
    ...state,
    running: false,
    canCancel: false,
    canRun: true,
    phase: 'CANCELLED',
    headline: 'Cancelled',
    message,
    tone: 'neutral',
    confirmation: undefined,
  };
}

export function createIdleState(): ProductState {
  return {
    schemaVersion: 1,
    phase: 'IDLE',
    headline: 'Ready',
    message: 'N-Eye is starting.',
    tone: 'neutral',
    siteHostname: 'Connecting…',
    siteTitle: '',
    supported: true,
    running: false,
    canRun: false,
    canCancel: false,
    plannerMode: 'MOCK',
    gatewayReachable: null,
    contentScriptHealth: 'UNKNOWN',
    pipeline: idlePipeline(),
    perceiveLabel: 'SKIP',
    privacySummary: null,
    visualizer: {
      mode: 'empty',
      caption: 'No N-Eye privacy transformation has occurred for this task.',
      local: [{ tag: 'NONE', value: 'No N-Eye privacy transformation has occurred for this task.', kind: 'empty' }],
      safe: [{ tag: 'NONE', value: 'No protected AI context was built for a request.', kind: 'empty' }],
    },
    evidence: emptyEvidence(),
    toast: null,
    askUser: null,
    advisories: [],
    latency: emptyLatency(),
    goal: 'Enter my email and continue',
  };
}
