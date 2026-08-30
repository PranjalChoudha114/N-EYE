import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createElementId,
  createPageEpoch,
  createTaskId,
  createTokenId,
  sanitizeUnicodeScalars,
  UNICODE_REPLACEMENT,
  type SafeContext,
} from '@n-eye/protocol';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { RemotePlanner } from '../planner/remote-planner.js';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      actionProposal: {
        actionId: 'act_1',
        type: 'COMPLETE',
        reasoning: 'done',
        expectedOutcome: 'done',
        riskLevel: 'LOW',
      },
      metadata: { requestId: 'req_u', provider: 'mock', model: 'm', planningLatencyMs: 1 },
    }),
    { status: 200 }
  );
}

describe('Unicode SafeContext transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reproduces JSON lone-surrogate encoding then repairs it', () => {
    const broken = JSON.stringify({ title: 'YouTube \uD83D' });
    expect(broken.toLowerCase()).toContain('\\ud83d');
    const repaired = JSON.stringify({ title: sanitizeUnicodeScalars('YouTube \uD83D') });
    expect(repaired.toLowerCase()).not.toContain('\\ud83d');
    expect(repaired).toContain(JSON.stringify(UNICODE_REPLACEMENT).slice(1, -1));
  });

  it('preserves valid emoji and multilingual labels through SafeContext + egress', () => {
    document.body.innerHTML = `<button id="play">Play 😀 हिन्दी 中文</button>`;
    resetTokenCounters();
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    scene.title = 'Watch 😀';
    const ctx = buildSafeContext(
      scene,
      'Play the video',
      evaluatePrivacyPolicy([]),
      new PrivateTokenVault(),
      createTaskId('task-uni-valid'),
      []
    );
    const serialized = validateSafeContextEgress(ctx);
    expect(serialized).toContain('😀');
    expect(serialized).toContain('हिन्दी');
    expect(serialized).toContain('中文');
  });

  it('sanitizes malformed surrogates in page-derived SafeContext and still egresses', () => {
    document.body.innerHTML = `<button id="play">Play</button>`;
    resetTokenCounters();
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    scene.title = 'YouTube \uD83D';
    const labeled = scene.elements[0];
    if (labeled) labeled.innerTextCandidate = `Play \uD83D`;
    const ctx = buildSafeContext(
      scene,
      'Play',
      evaluatePrivacyPolicy(detectGoalPrivacy('Play')),
      new PrivateTokenVault(),
      createTaskId('task-uni-bad'),
      []
    );
    expect(ctx.pageMetadata.sanitizedTitle).toContain(UNICODE_REPLACEMENT);
    expect(ctx.pageMetadata.sanitizedTitle).not.toContain('\uD83D');
    const serialized = validateSafeContextEgress(ctx);
    expect(serialized.toLowerCase()).not.toContain('\\ud83d');
    JSON.parse(serialized);
  });

  it('retry uses the same protected payload and does not leak T017 canaries', async () => {
    const ctx: SafeContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-uni-retry'),
      pageEpoch: createPageEpoch(1),
      sanitizedGoal: 'Continue with [EMAIL_1]',
      pageMetadata: {
        origin: 'https://portal.example.com',
        sanitizedTitle: `YouTube ${UNICODE_REPLACEMENT}`,
        viewport: { width: 800, height: 600 },
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
    const planner = new RemotePlanner('http://localhost:8000');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse());
    const result = await planner.proposeAction(ctx);
    expect(result.proposal.type).toBe('COMPLETE');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map((call) => String((call[1] as RequestInit).body));
    const firstBody = bodies[0] ?? '';
    expect(firstBody).toBe(bodies[1]);
    expect(firstBody).not.toContain('CANARY_PASSWORD_T017');
    expect(firstBody).not.toContain('CANARY_OTP_T017');
    expect(firstBody).not.toContain('CANARY_API_T017');
    expect(firstBody).not.toContain('CANARY_EMAIL_T017@example.com');
    expect(firstBody.toLowerCase()).not.toContain('\\ud83d');
  });
});
