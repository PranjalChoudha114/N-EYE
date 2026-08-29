import { describe, it, expect } from 'vitest';
import { createElementId, type PrivacyDecision, type PrivacyFinding } from '@n-eye/protocol';
import { selectVaultRealValue, tokenizeDecisionsWithValues } from '../privacy/token-values.js';

describe('Vault real-value selection', () => {
  it('never invents a demo identity when a finding has no text span', () => {
    const fieldTypeOnly: PrivacyFinding = {
      findingId: 'find_email_type',
      privacyClass: 'PII_EMAIL',
      confidence: 1,
      source: 'input_semantics',
      elementId: createElementId('e1'),
      fieldLocation: 'element.inputType',
      detector: 'browser_input_type',
      reason: 'Interactive element has type=email',
    };

    expect(selectVaultRealValue(fieldTypeOnly)).toBeNull();
    expect(selectVaultRealValue(undefined)).toBeNull();
  });

  it('registers TOKENIZE bindings only when a real value span exists', () => {
    const findings: PrivacyFinding[] = [
      {
        findingId: 'find_type',
        privacyClass: 'PII_EMAIL',
        confidence: 1,
        source: 'input_semantics',
        elementId: createElementId('e1'),
        fieldLocation: 'element.inputType',
        detector: 'browser_input_type',
        reason: 'type=email',
      },
      {
        findingId: 'find_goal',
        privacyClass: 'PII_EMAIL',
        confidence: 0.99,
        source: 'pattern',
        fieldLocation: 'task.goal',
        textSpan: 'rahul@example.com',
        detector: 'regex_email',
        reason: 'User task goal contains raw email address',
      },
    ];

    const decisions: PrivacyDecision[] = [
      {
        findingId: 'find_type',
        elementId: createElementId('e1'),
        privacyClass: 'PII_EMAIL',
        decision: 'TOKENIZE',
        tokenRole: '[EMAIL_1]',
        reason: 'field type',
      },
      {
        findingId: 'find_goal',
        privacyClass: 'PII_EMAIL',
        decision: 'TOKENIZE',
        tokenRole: '[EMAIL_2]',
        reason: 'goal value',
      },
    ];

    const pairs = tokenizeDecisionsWithValues(decisions, findings);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.decision.tokenRole).toBe('[EMAIL_2]');
    expect(pairs[0]?.realValue).toBe('rahul@example.com');
    expect(JSON.stringify(pairs)).not.toContain('alice.applicant');
    expect(JSON.stringify(pairs)).not.toContain('+1-555-0199');
  });
});
