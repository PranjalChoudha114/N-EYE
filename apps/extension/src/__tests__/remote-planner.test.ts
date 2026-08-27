/**
 * Remote Planner Client & Gateway Protocol Test Suite (Task 005/006)
 *
 * OWNS: Verifying that RemotePlanner strictly enforces SafeContext egress guarding,
 * handles timeouts and cancellations, rejects malformed server responses, and
 * prevents malicious selector or script injection.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RemotePlanner } from '../planner/remote-planner.js';
import { PlannerManager } from '../planner/planner-manager.js';
import {
  type SafeContext,
  createPageEpoch,
  createTaskId,
  createTokenId,
  createElementId,
} from '@n-eye/protocol';

describe('Remote Planner Client & Gateway Security Suite', () => {
  let sampleContext: SafeContext;

  beforeEach(() => {
    sampleContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-test-01'),
      pageEpoch: createPageEpoch(1),
      sanitizedGoal: 'Enter my email and continue',
      pageMetadata: {
        origin: 'https://portal.example.com',
        sanitizedTitle: 'Login Page',
        viewport: { width: 1280, height: 800 },
      },
      safeElements: [
        {
          id: createElementId('e1'),
          role: 'textbox',
          safeLabel: 'Email Address',
          inputType: 'email',
          isEnabled: true,
          bbox: { x: 100, y: 150, width: 200, height: 40 },
        },
        {
          id: createElementId('e2'),
          role: 'button',
          safeLabel: 'Continue',
          inputType: 'submit',
          isEnabled: true,
          bbox: { x: 100, y: 220, width: 150, height: 40 },
        },
      ],
      availableTokens: [
        {
          tokenId: createTokenId('tok_1'),
          tokenSymbol: '[EMAIL_1]',
          privacyClass: 'PII_EMAIL',
          descriptionRole: 'Primary user email',
        },
      ],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces SafeContext egress validation before initiating any network request', async () => {
    const planner = new RemotePlanner('http://localhost:8000');

    // Create invalid context with leaked raw property
    const leakedContext = {
      ...sampleContext,
      _isLocalOnly: true,
    } as unknown as SafeContext;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(planner.proposeAction(leakedContext)).rejects.toThrow(
      /Egress guard blocked outbound planner request/
    );

    // Fetch MUST NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('successfully receives and parses valid ActionProposal from planner gateway', async () => {
    const planner = new RemotePlanner('http://localhost:8000');

    const mockResponse = {
      actionProposal: {
        actionId: 'act_1001',
        type: 'TYPE_TOKEN',
        targetId: 'e1',
        tokenId: 'tok_1',
        tokenSymbol: '[EMAIL_1]',
        reasoning: 'Input matches email role',
        expectedOutcome: 'Populated with scoped token',
        riskLevel: 'MEDIUM',
      },
      metadata: {
        requestId: 'req_123',
        provider: 'mock',
        model: 'deterministic-v1',
        planningLatencyMs: 25.4,
        inputTokenCount: 100,
        outputTokenCount: 30,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await planner.proposeAction(sampleContext);

    expect(result.proposal.type).toBe('TYPE_TOKEN');
    expect(result.proposal.targetId).toBe('e1');
    expect(result.metadata.planningLatencyMs).toBe(25.4);
    expect(result.metadata.provider).toBe('mock');
  });

  it('aborts request immediately when caller cancels via AbortSignal', async () => {
    const planner = new RemotePlanner('http://localhost:8000');
    const controller = new AbortController();

    // Abort before/during call
    controller.abort();

    await expect(
      planner.proposeAction(sampleContext, { signal: controller.signal })
    ).rejects.toThrow(/aborted/);
  });

  it('rejects malicious targetId attempting script injection or selector escape', async () => {
    const planner = new RemotePlanner('http://localhost:8000');

    const rogueResponse = {
      actionProposal: {
        actionId: 'act_rogue',
        type: 'CLICK',
        targetId: '<script>alert(1)</script>',
        reasoning: 'Exploit attempt',
        expectedOutcome: 'XSS',
        riskLevel: 'HIGH',
      },
      metadata: {
        requestId: 'req_rogue',
        provider: 'untrusted',
        model: 'model',
        planningLatencyMs: 10,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(rogueResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(planner.proposeAction(sampleContext)).rejects.toThrow(
      /Malicious targetId format detected/
    );
  });

  it('PlannerManager correctly switches modes and checks gateway health', async () => {
    const manager = new PlannerManager('MOCK', 'http://localhost:8000');
    expect(manager.getMode()).toBe('MOCK');

    // In mock mode, uses deterministic planner
    const mockRes = await manager.propose(sampleContext);
    expect(mockRes.proposal.type).toBe('TYPE_TOKEN');
    expect(mockRes.metadata.provider).toBe('mock');

    // Switch to REMOTE mode
    manager.setMode('REMOTE');
    expect(manager.getMode()).toBe('REMOTE');

    // Mock gateway /v1/health response
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'healthy',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          version: '1.0.0',
        }),
        { status: 200 }
      )
    );

    const health = await manager.checkGatewayHealth();
    expect(health.healthy).toBe(true);
    expect(health.provider).toBe('gemini');
    expect(health.model).toBe('gemini-2.5-flash');
  });
});
