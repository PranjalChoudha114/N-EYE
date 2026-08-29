import { describe, expect, it } from 'vitest';
import { createTaskId } from '@n-eye/protocol';
import { buildPrivacySummary, boundaryVisualization, summaryContainsRawValue } from '../ui/privacy-summary.js';
import type { PrivacyDecision, PrivacyFinding, SafeContext } from '@n-eye/protocol';

describe('privacy summary mapping', () => {
  it('uses class names and tokens, never raw secrets', () => {
    const findings: PrivacyFinding[] = [
      {
        findingId: 'f1',
        privacyClass: 'PII_EMAIL',
        confidence: 1,
        source: 'pattern',
        fieldLocation: 'goal',
        textSpan: 'alice.secret@example.com',
        detector: 'regex_email',
        reason: 'email',
      },
      {
        findingId: 'f2',
        privacyClass: 'SECRET_PASSWORD',
        confidence: 1,
        source: 'input_semantics',
        fieldLocation: 'input',
        textSpan: 'SuperSecretVaultValue',
        detector: 'password',
        reason: 'password',
      },
    ];
    const decisions: PrivacyDecision[] = [
      { findingId: 'f1', privacyClass: 'PII_EMAIL', decision: 'TOKENIZE', tokenRole: '[EMAIL_1]', reason: 'tok' },
      { findingId: 'f2', privacyClass: 'SECRET_PASSWORD', decision: 'NEVER_SEND', reason: 'never' },
    ];
    const safe = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-sum'),
      pageEpoch: 1,
      sanitizedGoal: 'Continue',
      pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
      safeElements: [],
      availableTokens: [
        { tokenId: 'tok_1', tokenSymbol: '[EMAIL_1]', privacyClass: 'PII_EMAIL', descriptionRole: 'email' },
      ],
    } as unknown as SafeContext;
    const summary = buildPrivacySummary(findings, decisions, safe, {
      screenshotBytes: 0,
      protectedContextBytes: 512,
    });
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.keptLocal).toContain('Password');
    expect(summary.tokenized[0]?.token).toBe('[EMAIL_1]');
    expect(summaryContainsRawValue(summary, ['alice.secret@example.com', 'SuperSecretVaultValue'])).toBe(false);
    const boundary = boundaryVisualization(summary);
    expect(boundary.local.join(' ')).toContain('[EMAIL_1]');
    expect(boundary.cloud.join(' ')).toContain('0 B');
  });

  it('is empty until a real protect step provided context', () => {
    expect(buildPrivacySummary(null, null, null)).toBeNull();
  });
});
