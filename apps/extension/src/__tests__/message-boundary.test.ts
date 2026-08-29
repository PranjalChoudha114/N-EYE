/**
 * Message-boundary predicates.
 * Page-world JS cannot call chrome.runtime.*. These tests prove the remaining gap —
 * content-script vs extension-page confused deputy — is closed by sender classification.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyOwnerPort,
  isExtensionPageSender,
  isSameExtensionSender,
  overlayConfirmPermitted,
  resolveInjectTarget,
} from '../runtime/message-trust.js';
import { scrubSecurityDetail, SecurityLog } from '../authority/security-log.js';

const EXT_ID = 'abcdefghijklmnopqrstuvwxyzabcdef';
const EXT_ORIGIN = `chrome-extension://${EXT_ID}`;

describe('Message-boundary sender classification', () => {
  it('rejects missing, foreign, or empty senders', () => {
    expect(isSameExtensionSender(undefined, EXT_ID)).toBe(false);
    expect(isSameExtensionSender({ id: 'other-extension' }, EXT_ID)).toBe(false);
    expect(isSameExtensionSender({ id: EXT_ID }, undefined)).toBe(false);
    expect(isSameExtensionSender({ id: EXT_ID }, EXT_ID)).toBe(true);
  });

  it('treats a content-script sender as page-adjacent, never as the owner document', () => {
    const contentSender = {
      id: EXT_ID,
      url: 'https://hostile.example/app',
      tab: { id: 12, windowId: 1 },
    };
    expect(isExtensionPageSender(contentSender, EXT_ORIGIN)).toBe(false);
    expect(classifyOwnerPort(contentSender, EXT_ID, EXT_ORIGIN).ok).toBe(false);
    expect(classifyOwnerPort(contentSender, EXT_ID, EXT_ORIGIN).reason).toMatch(/extension-served document/);
  });

  it('allows only an extension-served Side Panel document to own the session port', () => {
    const owner = { id: EXT_ID, url: `${EXT_ORIGIN}/src/sidepanel/index.html` };
    expect(isExtensionPageSender(owner, EXT_ORIGIN)).toBe(true);
    expect(classifyOwnerPort(owner, EXT_ID, EXT_ORIGIN).ok).toBe(true);
  });

  it('a content script may only inject its own tab; a forged tabId is refused', () => {
    const contentSender = { id: EXT_ID, tab: { id: 12 } };
    expect(resolveInjectTarget(contentSender, 12, 99)).toBe(12);
    expect(resolveInjectTarget(contentSender, 99, 99)).toBeNull();
    expect(resolveInjectTarget(contentSender, undefined, 99)).toBe(12);
  });

  it('tab-adjacent confirm without confirmationId is not a capability', () => {
    const tabSender = { id: EXT_ID, tab: { id: 12 } };
    const ownerSender = { id: EXT_ID, url: `${EXT_ORIGIN}/src/sidepanel/index.html` };
    expect(overlayConfirmPermitted(tabSender)).toBe(false);
    expect(overlayConfirmPermitted(tabSender, 'cnf_real')).toBe(true);
    expect(overlayConfirmPermitted(ownerSender)).toBe(true);
  });

  it('an extension page may only inject the active bound tab', () => {
    const owner = { id: EXT_ID, url: `${EXT_ORIGIN}/src/sidepanel/index.html` };
    expect(resolveInjectTarget(owner, 7, 7)).toBe(7);
    expect(resolveInjectTarget(owner, 8, 7)).toBeNull();
    expect(resolveInjectTarget(owner, undefined, 7)).toBe(7);
  });
});

describe('Security log never records secrets', () => {
  it('scrubs emails, canaries, keys, and long digit runs from details', () => {
    const log = new SecurityLog();
    const event = log.record({
      reasonCode: 'TOKEN_SCOPE_VIOLATION',
      detail: 'Token [EMAIL_1] for victim@example.com CANARY_PASSWORD_T015 sk_live_abcdefghijklmnopqrstuvwxyz 123456',
      actionType: 'TYPE_TOKEN',
      targetId: 'e1',
    });
    expect(event.detail).not.toContain('victim@example.com');
    expect(event.detail).not.toContain('CANARY_PASSWORD_T015');
    expect(event.detail).not.toContain('sk_live_');
    expect(event.detail).toContain('[REDACTED]');
    expect(scrubSecurityDetail('plain field mismatch')).toBe('plain field mismatch');
  });
});
