import { describe, it, expect, beforeEach } from 'vitest';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { createPageEpoch } from '@n-eye/protocol';

describe('Privacy Canary & Value Exclusion Suite', () => {
  let registry: ElementRegistry;

  const CANARIES = {
    PASSWORD: 'CANARY_PASSWORD_SECRET_8849!@#',
    EMAIL_VAL: 'canary.user.email.99128@example.org',
    OTP_VAL: 'CANARY_OTP_991823',
    HIDDEN_CSRF: 'CANARY_CSRF_TOKEN_NEVER_LEAK_77123',
    TEXTAREA_VAL: 'CANARY_PRIVATE_JOURNAL_ENTRY_CONFIDENTIAL_123',
  };

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = `
      <form id="canary-form">
        <label for="username">Username</label>
        <input type="text" id="username" value="valid_user_name">

        <label for="email">Email Address</label>
        <input type="email" id="email" value="${CANARIES.EMAIL_VAL}">

        <label for="pwd">Password</label>
        <input type="password" id="pwd" value="${CANARIES.PASSWORD}">

        <label for="otp">Security Code</label>
        <input type="text" id="otp" name="otp" value="${CANARIES.OTP_VAL}">

        <textarea id="notes">${CANARIES.TEXTAREA_VAL}</textarea>

        <input type="hidden" id="csrf" name="_csrf" value="${CANARIES.HIDDEN_CSRF}">

        <button type="submit" id="submit-btn">Submit Form</button>
      </form>
    `;
  });

  it('proves that raw form values NEVER leak into RawScene or RawElement', () => {
    const scene = observePage(registry, createPageEpoch(1));
    const serializedScene = JSON.stringify(scene);

    // Search for every canary string across the entire serialized observation
    for (const [name, canaryVal] of Object.entries(CANARIES)) {
      const containsCanary = serializedScene.includes(canaryVal);
      expect(
        containsCanary,
        `Privacy Violation: Canary ${name} ("${canaryVal}") was found in the serialized RawScene!`
      ).toBe(false);
    }
  });

  it('proves that ElementRegistry entries do not encode raw secrets', () => {
    observePage(registry, createPageEpoch(1));
    const entries = registry.getEntries();

    for (const entry of entries) {
      // Element IDs should be opaque (e1, e2, ...)
      expect(entry.id).toMatch(/^e\d+$/);

      // Fingerprint should not contain raw canary values
      const fpStr = JSON.stringify(entry.fingerprint);
      for (const [name, canaryVal] of Object.entries(CANARIES)) {
        expect(
          fpStr.includes(canaryVal),
          `Privacy Violation: Canary ${name} leaked into TargetFingerprint!`
        ).toBe(false);
      }
    }
  });
});
