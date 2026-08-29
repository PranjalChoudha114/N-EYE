import type { ActionId, TaskId } from './identifiers.js';
import type { ActionProposal, ValidatedAction, VerificationResult } from './action-proposal.js';
import type { RawScene } from './raw-scene.js';
import type { SafeContext } from './safe-context.js';
import type { PrivacyDecision, PrivacyFinding, StageMetric } from './privacy.js';

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
  | { type: 'CAPTURE_TAB_CROPS'; rois: Array<{ roiId: string; x: number; y: number; width: number; height: number }> }
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
