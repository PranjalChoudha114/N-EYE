import { describe, expect, it } from 'vitest';
import {
  createActionId,
  createPageEpoch,
  createTaskId,
  sanitizeUnicodeDeep,
  type ActionProposal,
  type RawScene,
} from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { executeValidatedAction } from '../execution/executor.js';
import { validateActionProposal, ActionValidationError } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { assertProposalShape, MalformedProposalError } from '../authority/proposal-schema.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';

const taskId = createTaskId('task-select-scroll');
const origin = 'https://portal.example.com';

function proposal(over: Partial<ActionProposal> & Pick<ActionProposal, 'type'>): ActionProposal {
  return {
    actionId: createActionId('act_ss'),
    reasoning: 'test',
    expectedOutcome: 'change',
    riskLevel: 'LOW',
    ...over,
  };
}

function sceneFromDom(registry: ElementRegistry): RawScene {
  return observePage(registry, createPageEpoch(1));
}

describe('SELECT executor', () => {
  it('selects a native option and verifies resulting state', () => {
    document.body.innerHTML = `
      <label for="country">Country</label>
      <select id="country">
        <option value="in">India</option>
        <option value="us">United States</option>
      </select>
    `;
    const registry = new ElementRegistry();
    const pre = sceneFromDom(registry);
    const target = pre.elements.find((e) => e.inputType === 'select');
    if (!target) throw new Error('expected native select');
    const validated = validateActionProposal(
      proposal({ type: 'SELECT', targetId: target.id, textValue: 'India' }),
      pre,
      new PrivateTokenVault(),
      taskId,
      origin
    );
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(exec.selectMatched).toBe(true);
    const select = document.getElementById('country') as HTMLSelectElement;
    expect(select.value).toBe('in');
    const post = observePage(registry, createPageEpoch(2));
    const verification = verifyActionExecution(validated, pre, post, { selectMatched: exec.selectMatched });
    expect(verification.status).toBe('VERIFIED_SUCCESS');
  });

  it('rejects a nonexistent option', () => {
    document.body.innerHTML = `<select id="country"><option value="in">India</option></select>`;
    const registry = new ElementRegistry();
    const pre = sceneFromDom(registry);
    const target = pre.elements.find((e) => e.inputType === 'select');
    if (!target) throw new Error('expected native select');
    const validated = validateActionProposal(
      proposal({ type: 'SELECT', targetId: target.id, textValue: 'Mars' }),
      pre,
      new PrivateTokenVault(),
      taskId,
      origin
    );
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(false);
    expect(exec.outcome).toBe('ASK_USER');
  });

  it('rejects SELECT on a non-select control', () => {
    document.body.innerHTML = `<button id="go">Go</button>`;
    const registry = new ElementRegistry();
    const pre = sceneFromDom(registry);
    const target = pre.elements[0];
    if (!target) throw new Error('expected button');
    expect(() =>
      validateActionProposal(
        proposal({ type: 'SELECT', targetId: target.id, textValue: 'Go' }),
        pre,
        new PrivateTokenVault(),
        taskId,
        origin
      )
    ).toThrow(ActionValidationError);
  });

  it('rejects a disabled select', () => {
    document.body.innerHTML = `<select id="country" disabled><option>India</option></select>`;
    const registry = new ElementRegistry();
    const pre = sceneFromDom(registry);
    const target = pre.elements.find((e) => e.inputType === 'select');
    if (!target) {
      // Disabled native selects may be excluded as not enabled; either absence or validation fail is closed.
      expect(pre.elements.some((e) => e.isEnabled && e.inputType === 'select')).toBe(false);
      return;
    }
    expect(() =>
      validateActionProposal(
        proposal({ type: 'SELECT', targetId: target.id, textValue: 'India' }),
        pre,
        new PrivateTokenVault(),
        taskId,
        origin
      )
    ).toThrow(/disabled/i);
  });
});

describe('SCROLL executor', () => {
  it('performs a bounded viewport scroll', () => {
    document.body.innerHTML = `<div style="height:4000px">tall</div><button id="x">X</button>`;
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 4000 });
    const registry = new ElementRegistry();
    const pre = sceneFromDom(registry);
    const validated = validateActionProposal(
      proposal({ type: 'SCROLL', scrollDelta: { x: 0, y: 200 } }),
      pre,
      new PrivateTokenVault(),
      taskId,
      origin
    );
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    expect(exec.scrollMoved === true || exec.atScrollBoundary === true).toBe(true);
  });

  it('rejects pathological scrollDelta', () => {
    expect(() =>
      assertProposalShape({
        actionId: 'act_1',
        type: 'SCROLL',
        scrollDelta: { x: 0, y: 99999 },
        reasoning: 'no',
        expectedOutcome: 'no',
        riskLevel: 'LOW',
      })
    ).toThrow(MalformedProposalError);
  });

  it('rejects non-finite scrollDelta', () => {
    expect(() =>
      assertProposalShape({
        actionId: 'act_1',
        type: 'SCROLL',
        scrollDelta: { x: Number.NaN, y: 10 },
        reasoning: 'no',
        expectedOutcome: 'no',
        riskLevel: 'LOW',
      })
    ).toThrow(MalformedProposalError);
  });
});

describe('SELECT privacy in SafeContext', () => {
  it('includes sanitized option labels without expanding egress class', () => {
    document.body.innerHTML = `
      <label for="country">Country</label>
      <select id="country">
        <option value="in">India</option>
        <option value="us">United States</option>
      </select>
    `;
    resetTokenCounters();
    const registry = new ElementRegistry();
    const raw = sceneFromDom(registry);
    const ctx = buildSafeContext(raw, 'Choose India', evaluatePrivacyPolicy([]), new PrivateTokenVault(), taskId, []);
    const label = ctx.safeElements.find((e) => e.inputType === 'select')?.safeLabel || '';
    expect(label).toMatch(/India|Country/i);
    expect(sanitizeUnicodeDeep(ctx).protocolVersion).toBe('1.0.0');
  });
});
