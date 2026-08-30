/**
 * Remote Planner Client (Zone 4/5 Network Boundary)
 *
 * OWNS: Outbound transport of egress-guarded SafeContext to the remote planner gateway.
 * TRUST BOUNDARY: Enforces mandatory Egress Guard inspection before serializing network requests.
 * MUST NOT: Send RawScene, bypass EgressGuard, store provider keys, or execute remote responses directly.
 * RETRY: Bounded, cancellable, same protected payload. Never retries with a broader/raw context.
 */

import {
  type ActionProposal,
  type SafeContext,
  NEyeError,
  sanitizeUnicodeDeep,
} from '@n-eye/protocol';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { assertProposalShape } from '../authority/proposal-schema.js';
import { abortableDelay } from '../runtime/abortable-delay.js';
import type { Planner, PlannerOptions, PlannerProposalResult } from './types.js';
import {
  PLANNER_429_DEFAULT_DELAY_MS,
  PLANNER_429_MAX_EXTRA_ATTEMPTS,
  PLANNER_MAX_ATTEMPTS,
  PLANNER_RETRY_MAX_DELAY_MS,
  PlannerTransportError,
  parseRetryAfterMs,
  retryBackoffMs,
} from './transport-error.js';

const DEFAULT_GATEWAY_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 15000;

function cancelledError(attempt: number): PlannerTransportError {
  return new PlannerTransportError({
    code: 'CANCELLED',
    message: 'Planner request was aborted by user.',
    retryable: false,
    attempt,
  });
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

async function waitBeforeRetry(
  options: PlannerOptions | undefined,
  attempt: number,
  error: PlannerTransportError,
  waitMs: number
): Promise<void> {
  options?.onRetry?.({
    attempt,
    nextAttempt: attempt + 1,
    code: error.code,
    delayMs: waitMs,
  });
  await abortableDelay(waitMs, options?.signal);
}

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

    // STEP 1: Mandatory Egress Guard checkpoint on Unicode-safe SafeContext.
    // Encoding failure must not retry with raw DOM/OCR/screenshot or a broader payload.
    let serializedContextBytes: string;
    try {
      serializedContextBytes = validateSafeContextEgress(sanitizeUnicodeDeep(context));
    } catch (err) {
      throw new NEyeError(
        'PRIVACY_ERROR',
        `Egress guard blocked outbound planner request: ${(err as Error).message}`
      );
    }

    const payloadObj = {
      requestId,
      safeContext: JSON.parse(serializedContextBytes) as SafeContext,
    };
    const bodyStr = JSON.stringify(payloadObj);

    let lastError: PlannerTransportError | null = null;
    let rateLimitRetries = 0;

    for (let attempt = 1; attempt <= PLANNER_MAX_ATTEMPTS; attempt += 1) {
      if (callerSignal?.aborted) {
        throw cancelledError(attempt);
      }

      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

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

        if (callerSignal?.aborted) {
          throw cancelledError(attempt);
        }

        const networkDuration = performance.now() - startTime;
        const classified = classifyPlannerHttp(response, attempt);

        if (!classified.ok) {
          lastError = classified.error;
          const mayRetry = classified.error.retryable && attempt < PLANNER_MAX_ATTEMPTS;
          const rateLimited = classified.error.code === 'RATE_LIMITED';
          if (rateLimited) {
            rateLimitRetries += 1;
            if (rateLimitRetries > PLANNER_429_MAX_EXTRA_ATTEMPTS) {
              throw classified.error;
            }
          }
          if (!mayRetry) {
            throw classified.error;
          }
          const waitMs =
            classified.error.retryAfterMs ?? retryBackoffMs(attempt);
          await waitBeforeRetry(options, attempt, classified.error, waitMs);
          continue;
        }

        let data: unknown;
        try {
          const text = await response.text();
          if (!text.trim()) {
            throw new PlannerTransportError({
              code: 'MALFORMED_RESPONSE',
              message: 'Planner returned an empty response.',
              retryable: false,
              httpStatus: response.status,
              attempt,
            });
          }
          data = JSON.parse(text) as unknown;
        } catch (err) {
          if (err instanceof PlannerTransportError) throw err;
          throw new PlannerTransportError({
            code: 'MALFORMED_RESPONSE',
            message: 'Planner returned invalid JSON.',
            retryable: false,
            httpStatus: response.status,
            attempt,
          });
        }

        if (!data || typeof data !== 'object' || !('actionProposal' in data)) {
          throw new PlannerTransportError({
            code: 'MALFORMED_RESPONSE',
            message: 'Planner gateway returned a malformed response envelope.',
            retryable: false,
            httpStatus: response.status,
            attempt,
          });
        }

        const envelope = data as { actionProposal: unknown; metadata?: Record<string, unknown> };
        const proposal = envelope.actionProposal as ActionProposal;
        if (!proposal || typeof proposal !== 'object' || !proposal.actionId || !proposal.type || !proposal.reasoning) {
          throw new PlannerTransportError({
            code: 'MALFORMED_RESPONSE',
            message: 'Returned proposal lacks required ActionProposal fields.',
            retryable: false,
            attempt,
          });
        }

        if (proposal.targetId && (proposal.targetId.includes('<') || proposal.targetId.includes('javascript:'))) {
          throw new PlannerTransportError({
            code: 'MALFORMED_RESPONSE',
            message: 'Malicious targetId format detected.',
            retryable: false,
            attempt,
          });
        }

        let safeProposal: ActionProposal;
        try {
          safeProposal = assertProposalShape(proposal);
        } catch (err) {
          throw new PlannerTransportError({
            code: 'MALFORMED_RESPONSE',
            message: `Rejected planner proposal: ${(err as Error).message}`,
            retryable: false,
            attempt,
          });
        }

        const latencyRaw = envelope.metadata?.['planningLatencyMs'];
        return {
          proposal: safeProposal,
          metadata: {
            requestId: String(envelope.metadata?.['requestId'] || requestId),
            provider: String(envelope.metadata?.['provider'] || 'remote'),
            model: String(envelope.metadata?.['model'] || 'remote-model'),
            planningLatencyMs: Number(
              (typeof latencyRaw === 'number' ? latencyRaw : networkDuration).toFixed(2)
            ),
            payloadSizeBytes: bodyStr.length,
            inputTokenCount:
              typeof envelope.metadata?.['inputTokenCount'] === 'number'
                ? envelope.metadata['inputTokenCount']
                : undefined,
            outputTokenCount:
              typeof envelope.metadata?.['outputTokenCount'] === 'number'
                ? envelope.metadata['outputTokenCount']
                : undefined,
            attempt,
          },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (callerSignal) {
          callerSignal.removeEventListener('abort', abortListener);
        }

        if (isAbortError(err) || callerSignal?.aborted) {
          const timeoutAbort = timedOut && !callerSignal?.aborted;
          if (timeoutAbort) {
            lastError = new PlannerTransportError({
              code: 'TIMEOUT',
              message: 'Planner request timed out.',
              retryable: true,
              attempt,
            });
            if (attempt < PLANNER_MAX_ATTEMPTS) {
              await waitBeforeRetry(options, attempt, lastError, retryBackoffMs(attempt));
              continue;
            }
            throw lastError;
          }
          throw cancelledError(attempt);
        }

        if (err instanceof PlannerTransportError) {
          lastError = err;
          const mayRetry = err.retryable && attempt < PLANNER_MAX_ATTEMPTS;
          if (!mayRetry) throw err;
          if (err.code === 'RATE_LIMITED') {
            rateLimitRetries += 1;
            if (rateLimitRetries > PLANNER_429_MAX_EXTRA_ATTEMPTS) throw err;
          }
          await waitBeforeRetry(options, attempt, err, err.retryAfterMs ?? retryBackoffMs(attempt));
          continue;
        }

        lastError = new PlannerTransportError({
          code: 'NETWORK_FAILURE',
          message: 'Failed to reach planner gateway.',
          retryable: true,
          attempt,
        });
        if (attempt < PLANNER_MAX_ATTEMPTS) {
          await waitBeforeRetry(options, attempt, lastError, retryBackoffMs(attempt));
          continue;
        }
      }
    }

    throw (
      lastError ||
      new PlannerTransportError({
        code: 'NETWORK_FAILURE',
        message: 'Failed to reach planner gateway.',
        retryable: false,
        attempt: PLANNER_MAX_ATTEMPTS,
      })
    );
  }
}

