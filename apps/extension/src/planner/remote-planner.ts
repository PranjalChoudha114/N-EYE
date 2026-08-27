/**
 * Remote Planner Client (Zone 4/5 Network Boundary)
 *
 * OWNS: Outbound transport of egress-guarded SafeContext to the remote planner gateway.
 * TRUST BOUNDARY: Enforces mandatory Egress Guard inspection before serializing network requests.
 * MUST NOT: Send RawScene, bypass EgressGuard, store provider keys, or execute remote responses directly.
 */

import {
  type ActionProposal,
  type SafeContext,
  NEyeError,
} from '@n-eye/protocol';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import type { Planner, PlannerOptions, PlannerProposalResult } from './types.js';

const DEFAULT_GATEWAY_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TRANSIENT_RETRIES = 1;

export class RemotePlanner implements Planner {
  private defaultGatewayUrl: string;

  constructor(gatewayUrl: string = DEFAULT_GATEWAY_URL) {
    this.defaultGatewayUrl = gatewayUrl.replace(/\/+$/, '');
  }

  public async proposeAction(
    context: SafeContext,
    options?: PlannerOptions
  ): Promise<PlannerProposalResult> {
    const gatewayUrl = (options?.gatewayUrl || this.defaultGatewayUrl).replace(/\/+$/, '');
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const callerSignal = options?.signal;
    const requestId = options?.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // STEP 1: Mandatory Egress Guard checkpoint
    // RawScene, unredacted goals, and raw secrets are blocked from reaching transport.
    let serializedContextBytes: string;
    try {
      serializedContextBytes = validateSafeContextEgress(context);
    } catch (err) {
      throw new NEyeError(
        'PRIVACY_ERROR',
        `Egress guard blocked outbound planner request: ${(err as Error).message}`
      );
    }

    const payloadObj = {
      requestId,
      safeContext: JSON.parse(serializedContextBytes),
    };
    const bodyStr = JSON.stringify(payloadObj);

    // STEP 2: Network transport with timeout, cancellation, and bounded retry
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= MAX_TRANSIENT_RETRIES) {
      attempts += 1;

      // Check caller cancellation before network dispatch
      if (callerSignal?.aborted) {
        throw new DOMException('Planner request was aborted by user.', 'AbortError');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Planner request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Link caller cancellation signal to abort controller
      const abortListener = (): void => {
        controller.abort(new DOMException('Planner request was aborted by user.', 'AbortError'));
      };
      if (callerSignal) {
        callerSignal.addEventListener('abort', abortListener, { once: true });
      }

      const startTime = performance.now();

      try {
        const response = await fetch(`${gatewayUrl}/v1/plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: bodyStr,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (callerSignal) {
          callerSignal.removeEventListener('abort', abortListener);
        }

        const networkDuration = performance.now() - startTime;

        if (response.status === 401 || response.status === 403) {
          throw new NEyeError('PLANNER_ERROR', 'Planner gateway authentication failed on server.');
        }

        if (response.status === 413) {
          throw new NEyeError('PLANNER_ERROR', 'SafeContext payload size exceeded server limits.');
        }

        if (response.status === 429) {
          throw new NEyeError('PLANNER_ERROR', 'Planner rate limit exceeded. Please wait a moment.');
        }

        if (response.status >= 500 && attempts <= MAX_TRANSIENT_RETRIES) {
          // Bounded retry for transient 5xx server errors
          lastError = new NEyeError('NETWORK_ERROR', `Server error (${response.status}); retrying once...`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'Unknown error');
          throw new NEyeError('PLANNER_ERROR', `Planner gateway returned error (${response.status}): ${errBody.slice(0, 150)}`);
        }

        const data = await response.json();

        // STEP 3: Validate ActionProposal envelope from server
        if (!data || typeof data !== 'object' || !data.actionProposal) {
          throw new NEyeError('PLANNER_ERROR', 'Planner gateway returned malformed response envelope.');
        }

        const proposal = data.actionProposal as ActionProposal;
        if (!proposal.actionId || !proposal.type || !proposal.reasoning) {
          throw new NEyeError('PLANNER_ERROR', 'Returned proposal lacks required ActionProposal fields.');
        }

        // Validate proposal target safety (reject script or selector attempts)
        if (proposal.targetId && (proposal.targetId.includes('<') || proposal.targetId.includes('javascript:'))) {
          throw new NEyeError('PLANNER_ERROR', `Malicious targetId format detected: ${proposal.targetId}`);
        }

        return {
          proposal,
          metadata: {
            requestId: data.metadata?.requestId || requestId,
            provider: data.metadata?.provider || 'remote',
            model: data.metadata?.model || 'remote-model',
            planningLatencyMs: Number((data.metadata?.planningLatencyMs || networkDuration).toFixed(2)),
            payloadSizeBytes: bodyStr.length,
            inputTokenCount: data.metadata?.inputTokenCount,
            outputTokenCount: data.metadata?.outputTokenCount,
          },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (callerSignal) {
          callerSignal.removeEventListener('abort', abortListener);
        }

        if ((err as Error).name === 'AbortError' || callerSignal?.aborted) {
          throw new DOMException('Planner request was aborted by user.', 'AbortError');
        }

        lastError = err as Error;

        // Only retry on transient fetch failure, not on NEyeError
        if (err instanceof NEyeError && err.category === 'PLANNER_ERROR') {
          throw err;
        }

        if (attempts <= MAX_TRANSIENT_RETRIES) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
      }
    }

    throw new NEyeError(
      'NETWORK_ERROR',
      `Failed to reach planner gateway at ${gatewayUrl}: ${lastError?.message || 'Connection refused'}`
    );
  }
}
