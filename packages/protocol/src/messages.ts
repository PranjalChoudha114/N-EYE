import type { ActionProposal, ValidatedAction } from './action-proposal.js';
import type { TaskId } from './identifiers.js';
import type { RawScene } from './raw-scene.js';
import type { SafeContext } from './safe-context.js';

export type TaskStatus =
  | 'IDLE'
  | 'OBSERVING'
  | 'PROTECTING'
  | 'PLANNING'
  | 'VALIDATING'
  | 'AWAITING_CONFIRMATION'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface TaskState {
  taskId: TaskId;
  goal: string;
  status: TaskStatus;
  lastSafeContext?: SafeContext;
  lastProposal?: ActionProposal;
  error?: string;
}

// Discriminative Union for typed runtime messaging
export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'PONG'; timestamp: number }
  | { type: 'START_TASK'; goal: string }
  | { type: 'CANCEL_TASK'; taskId: TaskId }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATED'; state: TaskState }
  | { type: 'OBSERVE_REQUEST' }
  | { type: 'OBSERVE_RESPONSE'; scene: RawScene }
  | { type: 'EXECUTE_ACTION_REQUEST'; action: ValidatedAction }
  | { type: 'EXECUTE_ACTION_RESPONSE'; success: boolean; error?: string };

export type ExtensionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
