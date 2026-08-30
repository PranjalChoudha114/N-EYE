import { describe, it, expect } from 'vitest';
import {
  AssuranceBus,
  buildPrivacyReceipt,
  localMonitoringState,
  maybeSiteChangeEvent,
  protectedState,
  receiptContainsForbiddenSecret,
  blockedState,
} from '../assurance/index.js';
import { createElementId } from '@n-eye/protocol';

describe('Human assurance: site-change, receipts, truthful states', () => {
  it('emits one site-change event per hostname and never includes query parameters', () => {
    const bus = new AssuranceBus(() => 1_000);
    const first = maybeSiteChangeEvent(
      bus,
      null,
      'https://github.com/org/repo?token=SECRET_QUERY',
      'https://github.com',
      true
    );
    expect(first?.message).toBe('N-Eye active on github.com');
    expect(first?.message).not.toContain('token=');
    const repeat = maybeSiteChangeEvent(
      bus,
      'github.com',
      'https://github.com/org/repo/issues',
      'https://github.com',
      true
    );
    expect(repeat).toBeNull();
    const next = maybeSiteChangeEvent(
      bus,
      'github.com',
      'https://my.upes.ac.in/login?session=abc',
      'https://my.upes.ac.in',
      true
    );
    expect(next?.message).toBe('N-Eye active on my.upes.ac.in');
    expect(next?.message).not.toContain('session=');
    const filePage = maybeSiteChangeEvent(
      bus,
      'my.upes.ac.in',
      'file:///Users/secret/private-form.html?token=leak',
      'file://',
      true
    );
    expect(filePage?.message).toBe('N-Eye active on local file');
    expect(filePage?.message).not.toContain('private-form');
    expect(filePage?.message).not.toContain('token=');
    const restricted = maybeSiteChangeEvent(bus, 'local file', 'chrome://extensions', 'chrome://extensions', false);
    expect(restricted?.message).toBe('N-Eye cannot protect restricted Chrome page');
  });

  it('dedupes identical notifications inside the cooldown window', () => {
    let now = 5_000;
    const bus = new AssuranceBus(() => now);
    const a = bus.emit({
      kind: 'PROTECTED',
      hostname: 'example.com',
      message: 'N-Eye protected an AI request.',
      severity: 'success',
      dedupeKey: 'protected:example.com',
    });
    const b = bus.emit({
      kind: 'PROTECTED',
      hostname: 'example.com',
      message: 'N-Eye protected an AI request.',
      severity: 'success',
      dedupeKey: 'protected:example.com',
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    now = 20_000;
    const c = bus.emit({
      kind: 'PROTECTED',
      hostname: 'example.com',
      message: 'N-Eye protected an AI request.',
      severity: 'success',
      dedupeKey: 'protected:example.com',
    });
    expect(c).not.toBeNull();
  });

  it('builds a receipt without vault values or raw secrets', () => {
    const receipt = buildPrivacyReceipt({
      hostname: 'lab.example.com',
      protectionEvent: 'PROTECTED',
      perceptionSource: 'OCR',
      findings: [
        {
          findingId: 'f1',
          privacyClass: 'PII_EMAIL',
          confidence: 1,
          source: 'ocr',
          fieldLocation: 'ocr.roi.b1',
          textSpan: 'OCR_EMAIL_T007@example.com',
          detector: 'regex_email',
          reason: 'ocr email',
          elementId: createElementId('e1'),
        },
        {
          findingId: 'f2',
          privacyClass: 'SECRET_PASSWORD',
          confidence: 1,
          source: 'ocr',
          fieldLocation: 'ocr.roi.b2',
          textSpan: 'SuperSecretVaultValue',
          detector: 'label_semantics',
          reason: 'ocr password',
        },
      ],
      decisions: [
        {
          findingId: 'f1',
          privacyClass: 'PII_EMAIL',
          decision: 'TOKENIZE',
          tokenRole: '[EMAIL_1]',
          reason: 'tokenize',
        },
        {
          findingId: 'f2',
          privacyClass: 'SECRET_PASSWORD',
          decision: 'NEVER_SEND',
          reason: 'never',
        },
      ],
      rawScreenshotSent: false,
      safeCropSent: false,
      safeContextBytes: 512,
      egressResult: 'PASS',
      plannerProvider: 'mock',
      ocrInvoked: true,
    });
    expect(receipt.rawScreenshotSent).toBe(false);
    expect(receipt.safeCropSent).toBe(false);
    expect(receipt.humanSummary).toMatch(/hidden from the AI/i);
    expect(receipt.humanSummary).toMatch(/password was not included in the AI request/i);
    expect(receipt.humanSummary).not.toMatch(/never left your device/i);
    expect(receiptContainsForbiddenSecret(receipt, ['OCR_EMAIL_T007@example.com', 'SuperSecretVaultValue'])).toBe(
      false
    );
  });

  it('does not claim PROTECTED for manual browsing with no AI request', () => {
    const local = localMonitoringState(['PII_EMAIL', 'SECRET_PASSWORD']);
    expect(local.state).toBe('LOCAL_MONITORING');
    expect(local.detail).toMatch(/No AI request was sent/);
    expect(local.detail).toMatch(/Email/);
    expect(local.detail).toMatch(/Password/);
    const blocked = blockedState();
    expect(blocked.state).toBe('BLOCKED');
    const protectedView = protectedState(2);
    expect(protectedView.state).toBe('PROTECTED');
  });
});
