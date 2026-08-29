import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fieldLevel, isVisibleAt } from '../ui/evidence-visibility.js';
import { mapReceiptView } from '../ui/receipt-map.js';
import { classifyToast, toastFromEvent } from '../ui/notification-map.js';
import { containsMarkup, setSafeText } from '../ui/safe-text.js';
import { brandPath, brandUrl } from '../ui/brand.js';
import { markSessionInterrupted, createIdleState, stripQuery } from '../runtime/ui-snapshot.js';
import type { PrivacyReceipt } from '@n-eye/protocol';

describe('evidence visibility', () => {
  it('keeps engineering fields out of the compact card', () => {
    expect(fieldLevel('pageEpoch')).toBe('evidence');
    expect(fieldLevel('roiCount')).toBe('evidence');
    expect(isVisibleAt('hostname', 'compact')).toBe(true);
    expect(isVisibleAt('requestId', 'compact')).toBe(false);
    expect(isVisibleAt('pipeline', 'details')).toBe(true);
    expect(isVisibleAt('safeContextJson', 'details')).toBe(false);
  });
});

describe('receipt mapping', () => {
  it('does not claim passwords never left the device', () => {
    const receipt: PrivacyReceipt = {
      receiptId: 'rcpt_1',
      timestamp: 1,
      hostname: 'lab.example',
      protectionEvent: 'PROTECTED',
      perceptionSource: 'DOM',
      sensitiveClasses: ['PII_EMAIL'],
      transformations: [{ privacyClass: 'PII_EMAIL', action: 'TOKENIZE' }],
      rawScreenshotSent: false,
      safeCropSent: false,
      safeContextBytes: 100,
      plannerProvider: 'mock',
      plannerModel: 'local-deterministic',
      egressResult: 'PASS',
      humanSummary: 'N-Eye detected private information locally before this AI request.',
      technicalEvidence: {},
    };
    const view = mapReceiptView(receipt, {
      sensitiveCount: 1,
      keptLocal: ['Password'],
      tokenized: [{ label: 'Email', token: '[EMAIL_1]' }],
      screenshotBytes: 0,
      protectedContextBytes: 100,
    });
    expect(view.title).toBe('Protected');
    expect(view.humanSummary).not.toMatch(/never left your device/i);
    expect(view.screenshotBytes).toBe(0);
  });
});

describe('notification classification', () => {
  it('does not toast site-change or idle observation', () => {
    expect(classifyToast('SITE_CHANGE')).toBeNull();
    expect(classifyToast('LOCAL_ONLY')).toBeNull();
    expect(classifyToast('PROTECTED')).toBe('PROTECTED');
    expect(
      toastFromEvent({
        kind: 'SITE_CHANGE',
        hostname: 'example.com',
        message: 'N-Eye active on example.com',
        severity: 'info',
        dedupeKey: 'site',
        timestamp: 1,
      })
    ).toBeNull();
  });
});

describe('safe text', () => {
  it('assigns planner markup as text, never HTML', () => {
    const el = document.createElement('div');
    const payload = '<img src=x onerror="alert(1)">click submit';
    expect(containsMarkup(payload)).toBe(true);
    setSafeText(el, payload);
    expect(el.textContent).toBe(payload);
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('brand resolver', () => {
  it('centralizes the mark path', () => {
    expect(brandPath('mark')).toBe('brand/n-eye-mark.png');
    expect(brandUrl('icon16')).toContain('brand/icon-16.png');
  });
});

describe('popup reopen snapshot', () => {
  it('marks a running session interrupted without copying secrets', () => {
    const idle = createIdleState();
    const running = { ...idle, running: true, canCancel: true, phase: 'PLANNING' as const };
    const next = markSessionInterrupted(running, 'The N-Eye Trust Center closed. The in-flight task was stopped.');
    expect(next.running).toBe(false);
    expect(next.phase).toBe('CANCELLED');
    expect(JSON.stringify(next)).not.toMatch(/password|otp|sk_live/i);
  });

  it('strips query strings from stored page URLs', () => {
    expect(stripQuery('https://lab.example/form?token=secret-query')).toBe('https://lab.example/form');
  });
});

describe('T013/T014 surface architecture', () => {
  it('does not use a standalone popup window as the primary surface', () => {
    const sw = readFileSync(
      resolve(__dirname, '../background/service-worker.ts'),
      'utf8'
    );
    expect(sw).not.toMatch(/chrome\.windows\.create/);
    expect(sw).toMatch(/N_EYE_TOGGLE_OVERLAY/);
    expect(sw).toMatch(/sidePanel\.open/);
  });

  it('keeps trust-loop ownership out of the overlay', () => {
    const overlay = readFileSync(resolve(__dirname, '../overlay/overlay-host.ts'), 'utf8');
    expect(overlay).not.toMatch(/TrustLoopController/);
    expect(overlay).not.toMatch(/from ['"].*vault/);
    expect(overlay).not.toMatch(/new PrivateTokenVault/);
    expect(overlay).not.toMatch(/new PlannerManager/);
    expect(overlay).not.toMatch(/persistThemePref/);
  });

  it('mounts the Side Panel as owner, not the deprecated popup host', () => {
    const html = readFileSync(resolve(__dirname, '../sidepanel/index.html'), 'utf8');
    const host = readFileSync(resolve(__dirname, '../sidepanel/host.ts'), 'utf8');
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../manifest.json'), 'utf8')
    ) as { permissions: string[]; action?: { default_popup?: string } };
    expect(html).toMatch(/sidepanel\.ts/);
    expect(html).not.toMatch(/popup\.ts/);
    expect(host).toMatch(/n-eye-owner/);
    expect(host).toMatch(/TrustLoopController/);
    expect(manifest.permissions).toEqual(['sidePanel', 'activeTab', 'tabs', 'scripting']);
    expect(manifest.action?.default_popup).toBeUndefined();
  });
});
