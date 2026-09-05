/**
 * Selenium-like labeled form isolation (FR1 F1).
 * Fixture mirrors official web-form structure. Production must not key off selenium.dev.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type SafeContext,
} from '@n-eye/protocol';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { fieldIdentityHints, interpretGoal } from '../intelligence/goal-interpreter.js';
import { createTaskGraph } from '../intelligence/task-graph.js';
import {
  inspectTypeGrounding,
  parseMockGoal,
  pickUniqueClickTarget,
  pickUniqueTypeTextTarget,
} from '../planner/mock-grammar.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { arbitratePlannerComplete } from '../runtime/completion-arbiter.js';
import { executeValidatedAction } from '../execution/executor.js';
import { assertProposalShape } from '../authority/proposal-schema.js';
import { validateActionProposal } from '../authority/validator.js';
import { PrivateTokenVault } from '../privacy/vault.js';

const SELENIUM_FORM = `
<form id="web-form" method="get" action="/submitted-form">
  <div>
    <label class="form-label" for="my-text-id">Text input</label>
    <input id="my-text-id" name="my-text" class="form-control" type="text">
  </div>
  <div>
    <label class="form-label" for="my-password">Password</label>
    <input type="password" id="my-password" name="my-password" class="form-control">
  </div>
  <div>
    <label class="form-label" for="my-textarea">Textarea</label>
    <textarea class="form-control" name="my-textarea" id="my-textarea"></textarea>
  </div>
  <div>
    <label class="form-label" for="my-disabled">Disabled input</label>
    <input class="form-control" type="text" name="my-disabled" id="my-disabled" disabled>
  </div>
  <div>
    <label class="form-label" for="my-readonly">Readonly input</label>
    <input class="form-control" type="text" name="my-readonly" id="my-readonly" readonly value="Readonly input">
  </div>
  <div>
    <label class="form-label" for="my-select">Dropdown (select)</label>
    <select class="form-select" id="my-select" name="my-select">
      <option selected>Open this select menu</option>
      <option value="1">One</option>
    </select>
  </div>
  <div>
    <input class="form-check-input" type="checkbox" name="my-check" id="my-check-1" checked>
    <label class="form-check-label" for="my-check-1">Checked checkbox</label>
  </div>
  <div>
    <input class="form-check-input" type="checkbox" id="my-check-2">
    <label class="form-check-label" for="my-check-2">Default checkbox</label>
  </div>
  <button class="btn" type="submit">Submit</button>
</form>
`;

function toSafe(scene: ReturnType<typeof observePage>, goal: string): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-selenium'),
    pageEpoch: scene.pageEpoch,
    sanitizedGoal: goal,
    pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Web form', viewport: { width: 800, height: 600 } },
    safeElements: scene.elements.map((e) => ({
      id: e.id,
      role: e.role,
      safeLabel: e.innerTextCandidate || '',
      inputType: e.inputType,
      isEnabled: e.isEnabled,
      bbox: e.bbox,
      formSubmitting: e.formSubmitting,
      regionHeading: e.regionHeading || undefined,
    })),
    availableTokens: [],
  };
}

describe('Selenium-like labeled form isolation', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = '';
  });

  it('A. Enter in the Text input field uniquely TYPEs and verifies value', async () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const box = live.elements.find((e) => e.innerTextCandidate === 'Text input');
    expect(box?.role).toBe('textbox');
    expect(box?.inputType).toBe('text');

    const goal = 'Enter Pranjal Choudha in the Text input field';
    const interpreted = interpretGoal(goal);
    expect(interpreted.family).toBe('FORM_FILL');
    expect(interpreted.forbidSubmit).not.toBe(true);
    expect(interpreted.fieldHints.some((h) => h.includes('text input'))).toBe(true);

    const trace = inspectTypeGrounding(goal, live.elements, interpreted.fieldHints);
    expect(trace.abstentionReason).toBeUndefined();
    const picked = pickUniqueTypeTextTarget(live.elements, interpreted.fieldHints);
    expect(picked.ok).toBe(true);
    if (!picked.ok) throw new Error('expected unique textbox');
    expect(picked.target.innerTextCandidate).toBe('Text input');
    expect(picked.target.id).toBe(trace.topId);

    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(toSafe(live, goal));
    expect(result.proposal.type).toBe('TYPE_TEXT');
    expect(result.proposal.targetId).toBe(picked.target.id);
    expect(result.proposal.textValue).toBe('Pranjal Choudha');

    const proposal = assertProposalShape(result.proposal);
    const vault = new PrivateTokenVault();
    const validated = validateActionProposal(
      proposal,
      live,
      vault,
      createTaskId('task-selenium'),
      live.origin
    );
    const exec = executeValidatedAction(validated, registry);
    expect(exec.success).toBe(true);
    const input = document.getElementById('my-text-id');
    expect(input instanceof HTMLInputElement && input.value).toBe('Pranjal Choudha');
  });

  it('does not let generic tokens tie Text input with Textarea', () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const hints = fieldIdentityHints('Text input field');
    const trace = inspectTypeGrounding('Enter X in the Text input field', live.elements, hints);
    const names = trace.candidates.map((c) => `${c.accessibleName}:${c.score}`);
    expect(names.some((n) => n.startsWith('Text input:'))).toBe(true);
    expect(trace.abstentionReason).toBeUndefined();
    const picked = pickUniqueTypeTextTarget(live.elements, hints);
    expect(picked.ok && picked.target.innerTextCandidate === 'Text input').toBe(true);
    expect(trace.margin).toBeGreaterThan(0);
  });

  it('B. Submit the form uniquely activates the submit affordance', async () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const interpreted = interpretGoal('Submit the form');
    expect(interpreted.family).toBe('CLICK');
    expect(interpreted.labelHints).toEqual(['submit']);
    const picked = pickUniqueClickTarget(live.elements, interpreted.labelHints);
    expect(picked.ok).toBe(true);
    if (!picked.ok) throw new Error('expected unique submit');
    expect(picked.target.formSubmitting).toBe(true);
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(toSafe(live, 'Submit the form'));
    expect(result.proposal.type).toBe('CLICK');
    expect(result.proposal.targetId).toBe(picked.target.id);
    expect(result.proposal.riskLevel).toBe('HIGH');
  });

  it('C. TYPE then SUBMIT is ordered multi-step; typing alone is not complete', async () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const goal = 'Enter Pranjal Choudha in the Text input field and submit the form';
    const interpreted = interpretGoal(goal);
    expect(interpreted.family).toBe('MULTI_STEP');
    expect(interpreted.queryText).toBe('Pranjal Choudha');
    expect(interpreted.fieldHints.some((h) => h.includes('text input'))).toBe(true);
    expect(interpreted.labelHints).toContain('submit');
    expect(interpreted.subgoals).toContain('FILL_FIELD');
    expect(interpreted.subgoals).toContain('SUBMIT');
    const graph = createTaskGraph('task-selenium', interpreted);
    expect(graph.pendingSubgoals).toContain('FILL_FIELD');
    expect(graph.successContract.kind).toBe('COMPOSITE');

    const planner = new DeterministicPlanner();
    const first = await planner.proposeAction(toSafe(live, goal));
    expect(first.proposal.type).toBe('TYPE_TEXT');

    const typedOnly = arbitratePlannerComplete({
      goal,
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(typedOnly.phase).toBe('ASK_USER');
    expect(typedOnly.kind).toBe('PARTIAL');

    const second = await planner.proposeAction({
      ...toSafe(live, goal),
      priorOutcome: { actionId: createActionId('act-type'), status: 'VERIFIED', summary: 'typed' },
    });
    expect(second.proposal.type).toBe('CLICK');
    const submit = live.elements.find((e) => e.formSubmitting);
    expect(second.proposal.targetId).toBe(submit?.id);

    const both = arbitratePlannerComplete({
      goal,
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
    });
    expect(both.phase).toBe('COMPLETED');
  });

  it('D. Password field is uniquely grounded and NEVER_SEND typing is refused', async () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const interpreted = interpretGoal('Enter X in the Password field');
    const picked = pickUniqueTypeTextTarget(live.elements, interpreted.fieldHints);
    expect(picked.ok).toBe(true);
    if (!picked.ok) throw new Error('expected unique password');
    expect(picked.target.inputType).toBe('password');
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(toSafe(live, 'Enter X in the Password field'));
    expect(result.proposal.type).toBe('ASK_USER');
    expect(result.proposal.reasoning).toMatch(/NEVER_SEND/i);
  });

  it('E. nonexistent field is TARGET_NOT_FOUND / ASK_USER without throwing', async () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const interpreted = interpretGoal('Enter X in the ZzNotAField field');
    const picked = pickUniqueTypeTextTarget(live.elements, interpreted.fieldHints);
    expect(picked.ok).toBe(false);
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(toSafe(live, 'Enter X in the ZzNotAField field'));
    expect(result.proposal.type).toBe('ASK_USER');
    expect(result.proposal.targetId).toBeUndefined();
  });

  it('empty password is a sensitive control without a private value', () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const pwd = live.privacyFindings.filter((f) => f.privacyClass === 'SECRET_PASSWORD');
    expect(pwd.length).toBeGreaterThanOrEqual(1);
    expect(pwd.every((f) => f.valuePresent === false)).toBe(true);
    const valueFindings = live.privacyFindings.filter((f) => f.valuePresent !== false);
    expect(valueFindings.filter((f) => f.privacyClass === 'SECRET_PASSWORD')).toHaveLength(0);
  });

  it('TYPE cannot choose a button because the goal contains text', () => {
    document.body.innerHTML = SELENIUM_FORM;
    const live = observePage(registry, createPageEpoch(1));
    const picked = pickUniqueTypeTextTarget(live.elements, fieldIdentityHints('Text input field'));
    expect(picked.ok && picked.target.role !== 'button').toBe(true);
  });

  it('generic identity phrases keep distinguishing labels', () => {
    expect(fieldIdentityHints('Text input field').some((h) => h === 'text input')).toBe(true);
    expect(fieldIdentityHints('Password field')).toContain('password');
    expect(fieldIdentityHints('Search button')).toContain('search button');
    expect(fieldIdentityHints('Continue button')).toContain('continue button');
    expect(fieldIdentityHints('Default checkbox')).toContain('default checkbox');
    expect(fieldIdentityHints('Readonly input')).toContain('readonly input');
  });

  it('fill-but-do-not-submit remains TYPE-only', () => {
    const interpreted = interpretGoal('Fill the name field with Jane but do not submit it.');
    expect(interpreted.forbidSubmit).toBe(true);
    expect(parseMockGoal('Fill the name field with Jane but do not submit it.').kind).toBe('type_text');
    const typed = arbitratePlannerComplete({
      goal: 'Fill the name field with Jane but do not submit it.',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(typed.phase).toBe('COMPLETED');
  });

  it('does not crash when targetCurrent is absent from an ASK_USER view', () => {
    const missing = interpretGoal('Enter X in the Missing field');
    expect(missing.family).toBe('FORM_FILL');
    expect(() => pickUniqueTypeTextTarget([], missing.fieldHints)).not.toThrow();
    expect(createElementId('e-missing')).toBeTruthy();
  });
});
