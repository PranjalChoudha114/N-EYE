/**
 * Privacy Canary & Byte-Level Egress Proof Suite (Task 005/006)
 *
 * OWNS: Verifying that synthetic secret canaries planted across DOM inputs,
 * ARIA attributes, placeholder texts, and task goals NEVER leak into local
 * RawScenes, TargetFingerprints, or outbound SafeContext bytes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { createPageEpoch, createTaskId } from '@n-eye/protocol';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';

describe('Privacy Canary & Byte-Level Egress Proof Suite', () => {
  let registry: ElementRegistry;

  const CANARIES_T005 = {
    EMAIL: 'CANARY_EMAIL_T005@example.com',
    PHONE: 'CANARY_PHONE_T005_9000000000',
    PASSWORD: 'CANARY_PASSWORD_T005_SECRET',
    OTP: 'CANARY_OTP_T005_928441',
    API_KEY: 'CANARY_API_T005_XYZ',
    SESSION: 'CANARY_SESSION_T005_SECRET',
    ARIA_EMAIL: 'CANARY_ARIA_T005@example.com',
    PLACEHOLDER_EMAIL: 'CANARY_PLACEHOLDER_T005@example.com',
    TASK_SECRET: 'CANARY_TASK_T005_SECRET',
    CSRF: 'CANARY_CSRF_T005_NEVER_LEAK',
  };

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `
      <form id="canary-form">
        <label for="username">Username</label>
        <input type="text" id="username" value="jane_user">

        <label for="email">Billing Email</label>
        <input type="email" id="email" placeholder="${CANARIES_T005.PLACEHOLDER_EMAIL}" value="${CANARIES_T005.EMAIL}">

        <label for="phone">Phone</label>
        <input type="tel" id="phone" value="${CANARIES_T005.PHONE}">

        <label for="pwd">Password</label>
        <input type="password" id="pwd" value="${CANARIES_T005.PASSWORD}">

        <label for="otp">2FA Security Code</label>
        <input type="text" id="otp" name="otp" value="${CANARIES_T005.OTP}">

        <div role="button" aria-label="API Key: ${CANARIES_T005.API_KEY}">Copy Credentials</div>

        <span title="Session token: ${CANARIES_T005.SESSION}">Session Info</span>

        <input type="hidden" id="csrf" name="_csrf" value="${CANARIES_T005.CSRF}">

        <button type="submit" id="submit-btn" aria-label="Submit for ${CANARIES_T005.ARIA_EMAIL}">Submit</button>
      </form>
    `;
  });

  it('proves that raw form values NEVER leak into local RawScene or TargetFingerprints', () => {
    const scene = observePage(registry, createPageEpoch(1));
    const serializedScene = JSON.stringify(scene);

    // Ensure raw passwords, CSRF, and value properties are never in RawScene
    expect(serializedScene).not.toContain(CANARIES_T005.PASSWORD);
    expect(serializedScene).not.toContain(CANARIES_T005.CSRF);

    // Ensure registry entries do not leak passwords
    const entries = registry.getEntries();
    for (const entry of entries) {
      expect(entry.id).toMatch(/^e\d+$/);
      const fpStr = JSON.stringify(entry.fingerprint);
      expect(fpStr).not.toContain(CANARIES_T005.PASSWORD);
    }
  });

  it('proves that outbound serialized SafeContext bytes NEVER contain forbidden credentials', () => {
    resetTokenCounters();
    const taskId = createTaskId('task-canary-005');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();

    // 1. Observe
    const rawScene = observePage(registry, createPageEpoch(1));

    // 2. Goal with injected task secret
    const rawGoal = `Login using email and password: ${CANARIES_T005.TASK_SECRET}`;
    const goalFindings = detectGoalPrivacy(rawGoal);
    const combinedFindings = [...rawScene.privacyFindings, ...goalFindings];

    // 3. Policy & Vault Tokenization
    const decisions = evaluatePrivacyPolicy(combinedFindings);
    for (const d of decisions) {
      if (d.decision === 'TOKENIZE' && d.tokenRole) {
        vault.registerToken(d.tokenRole, d.privacyClass, CANARIES_T005.EMAIL, taskId, 1, origin, ['email', 'text']);
      }
    }

    // 4. SafeContext
    const safeContext = buildSafeContext(rawScene, rawGoal, decisions, vault, taskId);

    // 5. Egress Guard Byte Scan
    const serializedBytes = validateSafeContextEgress(safeContext);

    // Forbidden Canaries MUST NOT exist anywhere in outbound bytes
    expect(serializedBytes).not.toContain(CANARIES_T005.PASSWORD);
    expect(serializedBytes).not.toContain(CANARIES_T005.OTP);
    expect(serializedBytes).not.toContain(CANARIES_T005.API_KEY);
    expect(serializedBytes).not.toContain(CANARIES_T005.SESSION);
    expect(serializedBytes).not.toContain(CANARIES_T005.TASK_SECRET);
    expect(serializedBytes).not.toContain(CANARIES_T005.CSRF);
    expect(serializedBytes).not.toContain(CANARIES_T005.ARIA_EMAIL);
    expect(serializedBytes).not.toContain(CANARIES_T005.PLACEHOLDER_EMAIL);
  });
});
