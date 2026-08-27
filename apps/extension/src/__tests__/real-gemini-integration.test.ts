/**
 * Real Gemini API Integration & Full Trust Loop Test
 *
 * OWNS: Proving that the Chrome extension runtime communicates over the network
 * with the FastAPI Gateway backed by the REAL Google Gemini API,
 * validating proposals, resolving tokens locally, executing, and verifying.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Real Gemini API Extension Trust Loop', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="candidate-portal">
        <label for="applicant-email">Email Address</label>
        <input type="email" id="applicant-email" placeholder="name@example.com" value="">

        <label for="applicant-pwd">Account Password</label>
        <input type="password" id="applicant-pwd" value="REAL_TEST_PASSWORD_X7K92">

        <button type="submit" id="submit-btn">Submit Application</button>
      </form>
    `;
  });

  it('completes the full closed trust loop with REAL Gemini reasoning', async () => {
    const registry = new ElementRegistry();
    let epoch = createPageEpoch(1);
    const taskId = createTaskId('task-real-gemini-e2e');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();
    const plannerManager = new PlannerManager('REMOTE', 'http://127.0.0.1:8000');
    resetTokenCounters();

    // 0. Probe real gateway health
    const health = await plannerManager.checkGatewayHealth();
    expect(health.healthy).toBe(true);
    expect(health.provider).toBe('gemini');
    expect(health.model).toBe('gemini-2.5-flash');

    // 1. SEE
    const rawScene = observePage(registry, epoch);
    expect(rawScene.elements.length).toBe(3);
    const emailEl = rawScene.elements.find((e) => e.inputType === 'email');
    expect(emailEl).toBeDefined();

    // 2. PROTECT
    const goalText = 'Enter my email REAL_TEST_EMAIL_92841@example.com and continue';
    const goalFindings = detectGoalPrivacy(goalText);
    const combinedFindings = [...rawScene.privacyFindings, ...goalFindings];
    const decisions = evaluatePrivacyPolicy(combinedFindings);

    const emailDecision = decisions.find((d) => d.privacyClass === 'PII_EMAIL');
    expect(emailDecision).toBeDefined();

    let registeredToken;
    if (emailDecision && emailDecision.tokenRole) {
      registeredToken = vault.registerToken(
        emailDecision.tokenRole,
        'PII_EMAIL',
        'REAL_TEST_EMAIL_92841@example.com',
        taskId,
        1,
        origin,
        ['email', 'text', 'textbox']
      );
    }
    expect(registeredToken).toBeDefined();

    const safeContext = buildSafeContext(rawScene, goalText, decisions, vault, taskId);
    expect(safeContext.availableTokens.length).toBe(1);

    // Egress Guard Check
    const serializedSafe = validateSafeContextEgress(safeContext);
    expect(serializedSafe).not.toContain('REAL_TEST_PASSWORD_X7K92');
    expect(serializedSafe).not.toContain('REAL_TEST_EMAIL_92841@example.com');
    expect(serializedSafe).toContain('[EMAIL_1]');

    // 3. THINK (DISPATCH TO REAL GEMINI OVER HTTP)
    const planResult = await plannerManager.propose(safeContext);
    const proposal = planResult.proposal;
    const metadata = planResult.metadata;

    expect(metadata.provider).toBe('gemini');
    expect(metadata.model).toBe('gemini-2.5-flash');
    expect(metadata.planningLatencyMs).toBeGreaterThan(0);
    expect(proposal.type).toBe('TYPE_TOKEN');
    expect(proposal.targetId).toBe(emailEl?.id);
    expect(proposal.tokenId).toBe(registeredToken?.tokenId);
    expect(proposal.tokenSymbol).toBe('[EMAIL_1]');

    // 4. VALIDATE LOCALLY
    const validatedAction = validateActionProposal(proposal, rawScene, vault, taskId, origin);
    expect(validatedAction._isValidated).toBe(true);
    expect(validatedAction.resolvedTokenValue).toBe('REAL_TEST_EMAIL_92841@example.com');

    // 5. ACT LOCALLY
    const execResult = executeValidatedAction(validatedAction, registry);
    expect(execResult.success).toBe(true);

    const inputNode = document.getElementById('applicant-email') as HTMLInputElement;
    expect(inputNode.value).toBe('REAL_TEST_EMAIL_92841@example.com');

    // 6. VERIFY LOCALLY
    epoch = createPageEpoch(2);
    const postScene = observePage(registry, epoch);
    const verification = verifyActionExecution(validatedAction, rawScene, postScene);
    expect(verification.status).toBe('VERIFIED_SUCCESS');
  }, 15000); // 15s timeout for remote network AI roundtrip
});
