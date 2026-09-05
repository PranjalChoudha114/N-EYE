/**
 * Planner Manager (Zone 4/5 Network & Reasoning Coordinator)
 *
 * OWNS: Runtime switching between Deterministic Mock mode and Remote AI mode,
 * health checking the planner gateway, and coordinating fallback state machines.
 * TRUST BOUNDARY: Ensures that offline fallbacks never compromise privacy or invent remote evidence.
 * MUST NOT: Silently mask remote planner failures as successful AI executions.
 */

import type { SafeContext } from '@n-eye/protocol';
import { DeterministicPlanner } from './deterministic-planner.js';
import { RemotePlanner } from './remote-planner.js';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { decideReasoningSource } from '../intelligence/router.js';
import type { IntelligenceRoutingPolicy } from '../intelligence/types.js';
import type { GatewayHealth, PlannerMode, PlannerOptions, PlannerProposalResult } from './types.js';

export class PlannerManager {
  private mode: PlannerMode = 'MOCK';
  private mockPlanner: DeterministicPlanner;
  private remotePlanner: RemotePlanner;
  private gatewayUrl: string = 'http://localhost:8000';
  private lastHealth: GatewayHealth = { healthy: false };
  /**
   * exclusive: UI MOCK/REMOTE maps 1:1 (ADR-0012 — never present Mock as Remote).
   * capability: deterministic-first when uniquely grounded; Remote only when enabled and needed.
   */
  private routingPolicy: IntelligenceRoutingPolicy = 'exclusive';

  constructor(initialMode: PlannerMode = 'MOCK', gatewayUrl: string = 'http://localhost:8000') {
    this.mode = initialMode;
    this.gatewayUrl = gatewayUrl;
    this.mockPlanner = new DeterministicPlanner();
    this.remotePlanner = new RemotePlanner(this.gatewayUrl);
  }

  public setMode(newMode: PlannerMode): void {
    this.mode = newMode;
  }

  public getMode(): PlannerMode {
    return this.mode;
  }

  public setRoutingPolicy(policy: IntelligenceRoutingPolicy): void {
    this.routingPolicy = policy;
  }

  public getRoutingPolicy(): IntelligenceRoutingPolicy {
    return this.routingPolicy;
  }

  public setGatewayUrl(url: string): void {
    this.gatewayUrl = url;
    this.remotePlanner = new RemotePlanner(this.gatewayUrl);
  }

  public getGatewayUrl(): string {
    return this.gatewayUrl;
  }

  public getLastHealth(): GatewayHealth {
    return this.lastHealth;
  }

  /**
   * Health check probe against the local or remote planner gateway.
   */
  public async checkGatewayHealth(): Promise<GatewayHealth> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.gatewayUrl}/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        this.lastHealth = {
          healthy: true,
          provider: data.provider,
          model: data.model,
          version: data.version,
        };
        return this.lastHealth;
      }

      this.lastHealth = {
        healthy: false,
        error: `Gateway returned status ${res.status}`,
      };
      return this.lastHealth;
    } catch (err) {
      this.lastHealth = {
        healthy: false,
        error: (err as Error).message || 'Gateway unreachable',
      };
      return this.lastHealth;
    }
  }

  /**
   * Dispatches the planning request to the active planner implementation.
   * TRUST: Capability routing never widens the payload. Remote failure does not fall back to Mock.
   */
  public async propose(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    if (this.mode === 'MOCK') {
      const result = await this.mockPlanner.proposeAction(context, options);
      return {
        ...result,
        metadata: { ...result.metadata, reasoningProvenance: 'DETERMINISTIC_LOCAL' },
      };
    }

    if (this.routingPolicy === 'capability') {
      const interpreted = interpretGoal(context.sanitizedGoal);
      const deterministic = await this.mockPlanner.proposeAction(context, { ...options, dryRun: true });
      const decision = decideReasoningSource({
        mode: this.mode,
        policy: 'capability',
        interpreted,
        deterministicProposal: deterministic.proposal,
      });
      if (decision.source === 'DETERMINISTIC_LOCAL') {
        const committed = await this.mockPlanner.proposeAction(context, options);
        return {
          ...committed,
          metadata: { ...committed.metadata, reasoningProvenance: 'DETERMINISTIC_LOCAL' },
        };
      }
      if (decision.source === 'ABSTAIN') {
        return {
          ...deterministic,
          metadata: { ...deterministic.metadata, reasoningProvenance: 'DETERMINISTIC_LOCAL' },
        };
      }
    }

    const remote = await this.remotePlanner.proposeAction(context, {
      ...options,
      gatewayUrl: this.gatewayUrl,
    });
    return {
      ...remote,
      metadata: { ...remote.metadata, reasoningProvenance: 'REMOTE_PROVIDER' },
    };
  }

  public reset(): void {
    this.mockPlanner.reset();
  }
}
