import { describe, it, expect, beforeEach } from 'vitest';
import { createActionId, createPageEpoch, createTaskId, type ActionProposal } from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { PrivateTokenVault } from '../privacy/vault.js';

describe('TOCTOU final authority check', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `<button id="go">Continue</button>`;
  });

  it('blocks when the live node mutates after validation and before dispatch', () => {
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('missing');
    const proposal: ActionProposal = {
      actionId: createActionId('act-toctou'),
      type: 'CLICK',
      targetId: target.id,
      reasoning: 'Click',
      expectedOutcome: 'Go',
      riskLevel: 'LOW',
    };
    const validated = validateActionProposal(
      proposal,
      scene,
      new PrivateTokenVault(),
      createTaskId('toctou'),
      'https://example.com'
    );

    const btn = document.getElementById('go') as HTMLButtonElement;
    btn.addEventListener('focus', () => {
      btn.textContent = 'Delete account';
    });

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('BLOCK');
  });
});
