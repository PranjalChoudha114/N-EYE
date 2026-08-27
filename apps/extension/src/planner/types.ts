/**
 * Planner Interfaces and Contracts (Zone 4/5 Network Boundary)
 *
 * OWNS: The abstraction layer decoupling N-Eye from reasoning providers.
 * TRUST BOUNDARY: Remote planners receive SafeContext only and return untrusted ActionProposals.
 * MUST NOT: Expose provider SDKs, API keys, or browser execution authority to planners.
 */

import type { ActionProposal, SafeContext } from '@n-eye/protocol';

export type PlannerMode = 'MOCK' | 'REMOTE';

export interface PlannerOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  gatewayUrl?: string;
  requestId?: string;
}

export interface PlannerMetadata {
  requestId: string;
  provider: string;
  model: string;
  planningLatencyMs: number;
  payloadSizeBytes: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
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
