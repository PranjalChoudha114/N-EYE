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
import type { GatewayHealth, PlannerMode, PlannerOptions, PlannerProposalResult } from './types.js';

export class PlannerManager {
  private mode: PlannerMode = 'MOCK';
  private mockPlanner: DeterministicPlanner;
  private remotePlanner: RemotePlanner;
  private gatewayUrl: string = 'http://localhost:8000';
  private lastHealth: GatewayHealth = { healthy: false };

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
   */
  public async propose(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    if (this.mode === 'MOCK') {
      return this.mockPlanner.proposeAction(context, options);
    }

    // REMOTE mode
    return this.remotePlanner.proposeAction(context, {
      ...options,
      gatewayUrl: this.gatewayUrl,
    });
  }

  public reset(): void {
    this.mockPlanner.reset();
  }
}
