import { describe, it, expect, beforeEach } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type ActionProposal,
  type RawElement,
  type RawScene,
} from '@n-eye/protocol';
import { PrivateTokenVault } from '../privacy/vault.js';
import { classifyLocalRisk, validateActionProposal, ActionValidationError } from '../authority/validator.js';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { executeValidatedAction } from '../execution/executor.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';

function sampleScene(elements: RawElement[]): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://example.com/form',
    origin: 'https://example.com',
    title: 'Form',
    viewport: { width: 1280, height: 800 },
    elements,
    privacyFindings: [],
    timestamp: Date.now(),
  };
}

describe('Local authority policy (risk, typing, sanitization)', () => {
  const taskId = createTaskId('task-authority-01');
  const origin = 'https://example.com';

  it('elevates planner LOW click on a Submit button to locally HIGH', () => {
    const target: RawElement = {
      id: createElementId('e2'),
      tagName: 'button',
      role: 'button',
      ariaLabel: null,
      innerTextCandidate: 'Submit Application',
      inputType: 'submit',
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 80, height: 32 },
    };
    const proposal: ActionProposal = {
      actionId: createActionId('act-submit'),
      type: 'CLICK',
      targetId: target.id,
      reasoning: 'Click submit',
      expectedOutcome: 'Form submits',
      riskLevel: 'LOW',
    };

    expect(classifyLocalRisk(proposal, target)).toBe('HIGH');

    const vault = new PrivateTokenVault();
    const validated = validateActionProposal(proposal, sampleScene([target]), vault, taskId, origin);
    expect(validated.approvedRiskLevel).toBe('HIGH');
  });

  it('rejects TYPE_TEXT into a password field', () => {
    const target: RawElement = {
      id: createElementId('e1'),
      tagName: 'input',
      role: null,
      ariaLabel: null,
      innerTextCandidate: 'Password',
      inputType: 'password',
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };
    const proposal: ActionProposal = {
      actionId: createActionId('act-type'),
      type: 'TYPE_TEXT',
      targetId: target.id,
      textValue: 'guessed-password',
      reasoning: 'Fill password',
      expectedOutcome: 'Filled',
      riskLevel: 'LOW',
    };

    expect(() =>
      validateActionProposal(proposal, sampleScene([target]), new PrivateTokenVault(), taskId, origin)
    ).toThrow(ActionValidationError);
  });

  it('validates ASK_USER without a target', () => {
    const proposal: ActionProposal = {
      actionId: createActionId('act-ask'),
      type: 'ASK_USER',
      reasoning: 'Need the email value from the user',
      expectedOutcome: 'User provides missing data',
      riskLevel: 'LOW',
    };
    const validated = validateActionProposal(
      proposal,
      sampleScene([]),
      new PrivateTokenVault(),
      taskId,
      origin
    );
    expect(validated._isValidated).toBe(true);
  });

  it('rejects BLOCKED proposals', () => {
    const proposal: ActionProposal = {
      actionId: createActionId('act-block'),
      type: 'CLICK',
      targetId: createElementId('e1'),
      reasoning: 'Blocked',
      expectedOutcome: 'None',
      riskLevel: 'BLOCKED',
    };
    expect(() =>
      validateActionProposal(proposal, sampleScene([]), new PrivateTokenVault(), taskId, origin)
    ).toThrow(/BLOCKED/);
  });

  it('replaces a raw phone in the goal and blocks raw emails at egress', () => {
    resetTokenCounters();
    const goal = 'Call me at +1-415-555-0199 and email nina@example.com';
    const findings = detectGoalPrivacy(goal);
    const decisions = evaluatePrivacyPolicy(findings);
    const vault = new PrivateTokenVault();
    const scene = sampleScene([]);
    const safe = buildSafeContext(scene, goal, decisions, vault, taskId, findings);

    expect(safe.sanitizedGoal).not.toContain('nina@example.com');
    expect(safe.sanitizedGoal).not.toContain('415-555-0199');
    expect(safe.sanitizedGoal).toMatch(/\[EMAIL_1]|\[PHONE_1]|\[REDACTED_PII]/);

    expect(() =>
      validateSafeContextEgress({
        ...safe,
        sanitizedGoal: 'Leak nina@example.com please',
      })
    ).toThrow(/forbidden|secret|canary|email/i);
  });
});

describe('Live semantic re-grounding fail-closed', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `<button id="btn-submit">Submit Application</button>`;
  });

  it('refuses execution when the live control semantics no longer match the planned target', () => {
    const scene = observePage(registry, createPageEpoch(1));
    const target = scene.elements[0];
    if (!target) throw new Error('expected button');

    const proposal: ActionProposal = {
      actionId: createActionId('act-click'),
      type: 'CLICK',
      targetId: target.id,
      reasoning: 'Click submit',
      expectedOutcome: 'Submit',
      riskLevel: 'HIGH',
    };

    const validated = validateActionProposal(
      proposal,
      scene,
      new PrivateTokenVault(),
      createTaskId('task-fp'),
      'https://example.com'
    );

    const btn = document.getElementById('btn-submit');
    if (!btn) throw new Error('expected button node');
    btn.textContent = 'Delete Account';

    const result = executeValidatedAction(validated, registry);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fingerprint mismatch/i);
  });
});
