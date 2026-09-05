/**
 * T029-R1..R5 regressions (Zone 3).
 * Each case would have failed on the first incorrect transition before the generalized repair.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type ActionProposal,
  type RawElement,
  type RawScene,
  type ValidatedAction,
} from '@n-eye/protocol';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { parseMockGoal } from '../planner/mock-grammar.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { validateActionProposal } from '../authority/validator.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { verifyActionExecution, safeUrlEvidence } from '../verification/verifier.js';
import { detectElementPrivacy } from '../privacy/detectors.js';

const ORIGIN = 'https://lab.example';
const TASK = createTaskId('task-t029-repair');

function clickProposal(targetId: ActionProposal['targetId']): ActionProposal {
  return {
    actionId: createActionId('act-click'),
    type: 'CLICK',
    targetId,
    reasoning: 'click',
    expectedOutcome: 'activate',
    riskLevel: 'LOW',
  };
}

describe('T029 generalized repairs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('R1: Mock types then clicks Continue instead of stuffing click into the field name', async () => {
    document.body.innerHTML = `
      <label for="n">Name</label><input id="n" type="text" />
      <button type="button" id="go">Continue</button>
    `;
    const scene = observePage(new ElementRegistry(), createPageEpoch(1));
    const goal = 'Enter Jane in the name field and click Continue';
    expect(interpretGoal(goal).family).toBe('MULTI_STEP');
    expect(parseMockGoal(goal).kind).toBe('type_text');
    const planner = new DeterministicPlanner();
    const first = await planner.proposeAction({
      protocolVersion: '1.0.0',
      taskId: TASK,
      pageEpoch: scene.pageEpoch,
      sanitizedGoal: goal,
      pageMetadata: { origin: ORIGIN, sanitizedTitle: 'Form', viewport: { width: 800, height: 600 } },
      safeElements: scene.elements.map((e) => ({
        id: e.id,
        role: e.role,
        safeLabel: e.innerTextCandidate || e.ariaLabel || '',
        inputType: e.inputType,
        isEnabled: e.isEnabled,
        bbox: e.bbox,
      })),
      availableTokens: [],
    });
    expect(first.proposal.type).toBe('TYPE_TEXT');
    const second = await planner.proposeAction({
      protocolVersion: '1.0.0',
      taskId: TASK,
      pageEpoch: scene.pageEpoch,
      sanitizedGoal: goal,
      pageMetadata: { origin: ORIGIN, sanitizedTitle: 'Form', viewport: { width: 800, height: 600 } },
      safeElements: scene.elements.map((e) => ({
        id: e.id,
        role: e.role,
        safeLabel: e.innerTextCandidate || e.ariaLabel || '',
        inputType: e.inputType,
        isEnabled: e.isEnabled,
        bbox: e.bbox,
      })),
      availableTokens: [],
      priorOutcome: { actionId: createActionId('act-type'), status: 'VERIFIED', summary: 'typed' },
    });
    expect(second.proposal.type).toBe('CLICK');
    expect(second.proposal.targetId).toBe(scene.elements.find((e) => e.innerTextCandidate === 'Continue')?.id);
  });

  it('R2: autocomplete control-set churn is not CLICK success', () => {
    document.body.innerHTML = `<button type="button" id="save">Save</button>`;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.innerTextCandidate === 'Save');
    if (!target) throw new Error('expected Save');
    const validated = validateActionProposal(clickProposal(target.id), pre, new PrivateTokenVault(), TASK, ORIGIN);
    document.body.insertAdjacentHTML('afterbegin', `<input type="text" id="auto1" /><input type="text" id="auto2" />`);
    const post = observePage(new ElementRegistry(), createPageEpoch(2));
    const verification = verifyActionExecution(validated, pre, post);
    expect(verification.status).toBe('AMBIGUOUS');
    expect(verification.observedDelta).toMatch(/churn|control set/i);
  });

  it('R3: navigation evidence strips query/hash secrets', () => {
    const secretUrl = 'https://lab.example/done?session=CANARY_SESSION_T029#tok';
    expect(safeUrlEvidence(secretUrl)).toBe('https://lab.example/done');
    expect(safeUrlEvidence(secretUrl)).not.toContain('CANARY_SESSION_T029');
    document.body.innerHTML = `<button type="button" id="save">Save</button>`;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const target = pre.elements.find((e) => e.innerTextCandidate === 'Save');
    if (!target) throw new Error('expected Save');
    const validated: ValidatedAction = validateActionProposal(
      clickProposal(target.id),
      pre,
      new PrivateTokenVault(),
      TASK,
      ORIGIN
    );
    const post: RawScene = { ...pre, url: secretUrl, pageEpoch: createPageEpoch(2) };
    const verification = verifyActionExecution(validated, pre, post);
    expect(verification.status).toBe('VERIFIED_SUCCESS');
    expect(verification.observedDelta).not.toContain('CANARY_SESSION_T029');
    expect(verification.observedDelta).toContain('https://lab.example/done');
  });

  it('R4: empty OTP label is a control, not a leaked value', () => {
    const el: RawElement = {
      id: createElementId('e-otp'),
      tagName: 'input',
      role: 'textbox',
      ariaLabel: 'One-time code',
      innerTextCandidate: 'OTP',
      inputType: 'text',
      isEnabled: true,
      hasValue: false,
      bbox: { x: 0, y: 0, width: 80, height: 24 },
    };
    const findings = detectElementPrivacy(el);
    expect(findings.some((f) => f.privacyClass === 'SECRET_OTP' && f.valuePresent === false)).toBe(true);
  });

  it('R5: Select then continue stays select until the option is proven', async () => {
    const goal = 'Select India and continue';
    expect(interpretGoal(goal).family).toBe('MULTI_STEP');
    expect(parseMockGoal(goal).kind).toBe('select');
    document.body.innerHTML = `
      <select id="c"><option>Open</option><option>India</option></select>
      <button type="button">Continue</button>
    `;
    const scene = observePage(new ElementRegistry(), createPageEpoch(1));
    const planner = new DeterministicPlanner();
    const ctxBase = {
      protocolVersion: '1.0.0' as const,
      taskId: TASK,
      pageEpoch: scene.pageEpoch,
      sanitizedGoal: goal,
      pageMetadata: { origin: ORIGIN, sanitizedTitle: 'Form', viewport: { width: 800, height: 600 } },
      safeElements: scene.elements.map((e) => ({
        id: e.id,
        role: e.role,
        safeLabel: e.innerTextCandidate || e.ariaLabel || '',
        inputType: e.inputType,
        isEnabled: e.isEnabled,
        bbox: e.bbox,
      })),
      availableTokens: [],
    };
    const first = await planner.proposeAction(ctxBase);
    expect(first.proposal.type).toBe('SELECT');
    const second = await planner.proposeAction({
      ...ctxBase,
      priorOutcome: { actionId: createActionId('act-sel'), status: 'VERIFIED', summary: 'selected' },
    });
    expect(second.proposal.type).toBe('CLICK');
  });
});