function classifyPlannerHttp(
  response: Response,
  attempt: number
): { ok: true } | { ok: false; error: PlannerTransportError } {
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'AUTH_FAILED',
        message: 'Planner gateway authentication failed on server.',
        retryable: false,
        httpStatus: response.status,
        attempt,
      }),
    };
  }
  if (response.status === 413) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'SafeContext payload size exceeded server limits.',
        retryable: false,
        httpStatus: 413,
        attempt,
      }),
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'MISCONFIGURED',
        message: 'Planner provider endpoint or model is misconfigured.',
        retryable: false,
        httpStatus: 404,
        attempt,
      }),
    };
  }
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(
      response.headers.get('Retry-After'),
      PLANNER_429_DEFAULT_DELAY_MS,
      PLANNER_RETRY_MAX_DELAY_MS
    );
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'RATE_LIMITED',
        message: 'Planner provider rate limited.',
        retryable: true,
        httpStatus: 429,
        retryAfterMs,
        attempt,
      }),
    };
  }
  if (response.status === 504) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'TIMEOUT',
        message: 'Planner request timed out.',
        retryable: true,
        httpStatus: 504,
        attempt,
      }),
    };
  }
  if (response.status === 503) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'UNAVAILABLE',
        message: 'Planner provider temporarily unavailable.',
        retryable: true,
        httpStatus: 503,
        attempt,
      }),
    };
  }
  if (response.status >= 500) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'UNAVAILABLE',
        message: 'Planner provider returned a temporary server error.',
        retryable: true,
        httpStatus: response.status,
        attempt,
      }),
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: new PlannerTransportError({
        code: 'UNKNOWN_SAFE_FAILURE',
        message: `Planner gateway returned error (${response.status}).`,
        retryable: false,
        httpStatus: response.status,
        attempt,
      }),
    };
  }
  return { ok: true };
}
