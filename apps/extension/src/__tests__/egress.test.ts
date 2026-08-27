import { describe, it, expect } from 'vitest';
import { validateSafeContextEgress, EgressViolationError } from '../privacy/egress-guard.js';
import {
  type SafeContext,
  createTaskId,
  createPageEpoch,
  createElementId,
  createTokenId,
} from '@n-eye/protocol';

describe('Egress Guard & Byte-Level Canary Proof', () => {
  it('allows compliant SafeContext with token capabilities', () => {
    const validContext: SafeContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-100'),
      pageEpoch: createPageEpoch(1),
      sanitizedGoal: 'Login with [EMAIL_1]',
      pageMetadata: {
        origin: 'https://example.com',
        sanitizedTitle: 'Login Page',
        viewport: { width: 1280, height: 720 },
      },
      safeElements: [
        {
          id: createElementId('e1'),
          role: 'textbox',
          safeLabel: '[EMAIL_1] (email)',
          inputType: 'email',
          isEnabled: true,
          bbox: { x: 10, y: 20, width: 200, height: 40 },
        },
      ],
      availableTokens: [
        {
          tokenId: createTokenId('tok-1'),
          tokenSymbol: '[EMAIL_1]',
          privacyClass: 'PII_EMAIL',
          descriptionRole: 'Scoped email token',
        },
      ],
    };

    const serialized = validateSafeContextEgress(validContext);
    expect(serialized).toBeDefined();
    expect(typeof serialized).toBe('string');
  });

  it('blocks egress if CANARY_PASSWORD is present anywhere in serialized bytes', () => {
    const leakedContext: SafeContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-100'),
      pageEpoch: createPageEpoch(1),
      sanitizedGoal: 'Login with CANARY_PASSWORD_SECRET_999!',
      pageMetadata: { origin: 'https://example.com', sanitizedTitle: 'Login', viewport: { width: 100, height: 100 } },
      safeElements: [],
      availableTokens: [],
    };

    expect(() => {
      validateSafeContextEgress(leakedContext);
    }).toThrow(EgressViolationError);
  });

  it('blocks egress if RawScene local-only properties leaked into payload', () => {
    const invalidContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-100'),
      pageEpoch: createPageEpoch(1),
      _isLocalOnly: true, // Forbidden in SafeContext
      sanitizedGoal: 'Goal',
      pageMetadata: { origin: 'https://example.com', sanitizedTitle: 'Title', viewport: { width: 100, height: 100 } },
      safeElements: [],
      availableTokens: [],
    } as unknown as SafeContext;

    expect(() => {
      validateSafeContextEgress(invalidContext);
    }).toThrow(EgressViolationError);
  });
});
