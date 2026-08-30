import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createElementId,
  createPageEpoch,
  createTaskId,
  createTokenId,
  type SafeContext,
} from '@n-eye/protocol';
import { RemotePlanner } from '../planner/remote-planner.js';
import { PlannerTransportError, parseRetryAfterMs } from '../planner/transport-error.js';
import { abortableDelay } from '../runtime/abortable-delay.js';

function sampleContext(): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-resilience'),
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: 'Continue',
    pageMetadata: {
      origin: 'https://portal.example.com',
      sanitizedTitle: 'Login',
      viewport: { width: 1280, height: 800 },
    },
    safeElements: [
      {
        id: createElementId('e1'),
        role: 'button',
        safeLabel: 'Continue',
        inputType: 'submit',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 80, height: 24 },
      },
    ],
    availableTokens: [
      {
        tokenId: createTokenId('tok_1'),
        tokenSymbol: '[EMAIL_1]',
        privacyClass: 'PII_EMAIL',
        descriptionRole: 'email',
      },
    ],
  };
}

const okProposal = {
  actionProposal: {
    actionId: 'act_1',
    type: 'CLICK',
    targetId: 'e1',
    reasoning: 'Continue',
    expectedOutcome: 'Next',
    riskLevel: 'LOW',
  },
  metadata: { requestId: 'req_1', provider: 'mock', model: 'm', planningLatencyMs: 1 },
};

describe('Planner transport resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses Retry-After seconds and HTTP-date with a cap', () => {
    expect(parseRetryAfterMs('2', 1000, 5000)).toBe(2000);
    expect(parseRetryAfterMs('99', 1000, 5000)).toBe(5000);
    expect(parseRetryAfterMs(null, 1000, 5000)).toBe(1000);
  });

  it('classifies 429, retries once with Retry-After, then stops', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      })
    );
    await expect(planner.proposeAction(sampleContext())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map((call) => String((call[1] as RequestInit).body));
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[0]).not.toContain('CANARY_PASSWORD');
  });

  it('does not retry 404 misconfiguration', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('missing', { status: 404 })
    );
    await expect(planner.proposeAction(sampleContext())).rejects.toMatchObject({
      code: 'MISCONFIGURED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries 503 then exhausts', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('busy', { status: 503 }));
    await expect(planner.proposeAction(sampleContext())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed JSON without executing', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{', { status: 200 }));
    await expect(planner.proposeAction(sampleContext())).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('rejects empty 200 responses', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('   ', { status: 200 }));
    await expect(planner.proposeAction(sampleContext())).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('rejects schema-invalid proposals with extra authority fields', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          actionProposal: { ...okProposal.actionProposal, confirmed: true },
          metadata: okProposal.metadata,
        }),
        { status: 200 }
      )
    );
    await expect(planner.proposeAction(sampleContext())).rejects.toBeInstanceOf(PlannerTransportError);
  });

  it('cancellation during backoff prevents a further request', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const controller = new AbortController();
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        queueMicrotask(() => controller.abort());
        return new Response('busy', { status: 503 });
      }
      return new Response(JSON.stringify(okProposal), { status: 200 });
    });
    await expect(planner.proposeAction(sampleContext(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(calls).toBe(1);
  });

  it('late success after cancel is not returned', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          controller.abort();
          resolve(new Response(JSON.stringify(okProposal), { status: 200 }));
        })
    );
    await expect(planner.proposeAction(sampleContext(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });

  it('emits onRetry before a 503 backoff', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const notices: Array<{ nextAttempt: number; code: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('busy', { status: 503 }));
    await expect(
      planner.proposeAction(sampleContext(), {
        onRetry: (notice) => notices.push({ nextAttempt: notice.nextAttempt, code: notice.code }),
      })
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(notices).toEqual([
      { nextAttempt: 2, code: 'UNAVAILABLE' },
      { nextAttempt: 3, code: 'UNAVAILABLE' },
    ]);
  });

  it('abortableDelay rejects when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableDelay(10, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
