import { describe, expect, it } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type ActionProposal,
  type RawScene,
} from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { executeValidatedAction, readTypedFieldState } from '../execution/executor.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { resetTokenCounters } from '../privacy/policy.js';

const origin = 'https://portal.example.com';
const taskId = createTaskId('task-type-token');

function typeProposal(targetId: ReturnType<typeof createElementId>, tokenSymbol = '[EMAIL_1]'): ActionProposal {
  return {
    actionId: createActionId('act_tt'),
    type: 'TYPE_TOKEN',
    targetId,
    tokenSymbol,
    reasoning: 'fill email',
    expectedOutcome: 'populated',
    riskLevel: 'MEDIUM',
  };
}

describe('TYPE_TOKEN resulting-state verification', () => {
  it('succeeds only when the live control holds the intended value', () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" type="email" />
    `;
    resetTokenCounters();
    const registry = new ElementRegistry();
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'user@example.com', taskId, 1, origin, ['email', 'text', 'textbox']);
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'email');
    if (!target) throw new Error('expected email');
    const validated = validateActionProposal(typeProposal(target.id), pre, vault, taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(exec.fieldState).toBe('MATCHED');
    const json = JSON.stringify(exec);
    expect(json).not.toContain('user@example.com');
    const post = observePage(registry, createPageEpoch(2));
    const verification = verifyActionExecution(validated, pre, post, { fieldState: exec.fieldState });
    expect(verification.status).toBe('VERIFIED_SUCCESS');
    expect(JSON.stringify(verification)).not.toContain('user@example.com');
  });

  it('fails when dispatch is overwritten by the application', () => {
    document.body.innerHTML = `<label for="email">Email</label><input id="email" type="email" />`;
    const input = document.getElementById('email') as HTMLInputElement;
    input.addEventListener('input', () => {
      input.value = '';
    });
    resetTokenCounters();
    const registry = new ElementRegistry();
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'user@example.com', taskId, 1, origin, ['email', 'text', 'textbox']);
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'email');
    if (!target) throw new Error('expected email');
    const validated = validateActionProposal(typeProposal(target.id), pre, vault, taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.fieldState).toBe('EMPTY');
    const verification = verifyActionExecution(validated, pre, pre, { fieldState: exec.fieldState });
    expect(verification.status).toBe('VERIFIED_FAILURE');
    expect(verification.observedDelta).not.toMatch(/dispatch/i);
  });

  it('does not treat missing field evidence as success', () => {
    const action = {
      _isValidated: true as const,
      proposal: typeProposal(createElementId('e1')),
      targetElementId: createElementId('e1'),
      approvedRiskLevel: 'MEDIUM' as const,
      timestamp: Date.now(),
    };
    const scene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: `${origin}/form`,
      origin,
      title: 'Form',
      viewport: { width: 800, height: 600 },
      elements: [],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    const verification = verifyActionExecution(action, scene, scene);
    expect(verification.status).toBe('AMBIGUOUS');
  });

  it('readTypedFieldState never returns the raw value', () => {
    document.body.innerHTML = `<input id="email" type="email" value="secret@example.com" />`;
    const node = document.getElementById('email') as HTMLInputElement;
    const state = readTypedFieldState(node, 'secret@example.com');
    expect(state).toBe('MATCHED');
    expect(state).not.toContain('@');
  });
});
