/**
 * Planner Interfaces and Contracts (Zone 4/5 Network Boundary)
 *
 * OWNS: The abstraction layer decoupling N-Eye from reasoning providers.
 * TRUST BOUNDARY: Remote planners receive SafeContext only and return untrusted ActionProposals.
 * MUST NOT: Expose provider SDKs, API keys, or browser execution authority to planners.
 */

import type { ActionProposal, PlannerTransportCode, SafeContext } from '@n-eye/protocol';
import type { ReasoningProvenance } from '../intelligence/types.js';

export type PlannerMode = 'MOCK' | 'REMOTE';

export interface PlannerRetryNotice {
  attempt: number;
  nextAttempt: number;
  code: PlannerTransportCode;
  delayMs: number;
}

export interface PlannerOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  gatewayUrl?: string;
  requestId?: string;
  /** Observability only. Must not change payload class, authority, or retry budget. */
  onRetry?: (notice: PlannerRetryNotice) => void;
  /**
   * Local Mock only: compute a proposal without committing planner task state.
   * WHY: Capability routing must not burn exploration/step budgets on a discarded Mock path.
   */
  dryRun?: boolean;
}

export interface PlannerMetadata {
  requestId: string;
  provider: string;
  model: string;
  planningLatencyMs: number;
  payloadSizeBytes: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  /** 1-based attempt count. Development instrumentation, not a SIH benchmark. */
  attempt?: number;
  /** Which reasoning source produced this proposal. Not execution authority. */
  reasoningProvenance?: ReasoningProvenance;
}

export interface PlannerProposalResult {
  proposal: ActionProposal;
  metadata: PlannerMetadata;
}

export interface Planner {
  /**
   * Proposes a constrained ActionProposal from egress-approved SafeContext.
   */
  proposeAction(context: SafeContext, options?: PlannerOptions): Promise<PlannerProposalResult>;
}

export interface GatewayHealth {
  healthy: boolean;
  provider?: string;
  model?: string;
  version?: string;
  error?: string;
}
