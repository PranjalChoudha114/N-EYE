/**
 * Closed-Loop Trust Architecture Test Suite (Task 005/006)
 *
 * OWNS: Verifying the complete closed trust loop across both Deterministic Mock mode
 * and Remote AI Gateway mode:
 * SEE -> PROTECT -> PLAN -> VALIDATE -> RE-GROUND -> RESOLVE -> ACT -> VERIFY
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { PlannerManager } from '../planner/planner-manager.js';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes deterministic trust loop without leaking raw password', async () => {
    const registry = new ElementRegistry();
    let epoch = createPageEpoch(1);
    const taskId = createTaskId('task-closed-loop-01');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();
    const plannerManager = new PlannerManager('MOCK');
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

    const safeContext = buildSafeContext(rawScene, goalText, decisions, vault, taskId, combinedFindings);
    expect(safeContext.availableTokens.length).toBe(1);
    expect(safeContext.availableTokens[0]?.tokenSymbol).toBe('[EMAIL_1]');

    // Egress validation - verify raw password NEVER crossed boundary
    const serializedSafe = validateSafeContextEgress(safeContext);
    expect(serializedSafe).not.toContain('CANARY_PASSWORD');
    expect(serializedSafe).not.toContain('alice.canary@example.org');
    expect(serializedSafe).toContain('[EMAIL_1]');

    // STEP 3: PLAN (DETERMINISTIC MOCK)
    const planResult = await plannerManager.propose(safeContext);
    const proposal = planResult.proposal;
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

  it('completes remote AI planner closed loop over mocked HTTP gateway', async () => {
    const registry = new ElementRegistry();
    let epoch = createPageEpoch(1);
    const taskId = createTaskId('task-remote-closed-02');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();
    const plannerManager = new PlannerManager('REMOTE', 'http://localhost:8000');
    resetTokenCounters();

    // 1. SEE
    const rawScene = observePage(registry, epoch);
    const emailEl = rawScene.elements.find((e) => e.inputType === 'email');
    expect(emailEl).toBeDefined();

    // 2. PROTECT
    const goalText = 'Submit application with my email';
    const goalFindings = detectGoalPrivacy(goalText);
    const combinedFindings = [...rawScene.privacyFindings, ...goalFindings];
    const decisions = evaluatePrivacyPolicy(combinedFindings);

    const emailDecision = decisions.find((d) => d.privacyClass === 'PII_EMAIL');
    let registeredTokenBinding;
    if (emailDecision && emailDecision.tokenRole) {
      registeredTokenBinding = vault.registerToken(
        emailDecision.tokenRole,
        'PII_EMAIL',
        'bob.candidate@example.com',
        taskId,
        1,
        origin,
        ['email', 'text', 'textbox']
      );
    }
    expect(registeredTokenBinding).toBeDefined();

    const safeContext = buildSafeContext(rawScene, goalText, decisions, vault, taskId, combinedFindings);
    const serializedSafe = validateSafeContextEgress(safeContext);
    expect(serializedSafe).toContain('[EMAIL_1]');

    // 3. THINK (REMOTE AI MOCK HTTP RESPONSE)
    const mockGatewayResponse = {
      actionProposal: {
        actionId: 'act_remote_ai_01',
        type: 'TYPE_TOKEN',
        targetId: emailEl?.id,
        tokenId: registeredTokenBinding?.tokenId,
        tokenSymbol: registeredTokenBinding?.tokenSymbol,
        reasoning: 'Inserting email token capability into email input field',
        expectedOutcome: 'Email input populated',
        riskLevel: 'MEDIUM',
      },
      metadata: {
        requestId: 'req_remote_ai_01',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        planningLatencyMs: 38.5,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockGatewayResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const planResult = await plannerManager.propose(safeContext);
    expect(planResult.proposal.type).toBe('TYPE_TOKEN');
    expect(planResult.proposal.targetId).toBe(emailEl?.id);
    expect(planResult.metadata.provider).toBe('gemini');

    // 4. VALIDATE
    const validatedAction = validateActionProposal(planResult.proposal, rawScene, vault, taskId, origin);
    expect(validatedAction._isValidated).toBe(true);
    expect(validatedAction.resolvedTokenValue).toBe('bob.candidate@example.com');

    // 5. ACT
    const execResult = executeValidatedAction(validatedAction, registry);
    expect(execResult.success).toBe(true);

    const inputNode = document.getElementById('email-input') as HTMLInputElement;
    expect(inputNode.value).toBe('bob.candidate@example.com');

    // 6. VERIFY
    epoch = createPageEpoch(2);
    const postScene = observePage(registry, epoch);
    const verification = verifyActionExecution(validatedAction, rawScene, postScene);
    expect(verification.status).toBe('VERIFIED_SUCCESS');
  });
});
