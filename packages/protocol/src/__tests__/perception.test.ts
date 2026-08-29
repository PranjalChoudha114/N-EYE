import { describe, it, expect } from 'vitest';
import {
  createPageEpoch,
  createElementId,
  CONTENT_SCRIPT_PROTOCOL,
  type PerceptionResult,
  type PrivacyReceipt,
} from '../index.js';

describe('Perception and assurance contracts', () => {
  it('marks PerceptionResult as local-only and never carries pixel fields', () => {
    const result: PerceptionResult = {
      _isLocalOnly: true,
      invoked: false,
      decision: {
        escalate: false,
        reasons: [],
        roiSpecs: [],
        skippedReason: 'DOM/ARIA labels are sufficient',
      },
      ocrBlocks: [],
      candidates: [],
      groundings: [],
      timings: {
        roiSelectionMs: 0,
        captureMs: 0,
        ocrInitMs: 0,
        ocrExecutionMs: 0,
        privacyMs: 0,
        groundingMs: 0,
        fusionMs: 0,
        totalMs: 0,
        ocrCold: false,
      },
      pageEpoch: createPageEpoch(1),
      fusedElementIds: [],
    };

    const serialized = JSON.stringify(result);
    expect(result._isLocalOnly).toBe(true);
    expect(serialized).not.toMatch(/data:image/i);
    expect(serialized).not.toContain('rgba');
  });

  it('defines PrivacyReceipt without vault or secret value fields', () => {
    const receipt: PrivacyReceipt = {
      receiptId: 'rcpt_1',
      timestamp: 1,
      hostname: 'example.com',
      protectionEvent: 'PROTECTED',
      perceptionSource: 'OCR',
      sensitiveClasses: ['PII_EMAIL', 'SECRET_PASSWORD'],
      transformations: [
        { privacyClass: 'PII_EMAIL', action: 'TOKENIZE' },
        { privacyClass: 'SECRET_PASSWORD', action: 'NEVER_SEND' },
      ],
      rawScreenshotSent: false,
      safeCropSent: false,
      safeContextBytes: 1024,
      egressResult: 'PASS',
      humanSummary: 'N-Eye detected private information locally before this AI request.',
      technicalEvidence: { ocrInvoked: true, roiCount: 1 },
    };

    expect(receipt.rawScreenshotSent).toBe(false);
    expect(receipt.safeCropSent).toBe(false);
    expect('realValue' in receipt).toBe(false);
    expect(createElementId('e1')).toBe('e1');
  });

  it('exports a content-script handshake protocol version', () => {
    expect(CONTENT_SCRIPT_PROTOCOL).toBe(1);
  });
});
