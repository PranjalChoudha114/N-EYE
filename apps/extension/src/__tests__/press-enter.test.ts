import { describe, expect, it, beforeEach } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type ActionProposal,
  type RawElement,
  type RawScene,
  type SafeContext,
} from '@n-eye/protocol';
import { assertProposalShape, MalformedProposalError } from '../authority/proposal-schema.js';
import { validateActionProposal, ActionValidationError } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { ElementRegistry } from '../content/registry.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { observePage } from '../content/observer.js';

const TASK = createTaskId('task-enter');
const ORIGIN = 'https://lab.example';

function proposal(over: Partial<ActionProposal> = {}): ActionProposal {
  return {
    actionId: createActionId('act-enter'),
    type: 'PRESS_ENTER',
    targetId: createElementId('e1'),
    reasoning: 'constrained enter',
    expectedOutcome: 'submit',
    riskLevel: 'HIGH',
    ...over,
  };
}

function context(elements: SafeContext['safeElements']): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: TASK,
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: 'Search for OpenAI',
    pageMetadata: { origin: ORIGIN, sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
    safeElements: elements,
    availableTokens: [],
  };
}

describe('Constrained PRESS_ENTER', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('rejects arbitrary key payloads and extra key fields', () => {
    expect(() => assertProposalShape({ ...proposal(), textValue: 'Escape' })).toThrow(MalformedProposalError);
    expect(() => assertProposalShape({ ...proposal(), keyName: 'Enter' } as never)).toThrow(/keyName|authority|unsupported/i);
    expect(() => assertProposalShape({ type: 'PRESS_KEY', actionId: 'act_x', reasoning: 'x', expectedOutcome: 'x', riskLevel: 'LOW' })).toThrow(
      /not in the action vocabulary/
    );
  });

  it('rejects PRESS_ENTER on password and non-typeable targets', () => {
    const password: RawElement = {
      id: createElementId('e1'),
      tagName: 'input',
      role: 'textbox',
      ariaLabel: 'Password',
      innerTextCandidate: 'Password',
      inputType: 'password',
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 80, height: 24 },
    };
    const scene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: `${ORIGIN}/form`,
      origin: ORIGIN,
      title: 'Lab',
      viewport: { width: 800, height: 600 },
      elements: [password],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    expect(() => validateActionProposal(proposal(), scene, new PrivateTokenVault(), TASK, ORIGIN)).toThrow(
      ActionValidationError
    );
  });

  it('planner uses PRESS_ENTER when search query is typed and no unique submit exists', async () => {
    const planner = new DeterministicPlanner();
    const field = {
      id: createElementId('e1'),
      role: 'searchbox',
      safeLabel: 'Search',
      inputType: 'search' as const,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 200, height: 32 },
    };
    await planner.proposeAction(context([field]));
    const after = await planner.proposeAction({
      ...context([field]),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(after.proposal.type).toBe('PRESS_ENTER');
    expect(after.proposal.targetId).toBe(field.id);
    expect(after.proposal.riskLevel).toBe('HIGH');
  });

  it('does not use PRESS_ENTER when submit controls are ambiguous', async () => {
    const planner = new DeterministicPlanner();
    const elements = [
      {
        id: createElementId('e1'),
        role: 'searchbox',
        safeLabel: 'Search',
        inputType: 'search' as const,
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 200, height: 32 },
      },
      {
        id: createElementId('e2'),
        role: 'button',
        safeLabel: 'Search',
        inputType: 'button' as const,
        isEnabled: true,
        bbox: { x: 210, y: 0, width: 40, height: 32 },
      },
      {
        id: createElementId('e3'),
        role: 'button',
        safeLabel: 'Search',
        inputType: 'button' as const,
        isEnabled: true,
        bbox: { x: 260, y: 0, width: 40, height: 32 },
      },
    ];
    await planner.proposeAction(context(elements));
    const after = await planner.proposeAction({
      ...context(elements),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(after.proposal.type).toBe('ASK_USER');
    expect(after.proposal.reasoning).toMatch(/multiple search\/submit/i);
  });

  it('executes requestSubmit on an owning form rather than injecting planner keys', () => {
    document.body.innerHTML = `<form id="f"><input id="q" type="search" value="OpenAI"></form>`;
    const form = document.getElementById('f') as HTMLFormElement;
    const input = document.getElementById('q') as HTMLInputElement;
    let submitted = false;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitted = true;
    });
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements.find((el) => el.inputType === 'search');
    if (!target) throw new Error('search field missing');
    const validated = validateActionProposal(
      proposal({ targetId: target.id }),
      scene,
      new PrivateTokenVault(),
      TASK,
      ORIGIN
    );
    expect(validated.approvedRiskLevel).toBe('HIGH');
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(true);
    expect(submitted).toBe(true);
    expect(input.value).toBe('OpenAI');
  });

  it('clicks a submitter via requestSubmit(submitter) and ignores a sibling submitter', () => {
    document.body.innerHTML = `
      <form id="f">
        <button type="submit" name="which" value="save" id="save">Save</button>
        <button type="submit" name="which" value="send" id="send">Submit</button>
      </form>
    `;
    const form = document.getElementById('f') as HTMLFormElement;
    let submitterName = '';
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const submitter = ev.submitter as HTMLButtonElement | null;
      submitterName = submitter?.id || '';
    });
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    const submit = scene.elements.find((el) => el.innerTextCandidate === 'Submit');
    if (!submit) throw new Error('submit missing');
    const clickProposal: ActionProposal = {
      actionId: createActionId('act-click'),
      type: 'CLICK',
      targetId: submit.id,
      reasoning: 'submit',
      expectedOutcome: 'submitted',
      riskLevel: 'HIGH',
    };
    const validated = validateActionProposal(clickProposal, scene, new PrivateTokenVault(), TASK, ORIGIN);
    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(true);
    expect(submitterName).toBe('send');
  });

  it('does not click a disabled submitter', () => {
    document.body.innerHTML = `<form id="f"><button type="submit" id="go" disabled>Submit</button></form>`;
    const registry = new ElementRegistry();
    const scene = observePage(registry, createPageEpoch(1));
    expect(scene.elements.filter((e) => e.tagName === 'button' && e.isEnabled).length).toBe(0);
  });
});
