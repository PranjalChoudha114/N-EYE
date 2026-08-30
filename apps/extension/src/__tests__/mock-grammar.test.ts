import { describe, expect, it } from 'vitest';
import { createActionId, createElementId, createPageEpoch, createTaskId, type SafeContext } from '@n-eye/protocol';
import { parseMockGoal, pickUniqueClickTarget, pickUniqueTypeTextTarget } from '../planner/mock-grammar.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';

function context(goal: string, elements: SafeContext['safeElements']): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-mock'),
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: goal,
    pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
    safeElements: elements,
    availableTokens: [],
  };
}

describe('Mock bounded grammar', () => {
  it('parses type-in, fill, search-for, click, select, and scroll', () => {
    expect(parseMockGoal('Type OpenAI in the YouTube search box')).toMatchObject({
      kind: 'type_text',
      text: 'OpenAI',
      requiresSearchSubmit: false,
    });
    expect(parseMockGoal('Search for OpenAI')).toMatchObject({
      kind: 'type_text',
      text: 'OpenAI',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('fill the name field with Jane')).toMatchObject({ kind: 'type_text', text: 'Jane' });
    expect(parseMockGoal('click Continue')).toMatchObject({ kind: 'click_labeled' });
    expect(parseMockGoal('select India')).toMatchObject({ kind: 'select', option: 'India' });
    expect(parseMockGoal('scroll down')).toMatchObject({ kind: 'scroll', direction: 'down' });
    expect(parseMockGoal('play the video')).toEqual({ kind: 'unsupported' });
    expect(parseMockGoal('Search For OpenAi In Youtube Search Bar')).toMatchObject({
      kind: 'type_text',
      requiresSearchSubmit: true,
    });
  });

  it('does not treat unknown goals as COMPLETE', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(
      context('Type OpenAI in the YouTube search box', [
        {
          id: createElementId('e1'),
          role: 'button',
          safeLabel: 'Sign in',
          inputType: 'button',
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 40, height: 20 },
        },
      ])
    );
    expect(result.proposal.type).toBe('ASK_USER');
    expect(result.proposal.type).not.toBe('COMPLETE');
    expect(result.proposal.reasoning).not.toMatch(/completed/i);
  });

  it('emits TYPE_TEXT for a unique search field', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(
      context('Type OpenAI in the YouTube search box', [
        {
          id: createElementId('e1'),
          role: 'searchbox',
          safeLabel: 'Search',
          inputType: 'search',
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 200, height: 32 },
        },
      ])
    );
    expect(result.proposal.type).toBe('TYPE_TEXT');
    expect(result.proposal.textValue).toBe('OpenAI');
    expect(result.proposal.targetId).toBe(createElementId('e1'));
  });

  it('abstains when two search fields score equally', () => {
    const picked = pickUniqueTypeTextTarget(
      [
        { id: 'e1', inputType: 'search', role: 'searchbox', safeLabel: 'Search', isEnabled: true },
        { id: 'e2', inputType: 'search', role: 'searchbox', safeLabel: 'Search', isEnabled: true },
      ],
      ['search']
    );
    expect(picked.ok).toBe(false);
    if (!picked.ok) expect(picked.reason).toBe('ambiguous');
  });

  it('does not click a Sign-in link as a type-goal fallback', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(
      context('Type OpenAI in the search box', [
        {
          id: createElementId('e9'),
          role: 'link',
          safeLabel: 'Sign in',
          inputType: null,
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 40, height: 20 },
        },
      ])
    );
    expect(result.proposal.type).toBe('ASK_USER');
  });

  it('after verified type-only, planner COMPLETE is advice not product success', async () => {
    const planner = new DeterministicPlanner();
    const base = context('Type OpenAI in the search box', [
      {
        id: createElementId('e1'),
        role: 'searchbox',
        safeLabel: 'Search',
        inputType: 'search',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 200, height: 32 },
      },
    ]);
    const second = await planner.proposeAction({
      ...base,
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(second.proposal.type).toBe('COMPLETE');
    expect(second.proposal.reasoning).toMatch(/Local proof still required/);
  });

  it('abstains when two Continue buttons score equally', () => {
    const picked = pickUniqueClickTarget(
      [
        { id: 'e1', role: 'button', safeLabel: 'Continue', inputType: 'button', isEnabled: true },
        { id: 'e2', role: 'button', safeLabel: 'Continue', inputType: 'button', isEnabled: true },
      ],
      ['continue']
    );
    expect(picked.ok).toBe(false);
    if (!picked.ok) expect(picked.reason).toBe('ambiguous');
  });
});
