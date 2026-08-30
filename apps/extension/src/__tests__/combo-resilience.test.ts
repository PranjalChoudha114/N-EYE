import { describe, expect, it, vi, afterEach } from 'vitest';
import { createActionId, createPageEpoch, createTaskId } from '@n-eye/protocol';
import { RemotePlanner } from '../planner/remote-planner.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { executeValidatedAction } from '../execution/executor.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { assertProposalShape } from '../authority/proposal-schema.js';

describe('Adversarial T017/T018 combinations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A: malformed Unicode + canaries + retry keeps the same protected payload', async () => {
    document.body.innerHTML = `
      <input type="password" value="CANARY_PASSWORD_T017" />
      <input type="email" id="em" value="CANARY_EMAIL_T017@example.com" />
      <button>Go</button>
    `;
    resetTokenCounters();
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    scene.title = 'YouTube \uD83D';
    const vault = new PrivateTokenVault();
    const findings = [...scene.privacyFindings, ...detectGoalPrivacy('use CANARY_PASSWORD_T017')];
    const decisions = evaluatePrivacyPolicy(findings);
    const safe = buildSafeContext(scene, 'Continue', decisions, vault, createTaskId('task-a'), findings);
    const serialized = validateSafeContextEgress(safe);
    expect(serialized).not.toContain('CANARY_PASSWORD_T017');
    expect(serialized).not.toContain('CANARY_OTP_T017');
    expect(serialized).not.toContain('CANARY_API_T017');
    const planner = new RemotePlanner('http://localhost:8000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('busy', { status: 503 }));
    await expect(planner.proposeAction(safe)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const bodies = fetchSpy.mock.calls.map((c) => String((c[1] as RequestInit).body));
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain('CANARY_PASSWORD_T017');
    expect(bodies[0]?.toLowerCase()).not.toContain('\\ud83d');
  });

  it('I: malformed proposal with extra authority fields is still rejected', () => {
    expect(() =>
      assertProposalShape({
        actionId: 'act_1',
        type: 'CLICK',
        targetId: 'e1',
        reasoning: 'x',
        expectedOutcome: 'y',
        riskLevel: 'LOW',
        confirmed: true,
        selector: '#danger',
      })
    ).toThrow(/authority|unsupported/i);
  });

  it('F: SELECT on a replaced SPA node fails closed', () => {
    document.body.innerHTML = `<select id="country"><option>India</option></select>`;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'select');
    if (!target) throw new Error('expected native select');
    const validated = validateActionProposal(
      {
        actionId: createActionId('act_sel'),
        type: 'SELECT',
        targetId: target.id,
        textValue: 'India',
        reasoning: 'choose',
        expectedOutcome: 'selected',
        riskLevel: 'LOW',
      },
      pre,
      new PrivateTokenVault(),
      createTaskId('task-f'),
      'https://portal.example.com'
    );
    document.getElementById('country')?.remove();
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(false);
  });

  it('H: TYPE_TOKEN dispatch overwrite is not SUCCESS', () => {
    document.body.innerHTML = `<label for="em">Email</label><input id="em" type="email" />`;
    const input = document.getElementById('em') as HTMLInputElement;
    input.addEventListener('change', () => {
      input.value = 'overwritten';
    });
    const registry = new ElementRegistry();
    const vault = new PrivateTokenVault();
    const taskId = createTaskId('task-h');
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'user@example.com', taskId, 1, 'https://portal.example.com', [
      'email',
      'text',
      'textbox',
    ]);
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'email');
    if (!target) throw new Error('expected email');
    const validated = validateActionProposal(
      {
        actionId: createActionId('act_h'),
        type: 'TYPE_TOKEN',
        targetId: target.id,
        tokenSymbol: '[EMAIL_1]',
        reasoning: 'fill',
        expectedOutcome: 'filled',
        riskLevel: 'MEDIUM',
      },
      pre,
      vault,
      taskId,
      'https://portal.example.com'
    );
    const exec = executeValidatedAction(validated, registry);
    const verification = verifyActionExecution(validated, pre, pre, { fieldState: exec.fieldState });
    expect(verification.status).not.toBe('VERIFIED_SUCCESS');
  });
});
