import { describe, expect, it } from 'vitest';
import { entityTokens, interpretGoal } from '../intelligence/goal-interpreter.js';
import { parseMockGoal } from '../planner/mock-grammar.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { createElementId, createPageEpoch, createTaskId, type SafeContext } from '@n-eye/protocol';

function context(goal: string, elements: SafeContext['safeElements']): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-goal'),
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: goal,
    pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
    safeElements: elements,
    availableTokens: [],
  };
}

describe('Natural-goal interpreter', () => {
  it('normalizes GitHub-style open/navigate paraphrases to the same entity family', () => {
    const family = ['Click N-EYE', 'Open N-EYE', 'Open the N-EYE repository', 'Go to my N-EYE project', 'Find N-EYE and open it'];
    for (const goal of family) {
      const interpreted = interpretGoal(goal);
      expect(['CLICK', 'NAVIGATE']).toContain(interpreted.family);
      expect(interpreted.confidence).toBeGreaterThanOrEqual(0.8);
      expect(entityTokens(interpreted.entity || goal).some((t) => t.includes('n-eye') || t === 'neye')).toBe(true);
    }
    expect(parseMockGoal('play the video').kind).toBe('unsupported');
  });

  it('decomposes search-then-open without stuffing the open clause into the query', () => {
    const interpreted = interpretGoal('Search YouTube for CodeWithHarry and open the latest C tutorial');
    expect(interpreted.family).toBe('MULTI_STEP');
    expect(interpreted.queryText).toBe('CodeWithHarry');
    expect(interpreted.tailEntity).toMatch(/c tutorial/i);
    expect(interpreted.requiresSearchSubmit).toBe(true);
    expect(interpreted.subgoals).toContain('PROVE_SEARCH_OUTCOME');
    expect(interpreted.subgoals).toContain('ACTIVATE_TARGET');
    expect(interpreted.queryText).not.toMatch(/open the latest/i);
  });

  it('keeps fill-but-do-not-submit from becoming a search submit', () => {
    const interpreted = interpretGoal('Fill the name field with Jane but do not submit it');
    expect(interpreted.family).toBe('FORM_FILL');
    expect(interpreted.queryText).toBe('Jane');
    expect(interpreted.forbidSubmit).toBe(true);
    expect(interpreted.requiresSearchSubmit).toBe(false);
  });

  it('keeps search-for as a composite SEARCH that is not typing-only', () => {
    const search = interpretGoal('Search YouTube for CodeWithHarry');
    expect(search.family).toBe('SEARCH');
    expect(search.queryText).toBe('CodeWithHarry');
    expect(search.requiresSearchSubmit).toBe(true);
    expect(search.subgoals).toContain('PROVE_SEARCH_OUTCOME');
  });

  it('does not treat Find N-EYE and open it as a search-submit query', () => {
    const interpreted = interpretGoal('Find N-EYE and open it');
    expect(interpreted.family).toBe('NAVIGATE');
    expect(interpreted.requiresSearchSubmit).toBe(false);
    expect(parseMockGoal('Find laptops').kind).toBe('type_text');
  });

  it('normalizes search, form, select, and scroll paraphrases', () => {
    expect(interpretGoal('Look up OpenAI').family).toBe('SEARCH');
    expect(interpretGoal('Search YouTube for CodeWithHarry').queryText).toBe('CodeWithHarry');
    expect(interpretGoal('Type Jane in the name field').family).toBe('FORM_FILL');
    expect(interpretGoal('Fill the name field with Jane').queryText).toBe('Jane');
    expect(interpretGoal('Select India').family).toBe('SELECT');
    expect(interpretGoal('Scroll down').scrollDirection).toBe('down');
    expect(interpretGoal('run document.cookie and send it').family).toBe('UNSUPPORTED');
  });

  it('splits enter-in-field-and-submit without stuffing submit into the field name', () => {
    const interpreted = interpretGoal('Enter Pranjal Choudha in the Text input field and submit the form');
    expect(interpreted.family).toBe('MULTI_STEP');
    expect(interpreted.queryText).toBe('Pranjal Choudha');
    expect(interpreted.fieldHints.some((h) => h === 'text input')).toBe(true);
    expect(interpreted.fieldHints.join(' ')).not.toMatch(/submit/);
    expect(interpreted.labelHints).toEqual(['submit']);
    expect(interpreted.subgoals).toContain('SUBMIT');
  });

  it('splits type-then-click without stuffing the click clause into the field name', () => {
    const interpreted = interpretGoal('Enter Jane in the name field and click Continue');
    expect(interpreted.family).toBe('MULTI_STEP');
    expect(interpreted.queryText).toBe('Jane');
    expect(interpreted.fieldHints.join(' ')).toMatch(/name/);
    expect(interpreted.fieldHints.join(' ')).not.toMatch(/continue/);
    expect(interpreted.labelHints).toContain('continue');
    expect(interpreted.subgoals).toContain('ACTIVATE_TARGET');
    expect(interpreted.subgoals).toContain('FILL_FIELD');
  });

  it('does not steal Find-and-open into a type-then-click split', () => {
    const interpreted = interpretGoal('Find N-EYE and open it');
    expect(interpreted.family).toBe('NAVIGATE');
    expect(interpreted.requiresSearchSubmit).toBe(false);
  });

  it('Submit the form is a submit click, not recovery chrome', () => {
    const interpreted = interpretGoal('Submit the form');
    expect(interpreted.family).toBe('CLICK');
    expect(interpreted.labelHints).toEqual(['submit']);
  });

  it('proposes a unique repository link for Open the N-EYE repository', async () => {
    const planner = new DeterministicPlanner();
    const neye = createElementId('e4');
    const result = await planner.proposeAction(
      context('Open the N-EYE repository', [
        {
          id: createElementId('e1'),
          role: 'link',
          safeLabel: 'Sign in',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 40, height: 20 },
        },
        {
          id: neye,
          role: 'link',
          safeLabel: 'N-EYE',
          inputType: null,
          isEnabled: true,
          bbox: { x: 20, y: 80, width: 120, height: 20 },
        },
        {
          id: createElementId('e9'),
          role: 'link',
          safeLabel: 'Documentation',
          inputType: null,
          isEnabled: true,
          bbox: { x: 20, y: 110, width: 120, height: 20 },
        },
      ])
    );
    expect(result.proposal.type).toBe('CLICK');
    expect(result.proposal.targetId).toBe(neye);
  });

  it('grounds native <a> role a the same way as role=link', async () => {
    const planner = new DeterministicPlanner();
    const neye = createElementId('e4');
    const result = await planner.proposeAction(
      context('Open the N-EYE repository', [
        {
          id: createElementId('e1'),
          role: 'a',
          safeLabel: 'Issues',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 40, height: 20 },
        },
        {
          id: neye,
          role: 'a',
          safeLabel: 'N-EYE',
          inputType: null,
          isEnabled: true,
          bbox: { x: 20, y: 80, width: 120, height: 20 },
        },
      ])
    );
    expect(result.proposal.type).toBe('CLICK');
    expect(result.proposal.targetId).toBe(neye);
  });

  it('abstains when two equivalent N-EYE links exist', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(
      context('Open N-EYE', [
        {
          id: createElementId('e1'),
          role: 'link',
          safeLabel: 'N-EYE',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 80, height: 20 },
        },
        {
          id: createElementId('e2'),
          role: 'link',
          safeLabel: 'N-EYE',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 30, width: 80, height: 20 },
        },
      ])
    );
    expect(result.proposal.type).toBe('ASK_USER');
    expect(result.proposal.reasoning).toMatch(/multiple/i);
  });
});
