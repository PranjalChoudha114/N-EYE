import type { ActionId, PageEpoch, TaskId } from './identifiers.js';
import type { ActionProposal, ValidatedAction, VerificationResult } from './action-proposal.js';
import type { RawScene } from './raw-scene.js';
import type { SafeContext } from './safe-context.js';
import type { PrivacyDecision, PrivacyFinding, StageMetric } from './privacy.js';

/**
 * Content-script handshake protocol (Zone 1 ↔ 2).
 * WHY: Chrome cannot run ES-module `import` graphs as content_scripts.
 * Increment only when the handshake payload shape changes.
 */
export const CONTENT_SCRIPT_PROTOCOL = 1;

export type ContentScriptHealth =
  | 'UNKNOWN'
  | 'READY'
  | 'INJECTING'
  | 'UNSUPPORTED'
  | 'DISCONNECTED';

export type ContentScriptErrorClass =
  | 'NO_RECEIVER'
  | 'TAB_NAVIGATING'
  | 'UNSUPPORTED_URL'
  | 'INJECTION_FAILED'
  | 'TIMEOUT'
  | 'VERSION_MISMATCH'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ContentScriptHello {
  pong: true;
  ready: true;
  contentProtocol: number;
  url: string;
  origin: string;
  epoch: PageEpoch;
  registeredElements: number;
}

export type TaskStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'OBSERVING'
  | 'READY'
  | 'PROTECTING'
  | 'PLANNING'
  | 'VALIDATING'
  | 'AWAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNSUPPORTED_PAGE';

export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  origin: string;
  isSupported: boolean;
  unsupportedReason?: string;
}

export interface TaskState {
  taskId: TaskId;
  goal: string;
  sanitizedGoal?: string;
  status: TaskStatus;
  activeTab?: TabInfo;
  lastRawScene?: RawScene;
  privacyFindings?: PrivacyFinding[];
  privacyDecisions?: PrivacyDecision[];
  lastSafeContext?: SafeContext;
  lastProposal?: ActionProposal;
  lastValidatedAction?: ValidatedAction;
  lastVerification?: VerificationResult;
  stageMetrics?: StageMetric[];
  error?: string;
}

// Discriminative Union for typed runtime messaging
export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'PONG'; timestamp: number }
  | { type: 'START_TASK'; goal: string; cannedValues?: Record<string, string> }
  | { type: 'CANCEL_TASK'; taskId: TaskId }
  | { type: 'GET_STATE' }
  | { type: 'GET_ACTIVE_TAB_INFO' }
  | { type: 'TAB_CHANGED'; tabInfo: TabInfo }
  | { type: 'STATE_UPDATED'; state: TaskState }
  | { type: 'OBSERVE_REQUEST' }
  | { type: 'OBSERVE_RESPONSE'; scene: RawScene }
  | { type: 'CAPTURE_ROIS_REQUEST'; rois: Array<{ roiId: string; x: number; y: number; width: number; height: number }> }
  | {
      type: 'CAPTURE_TAB_CROPS';
      rois: Array<{ roiId: string; x: number; y: number; width: number; height: number }>;
      /** CSS viewport size at capture time. Used to map viewport boxes onto the screenshot bitmap. */
      viewport?: { width: number; height: number };
    }
  | { type: 'EXECUTE_ACTION_REQUEST'; action: ValidatedAction }
  | { type: 'EXECUTE_ACTION_RESPONSE'; success: boolean; error?: string }
  | { type: 'CONFIRM_ACTION'; actionId: ActionId; approved: boolean }
  | { type: 'STEP_TASK' }
  | { type: 'INJECT_CONTENT_SCRIPT'; tabId: number };

export type ExtensionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
