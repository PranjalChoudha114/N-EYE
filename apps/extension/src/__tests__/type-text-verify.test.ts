import { describe, expect, it } from 'vitest';
import { createActionId, createPageEpoch, createTaskId, type ActionProposal } from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { executeValidatedAction, probeTypedField, readTypedFieldState } from '../execution/executor.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { pickUniqueTypeTextTarget } from '../planner/mock-grammar.js';

const origin = 'https://portal.example.com';
const taskId = createTaskId('task-type-text');

function typeText(targetId: ActionProposal['targetId'], text = 'OpenAI'): ActionProposal {
  return {
    actionId: createActionId('act_text'),
    type: 'TYPE_TEXT',
    targetId,
    textValue: text,
    reasoning: 'type',
    expectedOutcome: 'filled',
    riskLevel: 'LOW',
  };
}

describe('TYPE_TEXT resulting-state verification', () => {
  it('plain search input: native setter + MATCHED evidence without raw text', () => {
    document.body.innerHTML = `<label for="q">Search</label><input id="q" type="search" placeholder="Search" />`;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'search');
    if (!target) throw new Error('expected search');
    const validated = validateActionProposal(typeText(target.id), pre, new PrivateTokenVault(), taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(exec.fieldState).toBe('MATCHED');
    expect((document.getElementById('q') as HTMLInputElement).value).toBe('OpenAI');
    expect(JSON.stringify(exec)).not.toContain('OpenAI');
    const post = observePage(registry, createPageEpoch(2));
    const verification = verifyActionExecution(validated, pre, post, { fieldState: exec.fieldState });
    expect(verification.status).toBe('VERIFIED_SUCCESS');
    expect(JSON.stringify(verification)).not.toContain('OpenAI');
  });

  it('controlled input: InputEvent keeps a listener-backed store in sync', () => {
    document.body.innerHTML = `<label for="q">Search</label><input id="q" type="text" />`;
    let store = '';
    const input = document.getElementById('q') as HTMLInputElement;
    input.addEventListener('input', () => {
      store = input.value;
    });
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.id);
    if (!target) throw new Error('expected input');
    const validated = validateActionProposal(typeText(target.id), pre, new PrivateTokenVault(), taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.fieldState).toBe('MATCHED');
    expect(store).toBe('OpenAI');
  });

  it('overwrite-on-input is not success', () => {
    document.body.innerHTML = `<label for="q">Search</label><input id="q" type="search" />`;
    const input = document.getElementById('q') as HTMLInputElement;
    input.addEventListener('input', () => {
      input.value = '';
    });
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'search');
    if (!target) throw new Error('expected search');
    const validated = validateActionProposal(typeText(target.id), pre, new PrivateTokenVault(), taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(exec.fieldState).toBe('EMPTY');
    const verification = verifyActionExecution(validated, pre, pre, { fieldState: exec.fieldState });
    expect(verification.status).toBe('VERIFIED_FAILURE');
  });

  it('rerender-after-input re-grounds a unique equivalent field', () => {
    document.body.innerHTML = `<label for="q">Search</label><input id="q" type="search" placeholder="Search" />`;
    const input = document.getElementById('q') as HTMLInputElement;
    input.addEventListener('input', () => {
      const next = document.createElement('input');
      next.id = 'q';
      next.type = 'search';
      next.placeholder = 'Search';
      next.value = input.value;
      input.replaceWith(next);
    });
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.inputType === 'search');
    if (!target) throw new Error('expected search');
    const validated = validateActionProposal(typeText(target.id), pre, new PrivateTokenVault(), taskId, origin);
    executeValidatedAction(validated, registry);
    const postRegistry = new ElementRegistry();
    observePage(postRegistry, createPageEpoch(2));
    const probe = probeTypedField(validated, postRegistry);
    expect(probe.fieldState).toBe('MATCHED');
    expect((document.getElementById('q') as HTMLInputElement).value).toBe('OpenAI');
  });

  it('duplicate search boxes abstain', () => {
    document.body.innerHTML = `
      <input type="search" placeholder="Search" aria-label="Search" />
      <input type="search" placeholder="Search" aria-label="Search" />
    `;
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const picked = pickUniqueTypeTextTarget(scene.elements, ['search']);
    expect(picked.ok).toBe(false);
  });

  it('contenteditable: bounded plain text MATCHED', () => {
    document.body.innerHTML = `<div id="ed" role="textbox" contenteditable="true" aria-label="Notes"></div>`;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.role === 'textbox');
    if (!target) throw new Error('expected editor');
    const validated = validateActionProposal(typeText(target.id, 'Hello'), pre, new PrivateTokenVault(), taskId, origin);
    const exec = executeValidatedAction(validated, registry);
    expect(['MATCHED', 'DIVERGED']).toContain(exec.fieldState);
    const node = document.getElementById('ed') as HTMLElement;
    if (exec.fieldState === 'MATCHED') {
      expect(readTypedFieldState(node, 'Hello')).toBe('MATCHED');
    }
    const verification = verifyActionExecution(validated, pre, pre, { fieldState: exec.fieldState });
    if (exec.fieldState !== 'MATCHED') {
      expect(verification.status).not.toBe('VERIFIED_SUCCESS');
    }
  });

  it('planner COMPLETE is not local TYPE_TEXT success', () => {
    const action = {
      _isValidated: true as const,
      proposal: {
        actionId: createActionId('act_c'),
        type: 'COMPLETE' as const,
        reasoning: 'All available goal actions completed on current page state.',
        expectedOutcome: 'done',
        riskLevel: 'LOW' as const,
      },
      approvedRiskLevel: 'LOW' as const,
      timestamp: Date.now(),
    };
    const scene = {
      _isLocalOnly: true as const,
      pageEpoch: createPageEpoch(1),
      url: `${origin}/`,
      origin,
      title: 'x',
      viewport: { width: 800, height: 600 },
      elements: [],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    const verification = verifyActionExecution(action, scene, scene);
    expect(verification.status).not.toBe('VERIFIED_SUCCESS');
  });
});
