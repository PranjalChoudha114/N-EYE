/**
 * Local risk classification: planner risk is advisory. Local risk may only KEEP or ESCALATE.
 */

import { describe, it, expect } from 'vitest';
import { createActionId, createElementId, createTaskId, type ActionProposal, type RawElement } from '@n-eye/protocol';
import { classifyLocalRisk, validateActionProposal } from '../authority/validator.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { createPageEpoch, type RawScene } from '@n-eye/protocol';

function target(partial: Partial<RawElement> = {}): RawElement {
  return {
    id: createElementId('e1'),
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: 'Continue',
    inputType: null,
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 80, height: 24 },
    ...partial,
  };
}

function click(t: RawElement, risk: ActionProposal['riskLevel'] = 'LOW'): ActionProposal {
  return {
    actionId: createActionId('act-risk'),
    type: 'CLICK',
    targetId: t.id,
    reasoning: 'click',
    expectedOutcome: 'clicked',
    riskLevel: risk,
  };
}

function sceneOf(t: RawElement): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://lab.example/form',
    origin: 'https://lab.example',
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    elements: [t],
    privacyFindings: [],
    timestamp: Date.now(),
  };
}

describe('Local risk classification cannot be downgraded by the planner', () => {
  it('Submit / Delete / Upload / Send / Publish / Transfer are HIGH even when planner says LOW', () => {
    const cases: Array<[string, Partial<RawElement>]> = [
      ['form-associated submit', { formSubmitting: true, inputType: 'submit', innerTextCandidate: 'Go' }],
      ['formSubmitting structure', { formSubmitting: true, innerTextCandidate: 'Continue' }],
      ['Delete account', { innerTextCandidate: 'Delete account' }],
      ['Upload document', { innerTextCandidate: 'Upload document' }],
      ['file input', { tagName: 'input', inputType: 'file', innerTextCandidate: 'Choose file' }],
      ['Send message', { innerTextCandidate: 'Send' }],
      ['Publish post', { innerTextCandidate: 'Publish' }],
      ['Transfer funds', { innerTextCandidate: 'Transfer' }],
      ['Deactivate account', { innerTextCandidate: 'Deactivate' }],
    ];
    for (const [, attrs] of cases) {
      const t = target(attrs);
      expect(classifyLocalRisk(click(t, 'LOW'), t)).toBe('HIGH');
    }
  });

  it('a standalone default button is not HIGH just because HTML type is submit', () => {
    const t = target({ innerTextCandidate: 'Go', inputType: 'submit', formSubmitting: false });
    expect(classifyLocalRisk(click(t, 'LOW'), t)).toBe('LOW');
  });

  it('a harmless Continue click stays LOW unless the planner escalates', () => {
    const t = target({ innerTextCandidate: 'Continue', inputType: 'button' });
    expect(classifyLocalRisk(click(t, 'LOW'), t)).toBe('LOW');
    expect(classifyLocalRisk(click(t, 'HIGH'), t)).toBe('HIGH');
  });

  it('validateActionProposal stores the local-max risk, not the planner value', () => {
    const t = target({ innerTextCandidate: 'Submit Application', inputType: 'submit' });
    const validated = validateActionProposal(
      click(t, 'LOW'),
      sceneOf(t),
      new PrivateTokenVault(),
      createTaskId('task-risk'),
      'https://lab.example'
    );
    expect(validated.proposal.riskLevel).toBe('LOW');
    expect(validated.approvedRiskLevel).toBe('HIGH');
  });

  it('BLOCKED stays BLOCKED and never executes', () => {
    const t = target();
    expect(() =>
      validateActionProposal(
        click(t, 'BLOCKED'),
        sceneOf(t),
        new PrivateTokenVault(),
        createTaskId('task-risk'),
        'https://lab.example'
      )
    ).toThrow(/BLOCKED/);
  });
});
