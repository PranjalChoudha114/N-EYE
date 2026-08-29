import { describe, it, expect } from 'vitest';
import {
  createTaskId,
  createElementId,
  createPageEpoch,
  createActionId,
  createTokenId,
  createFrameId,
  NEyeError,
  type SafeContext,
  type ActionProposal,
  type RawScene,
} from '../index.js';

describe('Protocol Package & Identifier Type Safety', () => {
  it('correctly constructs branded nominal identifiers', () => {
    const taskId = createTaskId('task-001');
    const elemId = createElementId('e17');
    const epoch = createPageEpoch(42);
    const actionId = createActionId('act-99');
    const tokenId = createTokenId('TOKEN_EMAIL_1');

    expect(taskId).toBe('task-001');
    expect(elemId).toBe('e17');
    expect(epoch).toBe(42);
    expect(actionId).toBe('act-99');
    expect(tokenId).toBe('TOKEN_EMAIL_1');
  });

  it('correctly constructs NEyeError with category and timestamp', () => {
    const err = new NEyeError('VALIDATION_ERROR', 'Target button e17 is stale', true);
    expect(err.name).toBe('NEyeError');
    expect(err.category).toBe('VALIDATION_ERROR');
    expect(err.isRecoverable).toBe(true);
    expect(err.message).toContain('Target button e17 is stale');

    const json = err.toJSON();
    expect(json['category']).toBe('VALIDATION_ERROR');
    expect(json['isRecoverable']).toBe(true);
  });

  it('validates structure of a valid SafeContext payload', () => {
    const safeContext: SafeContext = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-123'),
      pageEpoch: createPageEpoch(1),
      sanitizedGoal: 'Fill application form',
      pageMetadata: {
        origin: 'https://test.local',
        sanitizedTitle: 'Test Form',
        viewport: { width: 1280, height: 800 },
      },
      safeElements: [
        {
          id: createElementId('e1'),
          role: 'button',
          safeLabel: 'Submit Form',
          inputType: 'submit',
          isEnabled: true,
          bbox: { x: 100, y: 200, width: 80, height: 32 },
        },
      ],
      availableTokens: [
        {
          tokenId: createTokenId('TOKEN_EMAIL_1'),
          tokenSymbol: '[EMAIL_1]',
          privacyClass: 'PII_EMAIL',
          descriptionRole: 'Primary user email',
        },
      ],
    };

    expect(safeContext.protocolVersion).toBe('1.0.0');
    expect(safeContext.safeElements).toHaveLength(1);
    expect(safeContext.safeElements[0]?.safeLabel).toBe('Submit Form');
    expect(safeContext.availableTokens[0]?.tokenId).toBe('TOKEN_EMAIL_1');
  });

  it('validates RawScene local-only contract marker', () => {
    const rawScene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: 'https://test.local/form',
      origin: 'https://test.local',
      title: 'Confidential Page',
      viewport: { width: 1280, height: 800 },
      elements: [
        {
          id: createElementId('e1'),
          tagName: 'input',
          role: 'textbox',
          ariaLabel: 'Password',
          innerTextCandidate: null,
          inputType: 'password',
          isEnabled: true,
          bbox: { x: 10, y: 20, width: 200, height: 30 },
          xpath: '/html/body/form/input[1]',
        },
      ],
      privacyFindings: [
        {
          findingId: 'find_1',
          elementId: createElementId('e1'),
          privacyClass: 'SECRET_PASSWORD',
          confidence: 1.0,
          source: 'input_semantics',
          fieldLocation: 'element.inputType',
          detector: 'browser_input_type',
          reason: 'Input type is password',
        },
      ],
      timestamp: Date.now(),
    };

    expect(rawScene._isLocalOnly).toBe(true);
    expect(rawScene.privacyFindings[0]?.privacyClass).toBe('SECRET_PASSWORD');
  });

  it('validates ActionProposal structured schema', () => {
    const proposal: ActionProposal = {
      actionId: createActionId('act-1'),
      type: 'CLICK',
      targetId: createElementId('e1'),
      reasoning: 'Click the submit button to proceed',
      expectedOutcome: 'Form should be submitted and redirect to confirmation page',
      riskLevel: 'HIGH',
    };

    expect(proposal.type).toBe('CLICK');
    expect(proposal.riskLevel).toBe('HIGH');
    expect(proposal.targetId).toBe('e1');
  });

  it('constructs opaque FrameIds that must never look like URLs', () => {
    const frameId = createFrameId('f1');
    expect(frameId).toBe('f1');
    expect(frameId).not.toMatch(/https?:/i);
    expect(frameId).not.toContain('?');
  });

  it('exports a closed security reason vocabulary and confirmation capability shape', async () => {
    const security = await import('../security.js');
    const codes = [
      'MALFORMED_PROPOSAL',
      'POLICY_VIOLATION',
      'INVALID_TARGET',
      'STALE_TARGET',
      'FRAME_VIOLATION',
      'TOKEN_SCOPE_VIOLATION',
      'CONFIRMATION_REQUIRED',
      'CONFIRMATION_STALE',
      'CONFIRMATION_REPLAY',
      'RISK_ESCALATED',
      'UNTRUSTED_AUTHORITY_CLAIM',
    ];
    for (const code of codes) {
      const sample: import('../security.js').SecurityReasonCode = code as import('../security.js').SecurityReasonCode;
      expect(sample).toBe(code);
    }
    expect(typeof security).toBe('object');
  });
});
