import { describe, it, expect } from 'vitest';
import { detectElementPrivacy, detectGoalPrivacy, detectOcrTextPrivacy } from '../privacy/detectors.js';
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

  it('attaches a textSpan for API-key findings so derived labels can be stripped', () => {
    const el: RawElement = {
      id: createElementId('akia'),
      tagName: 'div',
      role: 'button',
      ariaLabel: null,
      innerTextCandidate: 'key AKIAIOSFODNN7EXAMPLE',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 100, height: 30 },
    };
    const findings = detectElementPrivacy(el);
    const api = findings.find((f) => f.privacyClass === 'SECRET_API_KEY');
    expect(api?.textSpan).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts NEVER_SEND material from page title, not only CANARY_ tokens', () => {
    resetTokenCounters();
    const titleKey = 'sk_live_titleleak9918237482910394';
    const titleJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aXRsZSI6InQwMTkifQ.sigvaluehere';
    const titleEmail = 'title.leak@example.com';
    const scene = {
      _isLocalOnly: true as const,
      pageEpoch: createPageEpoch(1),
      url: 'https://bench.example/title',
      origin: 'https://bench.example',
      title: `Dashboard ${titleKey} ${titleJwt} ${titleEmail}`,
      viewport: { width: 800, height: 600 },
      elements: [],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    const safe = buildSafeContext(
      scene,
      'Continue',
      evaluatePrivacyPolicy([]),
      new PrivateTokenVault(),
      createTaskId('title-secret'),
      []
    );
    const serialized = validateSafeContextEgress(safe);
    expect(safe.pageMetadata.sanitizedTitle).not.toContain('sk_live_');
    expect(safe.pageMetadata.sanitizedTitle).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(safe.pageMetadata.sanitizedTitle).not.toContain(titleEmail);
    expect(serialized).not.toContain(titleKey);
    expect(serialized).not.toContain(titleJwt);
    expect(serialized).not.toContain(titleEmail);
  });

  it('redacts non-Stripe API keys from OCR visual hints even without a matching DOM element', () => {
    resetTokenCounters();
    const googleKey = 'AIzaSyAabcdefghijklmnopqrstuvwxyz012345';
    const githubKey = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const el: RawElement = {
      id: createElementId('canvas'),
      tagName: 'canvas',
      role: 'canvas',
      ariaLabel: null,
      innerTextCandidate: 'Chart',
      inputType: null,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 200, height: 40 },
    };
    const scene = {
      _isLocalOnly: true as const,
      pageEpoch: createPageEpoch(1),
      url: 'https://bench.example/ocr',
      origin: 'https://bench.example',
      title: 'Chart',
      viewport: { width: 800, height: 600 },
      elements: [el],
      privacyFindings: [],
      timestamp: Date.now(),
    };
    const findings = [
      ...detectOcrTextPrivacy(googleKey, { roiId: 'roi_1', blockId: 'b1' }),
      ...detectOcrTextPrivacy(githubKey, { roiId: 'roi_1', blockId: 'b2' }),
    ];
    const decisions = evaluatePrivacyPolicy(findings);
    const safe = buildSafeContext(scene, 'Continue', decisions, new PrivateTokenVault(), createTaskId('ocr-key'), findings, {
      visualCandidates: [
        {
          candidateId: 'vc_g',
          elementId: el.id,
          label: `Google ${googleKey}`,
          bbox: el.bbox,
          source: 'OCR',
          confidence: 'HIGH',
          pageEpoch: scene.pageEpoch,
        },
        {
          candidateId: 'vc_h',
          elementId: el.id,
          label: `GitHub ${githubKey}`,
          bbox: el.bbox,
          source: 'OCR',
          confidence: 'HIGH',
          pageEpoch: scene.pageEpoch,
        },
      ],
    });
    const serialized = validateSafeContextEgress(safe);
    expect(serialized).not.toContain(googleKey);
    expect(serialized).not.toContain(githubKey);
    expect(JSON.stringify(safe.visualHints || [])).not.toContain('AIza');
    expect(JSON.stringify(safe.visualHints || [])).not.toContain('ghp_');
  });
});
