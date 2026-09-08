/**
 * T029-R2: same-document form submit must be verifiable only when the page
 * exposes a normal observable postcondition. Click-with-no-delta stays fail-closed.
 * MUST NOT: scenario-05 ids in production, hidden N-Eye success hooks, or verifier loosening.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach } from 'vitest';
import { createActionId, createPageEpoch, createTaskId } from '@n-eye/protocol';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { detectElementPrivacy, detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { interpretGoal } from '../intelligence/goal-interpreter.js';
import { arbitratePlannerComplete } from '../runtime/completion-arbiter.js';

const GOAL =
  'Enter john.doe@company.org in the Direct PII Email Address field and submit the form';
const EMAIL = 'john.doe@company.org';
const PASSWORD = 'CANARY_PASSWORD_SUPER_SECRET_999';
const OTP = 'CANARY_OTP_928441';
const API = 'sk_live_884910283948291039482910';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/test-portal/scenario-05-privacy.html'
);

function clickAndVerify(
  html: string,
  postEpoch = 2
): {
  execOk: boolean;
  identityChanged?: boolean;
  status: string;
  delta: string;
  resultText: string;
  submitLabel: string;
  submitDisabled: boolean;
} {
  document.body.innerHTML = html;
  const registry = new ElementRegistry();
  const pre = observePage(registry, createPageEpoch(1));
  const submit = pre.elements.find((el) => /\bsubmit\b/i.test(el.innerTextCandidate || ''));
  if (!submit) throw new Error('expected submit control');
  const validated = validateActionProposal(
    {
      actionId: createActionId('act-submit'),
      type: 'CLICK',
      targetId: submit.id,
      reasoning: 'submit',
      expectedOutcome: 'form submitted',
      riskLevel: 'HIGH',
    },
    pre,
    new PrivateTokenVault(),
    createTaskId('task-r2'),
    pre.origin
  );
  const exec = executeValidatedAction(validated, registry);
  const post = observePage(registry, createPageEpoch(postEpoch));
  const verification = verifyActionExecution(validated, pre, post, {
    targetIdentityChanged: exec.targetIdentityChanged,
  });
  const result =
    document.getElementById('lab-result') || document.getElementById('privacy-result');
  const btn =
    (document.getElementById('lab-submit') as HTMLButtonElement | null) ||
    (document.getElementById('privacy-submit') as HTMLButtonElement | null) ||
    document.querySelector('button');
  return {
    execOk: exec.success,
    identityChanged: exec.targetIdentityChanged,
    status: verification.status,
    delta: verification.observedDelta,
    resultText: result?.textContent || '',
    submitLabel: btn?.textContent?.trim() || '',
    submitDisabled: btn instanceof HTMLButtonElement ? btn.disabled : false,
  };
}

describe('T029-R2 privacy TYPE→SUBMIT postcondition', () => {
  beforeEach(() => {
    resetTokenCounters();
    document.body.innerHTML = '';
  });

  it('R2-F001: submit that only preventDefault is not task-complete evidence', () => {
    // Same post-epoch as pre: Chrome reports VERIFIED_FAILURE when the page does not mutate.
    const out = clickAndVerify(
      `
      <form onsubmit="event.preventDefault();">
        <label for="mail">Direct PII Email Address</label>
        <input id="mail" type="email" value="${EMAIL}" />
        <button type="submit">Submit Test Context</button>
      </form>
    `,
      1
    );
    expect(out.execOk).toBe(true);
    expect(out.status).toBe('VERIFIED_FAILURE');
    expect(out.delta).toMatch(/no navigation, target consumption, or action-correlated state change/i);
  });

  it('R2-F001b: unrelated extra control is not submit proof', () => {
    document.body.innerHTML = `
      <form onsubmit="event.preventDefault();">
        <button type="submit" id="go">Submit</button>
      </form>
    `;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const submit = pre.elements.find((el) => el.innerTextCandidate === 'Submit');
    if (!submit) throw new Error('expected submit');
    const validated = validateActionProposal(
      {
        actionId: createActionId('act-churn'),
        type: 'CLICK',
        targetId: submit.id,
        reasoning: 'submit',
        expectedOutcome: 'form submitted',
        riskLevel: 'HIGH',
      },
      pre,
      new PrivateTokenVault(),
      createTaskId('task-churn'),
      pre.origin
    );
    executeValidatedAction(validated, registry);
    const extra = document.createElement('button');
    extra.textContent = 'Ad';
    document.body.appendChild(extra);
    const post = observePage(registry, createPageEpoch(2));
    const verification = verifyActionExecution(validated, pre, post);
    expect(verification.status).not.toBe('VERIFIED_SUCCESS');
  });

  it('R2-F002: same-document submit with status + disabled control is verifiable', () => {
    const out = clickAndVerify(`
      <form onsubmit="event.preventDefault(); var r=document.getElementById('lab-result'); r.hidden=false; r.textContent='Test context submitted.'; var b=document.getElementById('lab-submit'); b.disabled=true; b.textContent='Test context submitted';">
        <label for="mail">Direct PII Email Address</label>
        <input id="mail" type="email" value="${EMAIL}" />
        <button type="submit" id="lab-submit">Submit Test Context</button>
      </form>
      <p id="lab-result" role="status" hidden></p>
    `);
    expect(out.execOk).toBe(true);
    expect(out.resultText).toBe('Test context submitted.');
    expect(out.submitLabel).toBe('Test context submitted');
    expect(out.submitDisabled).toBe(true);
    expect(out.status).toBe('VERIFIED_SUCCESS');
    expect(out.resultText).not.toContain(EMAIL);
    expect(out.resultText).not.toContain(PASSWORD);
  });

  it('R2-F003: planner COMPLETE without a postcondition is not local success', () => {
    const registry = new ElementRegistry();
    document.body.innerHTML = `<form onsubmit="event.preventDefault();"><button type="submit">Submit</button></form>`;
    const scene = observePage(registry, createPageEpoch(1));
    const submit = scene.elements.find((el) => el.innerTextCandidate === 'Submit');
    if (!submit) throw new Error('expected submit');
    const validated = validateActionProposal(
      {
        actionId: createActionId('act-complete'),
        type: 'COMPLETE',
        reasoning: 'planner claims done',
        expectedOutcome: 'done',
        riskLevel: 'LOW',
      },
      scene,
      new PrivateTokenVault(),
      createTaskId('task-complete'),
      scene.origin
    );
    const verification = verifyActionExecution(validated, scene, scene);
    expect(verification.status).toBe('AMBIGUOUS');
    const decision = arbitratePlannerComplete({
      goal: GOAL,
      verifiedCount: 0,
      verifiedClick: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.phase).not.toBe('COMPLETED');
  });

  it('R2-F004: already-present email still requires verified submit', () => {
    const typedOnly = arbitratePlannerComplete({
      goal: GOAL,
      verifiedCount: 0,
      verifiedClick: false,
      liveFieldState: 'MATCHED',
    });
    expect(typedOnly.phase).toBe('ASK_USER');

    const submitted = arbitratePlannerComplete({
      goal: GOAL,
      verifiedCount: 1,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      liveFieldState: 'MATCHED',
    });
    expect(submitted.phase).toBe('COMPLETED');
  });

  it('R2-F005: privacy taxonomy values stay protected after submit observation', () => {
    document.body.innerHTML = `
      <form onsubmit="event.preventDefault(); var r=document.getElementById('lab-result'); r.hidden=false; r.textContent='Test context submitted.'; var b=document.getElementById('lab-submit'); b.disabled=true; b.textContent='Test context submitted';">
        <label for="f-email">Direct PII Email Address</label>
        <input id="f-email" type="email" value="${EMAIL}" />
        <label for="f-password">Account Password</label>
        <input id="f-password" type="password" value="${PASSWORD}" />
        <label for="f-otp">One-Time Password / 2FA Code</label>
        <input id="f-otp" type="text" value="${OTP}" />
        <label for="f-apikey">API Key</label>
        <input id="f-apikey" type="text" aria-label="API Key: ${API}" value="${API}" />
        <button type="submit" id="lab-submit">Submit Test Context</button>
      </form>
      <p id="lab-result" role="status" hidden></p>
    `;
    const registry = new ElementRegistry();
    const pre = observePage(registry, createPageEpoch(1));
    const findings = [...pre.elements.flatMap((el) => detectElementPrivacy(el)), ...detectGoalPrivacy(GOAL)];
    const decisions = evaluatePrivacyPolicy(findings);
    expect(decisions.find((d) => d.privacyClass === 'SECRET_PASSWORD')?.decision).toBe('NEVER_SEND');
    expect(decisions.find((d) => d.privacyClass === 'SECRET_OTP')?.decision).toBe('NEVER_SEND');
    expect(decisions.find((d) => d.privacyClass === 'SECRET_API_KEY')?.decision).toBe('NEVER_SEND');
    expect(decisions.find((d) => d.privacyClass === 'PII_EMAIL')?.decision).toBe('TOKENIZE');

    const vault = new PrivateTokenVault();
    const taskId = createTaskId('task-r2-priv');
    for (const { decision, realValue } of tokenizeDecisionsWithValues(decisions, findings)) {
      if (!decision.tokenRole) continue;
      vault.registerToken(decision.tokenRole, decision.privacyClass, realValue, taskId, 1, pre.origin);
    }
    const safe = buildSafeContext(pre, GOAL, decisions, vault, taskId, findings);
    const bytes = validateSafeContextEgress(safe);
    expect(bytes).not.toContain(EMAIL);
    expect(bytes).not.toContain(PASSWORD);
    expect(bytes).not.toContain(OTP);
    expect(bytes).not.toContain(API);

    const submit = pre.elements.find((el) => /\bsubmit\b/i.test(el.innerTextCandidate || ''));
    if (!submit) throw new Error('expected submit');
    const validated = validateActionProposal(
      {
        actionId: createActionId('act-priv-submit'),
        type: 'CLICK',
        targetId: submit.id,
        reasoning: 'submit',
        expectedOutcome: 'form submitted',
        riskLevel: 'HIGH',
      },
      pre,
      vault,
      taskId,
      pre.origin
    );
    executeValidatedAction(validated, registry);
    const post = observePage(registry, createPageEpoch(2));
    const postLabels = JSON.stringify(post.elements.map((el) => el.innerTextCandidate));
    // Observer must not copy password/OTP input values into labels. Page-authored aria-label
    // may still mention a key locally; that must not survive SafeContext egress.
    expect(postLabels).not.toContain(PASSWORD);
    expect(postLabels).not.toContain(OTP);
    const postFindings = [
      ...post.elements.flatMap((el) => detectElementPrivacy(el)),
      ...detectGoalPrivacy(GOAL),
    ];
    const postDecisions = evaluatePrivacyPolicy(postFindings);
    const postSafe = buildSafeContext(post, GOAL, postDecisions, vault, taskId, postFindings);
    const postBytes = validateSafeContextEgress(postSafe);
    expect(postBytes).not.toContain(EMAIL);
    expect(postBytes).not.toContain(PASSWORD);
    expect(postBytes).not.toContain(OTP);
    expect(postBytes).not.toContain(API);
  });

  it('R2-F006: goal remains TYPE then SUBMIT, not type-only complete', () => {
    const interpreted = interpretGoal(GOAL);
    expect(interpreted.family).toBe('MULTI_STEP');
    expect(interpreted.subgoals).toContain('SUBMIT');
    expect(interpreted.queryText).toBe(EMAIL);
  });

  it('R2-F007: Scenario 05 fixture itself produces a normal observable submit outcome', () => {
    const html = readFileSync(fixturePath, 'utf8');
    expect(html).not.toMatch(/__nEyeSuccess/);
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1];
    if (!body) throw new Error('expected scenario-05 body');
    const out = clickAndVerify(body);
    expect(out.execOk).toBe(true);
    expect(out.resultText).toBe('Test context submitted.');
    expect(out.submitLabel).toBe('Test context submitted');
    expect(out.submitDisabled).toBe(true);
    expect(out.identityChanged).toBe(true);
    expect(out.status).toBe('VERIFIED_SUCCESS');
    expect(out.resultText).not.toContain(EMAIL);
    expect(out.resultText).not.toContain(PASSWORD);
    expect(out.resultText).not.toContain(OTP);
    expect(out.resultText).not.toContain(API);
  });
});
