import { describe, it, expect } from 'vitest';
import { createTaskId } from '@n-eye/protocol';
import {
  emptyVisualizerModel,
  modelContainsExamplePlaceholder,
  visualizerModel,
} from '../assurance/privacy-visualizer.js';
import type { PrivacyFinding, SafeContext } from '@n-eye/protocol';

describe('Privacy visualizer truthfulness', () => {
  it('empty state does not include demo emails or tokens', () => {
    const empty = emptyVisualizerModel();
    expect(empty.mode).toBe('empty');
    expect(empty.caption).toMatch(/No N-Eye privacy transformation has occurred/i);
    expect(modelContainsExamplePlaceholder(empty)).toBe(false);
    expect(JSON.stringify(empty)).not.toContain('user@example.com');
    expect(JSON.stringify(empty)).not.toContain('[EMAIL_1]');
  });

  it('live evidence only appears when a real protect step provided findings and SafeContext', () => {
    const findings: PrivacyFinding[] = [
      {
        findingId: 'f1',
        privacyClass: 'PII_EMAIL',
        confidence: 1,
        source: 'ocr',
        fieldLocation: 'ocr.roi.b1',
        textSpan: 'alice@example.com',
        detector: 'regex_email',
        reason: 'ocr email',
      },
    ];
    const safe = {
      protocolVersion: '1.0.0',
      taskId: createTaskId('task-viz'),
      pageEpoch: 1,
      sanitizedGoal: 'Continue',
      pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
      safeElements: [],
      availableTokens: [
        {
          tokenId: 'tok_1',
          tokenSymbol: '[EMAIL_1]',
          privacyClass: 'PII_EMAIL',
          descriptionRole: 'email',
        },
      ],
    } as unknown as SafeContext;
    const live = visualizerModel(findings, safe);
    expect(live.mode).toBe('live');
    expect(JSON.stringify(live.local)).toContain('alice@example.com');
    expect(JSON.stringify(live.safe)).toContain('[EMAIL_1]');
    expect(visualizerModel(null, null).mode).toBe('empty');
  });
});
