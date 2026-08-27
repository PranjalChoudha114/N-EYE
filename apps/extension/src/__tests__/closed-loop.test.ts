import { describe, it, expect, beforeEach } from 'vitest';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { validateActionProposal } from '../authority/validator.js';
import { executeValidatedAction } from '../execution/executor.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { createPageEpoch, createTaskId } from '@n-eye/protocol';

describe('Closed-Loop Trust Architecture (SEE -> PROTECT -> PLAN -> VALIDATE -> ACT -> VERIFY)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="login-form">
        <label for="email-input">Your Email Address</label>
        <input type="email" id="email-input" placeholder="name@example.com" value="">

        <label for="password-input">Account Password</label>
        <input type="password" id="password-input" value="CANARY_PASSWORD_SUPER_SECRET_123">

        <button type="submit" id="submit-btn">Continue Application</button>
      </form>
      <div id="success-banner" style="display: none;">Welcome back, applicant!</div>
    `;
  });

  it('completes deterministic trust loop without leaking raw password', () => {
    const registry = new ElementRegistry();
    let epoch = createPageEpoch(1);
    const taskId = createTaskId('task-closed-loop-01');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();
    const planner = new DeterministicPlanner();
    resetTokenCounters();

    // STEP 1: SEE LOCALLY
    const rawScene = observePage(registry, epoch);
    expect(rawScene.elements.length).toBe(3);
    const emailEl = rawScene.elements.find((e) => e.inputType === 'email');
    expect(emailEl).toBeDefined();

    // STEP 2: PROTECT LOCALLY
    const goalText = 'Enter my email and continue';
    const goalFindings = detectGoalPrivacy(goalText);
    const combinedFindings = [...rawScene.privacyFindings, ...goalFindings];
    const decisions = evaluatePrivacyPolicy(combinedFindings);

    // Populate vault with tokenized email
    const emailDecision = decisions.find((d) => d.privacyClass === 'PII_EMAIL');
    expect(emailDecision).toBeDefined();
    if (emailDecision && emailDecision.tokenRole) {
      vault.registerToken(
        emailDecision.tokenRole,
        'PII_EMAIL',
        'alice.canary@example.org',
        taskId,
        1,
        origin,
        ['email', 'text', 'textbox']
      );
    }

    const safeContext = buildSafeContext(rawScene, goalText, decisions, vault, taskId);
    expect(safeContext.availableTokens.length).toBe(1);
    expect(safeContext.availableTokens[0]?.tokenSymbol).toBe('[EMAIL_1]');

    // Egress validation - verify raw password NEVER crossed boundary
    const serializedSafe = validateSafeContextEgress(safeContext);
    expect(serializedSafe).not.toContain('CANARY_PASSWORD');
    expect(serializedSafe).not.toContain('alice.canary@example.org');
    expect(serializedSafe).toContain('[EMAIL_1]');

    // STEP 3: PLAN (DETERMINISTIC)
    const proposal = planner.proposeAction(safeContext);
    expect(proposal.type).toBe('TYPE_TOKEN');
    expect(proposal.tokenSymbol).toBe('[EMAIL_1]');

    // STEP 4: VALIDATE LOCALLY
    const validatedAction = validateActionProposal(proposal, rawScene, vault, taskId, origin);
    expect(validatedAction._isValidated).toBe(true);
    expect(validatedAction.resolvedTokenValue).toBe('alice.canary@example.org');

    // STEP 5: ACT LOCALLY
    const execResult = executeValidatedAction(validatedAction, registry);
    expect(execResult.success).toBe(true);

    const inputNode = document.getElementById('email-input') as HTMLInputElement;
    expect(inputNode.value).toBe('alice.canary@example.org');

    // STEP 6: VERIFY LOCALLY
    epoch = createPageEpoch(2);
    const postScene = observePage(registry, epoch);
    const verification = verifyActionExecution(validatedAction, rawScene, postScene);

    expect(verification.status).toBe('VERIFIED_SUCCESS');
  });
});
