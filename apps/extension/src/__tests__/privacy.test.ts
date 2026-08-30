import { describe, it, expect } from 'vitest';
import { detectElementPrivacy, detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { createElementId, createPageEpoch, createTaskId, type RawElement } from '@n-eye/protocol';

describe('Privacy Detection & Policy Engine', () => {
  it('detects input type=password as SECRET_PASSWORD with NEVER_SEND policy', () => {
    const el: RawElement = {
      id: createElementId('e1'),
      tagName: 'input',
      role: null,
      ariaLabel: null,
      innerTextCandidate: 'Account Password',
      inputType: 'password',
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };

    const findings = detectElementPrivacy(el);
    expect(findings.some((f) => f.privacyClass === 'SECRET_PASSWORD')).toBe(true);

    const decisions = evaluatePrivacyPolicy(findings);
    const passwordDecision = decisions.find((d) => d.privacyClass === 'SECRET_PASSWORD');
    expect(passwordDecision?.decision).toBe('NEVER_SEND');
  });

  it('detects email in label candidate and tokenizes to [EMAIL_1]', () => {
    resetTokenCounters();
    const el: RawElement = {
      id: createElementId('e2'),
      tagName: 'input',
      role: null,
      ariaLabel: null,
      innerTextCandidate: 'contact.user@example.org',
      inputType: 'text',
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };

    const findings = detectElementPrivacy(el);
    expect(findings.some((f) => f.privacyClass === 'PII_EMAIL')).toBe(true);

    const decisions = evaluatePrivacyPolicy(findings);
    const emailDecision = decisions.find((d) => d.privacyClass === 'PII_EMAIL');
    expect(emailDecision?.decision).toBe('TOKENIZE');
    expect(emailDecision?.tokenRole).toBe('[EMAIL_1]');
  });

  it('detects API keys and bearer credentials as SECRET_API_KEY with NEVER_SEND', () => {
    const el: RawElement = {
      id: createElementId('e3'),
      tagName: 'div',
      role: 'button',
      ariaLabel: 'Token: sk_live_991823748291039482910293847',
      innerTextCandidate: 'Copy Key',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };

    const findings = detectElementPrivacy(el);
    expect(findings.some((f) => f.privacyClass === 'SECRET_API_KEY')).toBe(true);

    const decisions = evaluatePrivacyPolicy(findings);
    const keyDecision = decisions.find((d) => d.privacyClass === 'SECRET_API_KEY');
    expect(keyDecision?.decision).toBe('NEVER_SEND');
  });

  it('attaches a JWT textSpan so labels can be stripped', () => {
    const el: RawElement = {
      id: createElementId('jwt'),
      tagName: 'div',
      role: 'button',
      ariaLabel: null,
      innerTextCandidate: 'token eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sigvaluehere',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };
    const findings = detectElementPrivacy(el);
    const jwt = findings.find((f) => f.privacyClass === 'SECRET_AUTH_TOKEN');
    expect(jwt?.textSpan).toBe('eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sigvaluehere');
  });

  it('detects passwords and emails inside user task goals', () => {
    const goal = 'Login with email alice@work.com and password MySecretPass123!';
    const findings = detectGoalPrivacy(goal);

    expect(findings.some((f) => f.privacyClass === 'PII_EMAIL')).toBe(true);
    expect(findings.some((f) => f.privacyClass === 'SECRET_PASSWORD')).toBe(true);
  });
});

describe('NEVER_SEND secrets stay out of sanitizedGoal', () => {
  it('redacts API keys and JWTs from the goal before egress', () => {
    resetTokenCounters();
    const goal =
      'Use sk_live_aabbccddeeffgghh1234 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0MDE5In0.signaturepart';
    const findings = detectGoalPrivacy(goal);
    expect(findings.some((f) => f.privacyClass === 'SECRET_API_KEY')).toBe(true);
    expect(findings.some((f) => f.privacyClass === 'SECRET_AUTH_TOKEN')).toBe(true);
    const decisions = evaluatePrivacyPolicy(findings);
    const vault = new PrivateTokenVault();
    const scene = {
      _isLocalOnly: true as const,
      pageEpoch: createPageEpoch(1),
      url: 'https://bench.example/goal',
      origin: 'https://bench.example',
      title: 'Goal',
      viewport: { width: 800, height: 600 },
      elements: [],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    const safe = buildSafeContext(scene, goal, decisions, vault, createTaskId('goal-secret'), findings);
    expect(safe.sanitizedGoal).not.toContain('sk_live_');
    expect(safe.sanitizedGoal).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(() => validateSafeContextEgress(safe)).not.toThrow();
  });
});
