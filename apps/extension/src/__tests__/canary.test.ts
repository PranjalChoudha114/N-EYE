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

  const CANARIES = {
    EMAIL: 'CANARY_EMAIL_PRE5@example.com',
    PHONE: 'CANARY_PHONE_PRE5_9000000000',
    PASSWORD: 'CANARY_PASSWORD_PRE5_7F9A',
    OTP: 'CANARY_OTP_PRE5_928441',
    API_KEY: 'CANARY_API_KEY_PRE5_XYZ',
    SESSION: 'CANARY_SESSION_PRE5_SECRET',
    ARIA_EMAIL: 'CANARY_ARIA_PRE5@example.com',
    PLACEHOLDER_EMAIL: 'CANARY_PLACEHOLDER_PRE5@example.com',
    TASK_SECRET: 'CANARY_TASK_PRE5_SECRET',
    CSRF: 'CANARY_CSRF_PRE5_NEVER_LEAK',
  };

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `
      <form id="canary-form">
        <label for="username">Username</label>
        <input type="text" id="username" value="jane_user">

        <label for="email">Billing Email</label>
        <input type="email" id="email" placeholder="${CANARIES.PLACEHOLDER_EMAIL}" value="${CANARIES.EMAIL}">

        <label for="phone">Phone</label>
        <input type="tel" id="phone" value="${CANARIES.PHONE}">

        <label for="pwd">Password</label>
        <input type="password" id="pwd" value="${CANARIES.PASSWORD}">

        <label for="otp">2FA Security Code</label>
        <input type="text" id="otp" name="otp" value="${CANARIES.OTP}">

        <div role="button" aria-label="API Key: ${CANARIES.API_KEY}">Copy Credentials</div>

        <span title="Session token: ${CANARIES.SESSION}">Session Info</span>

        <input type="hidden" id="csrf" name="_csrf" value="${CANARIES.CSRF}">

        <button type="submit" id="submit-btn" aria-label="Submit for ${CANARIES.ARIA_EMAIL}">Submit</button>
      </form>
    `;
  });

  it('proves that raw form values NEVER leak into local RawScene or TargetFingerprints', () => {
    const scene = observePage(registry, createPageEpoch(1));
    const serializedScene = JSON.stringify(scene);

    // Ensure raw passwords, CSRF, and value properties are never in RawScene
    expect(serializedScene).not.toContain(CANARIES.PASSWORD);
    expect(serializedScene).not.toContain(CANARIES.CSRF);

    // Ensure registry entries do not leak passwords
    const entries = registry.getEntries();
    for (const entry of entries) {
      expect(entry.id).toMatch(/^e\d+$/);
      const fpStr = JSON.stringify(entry.fingerprint);
      expect(fpStr).not.toContain(CANARIES.PASSWORD);
    }
  });

  it('proves that outbound serialized SafeContext bytes NEVER contain forbidden credentials', () => {
    resetTokenCounters();
    const taskId = createTaskId('task-canary-001');
    const origin = 'https://portal.example.com';
    const vault = new PrivateTokenVault();

    // 1. Observe
    const rawScene = observePage(registry, createPageEpoch(1));

    // 2. Goal with injected task secret
    const rawGoal = `Login using email and password: ${CANARIES.TASK_SECRET}`;
    const goalFindings = detectGoalPrivacy(rawGoal);
    const combinedFindings = [...rawScene.privacyFindings, ...goalFindings];

    // 3. Policy & Vault Tokenization
    const decisions = evaluatePrivacyPolicy(combinedFindings);
    for (const d of decisions) {
      if (d.decision === 'TOKENIZE' && d.tokenRole) {
        vault.registerToken(d.tokenRole, d.privacyClass, CANARIES.EMAIL, taskId, 1, origin, ['email', 'text']);
      }
    }

    // 4. SafeContext
    const safeContext = buildSafeContext(rawScene, rawGoal, decisions, vault, taskId);

    // 5. Egress Guard Byte Scan
    const serializedBytes = validateSafeContextEgress(safeContext);

    // Forbidden Canaries MUST NOT exist anywhere in outbound bytes
    expect(serializedBytes).not.toContain(CANARIES.PASSWORD);
    expect(serializedBytes).not.toContain(CANARIES.OTP);
    expect(serializedBytes).not.toContain(CANARIES.API_KEY);
    expect(serializedBytes).not.toContain(CANARIES.SESSION);
    expect(serializedBytes).not.toContain(CANARIES.TASK_SECRET);
    expect(serializedBytes).not.toContain(CANARIES.CSRF);
    expect(serializedBytes).not.toContain(CANARIES.ARIA_EMAIL);
    expect(serializedBytes).not.toContain(CANARIES.PLACEHOLDER_EMAIL);
  });
});
