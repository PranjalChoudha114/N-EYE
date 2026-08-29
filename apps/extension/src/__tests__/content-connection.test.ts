import { describe, it, expect } from 'vitest';
import {
  classifySendMessageError,
  decideRecovery,
  disconnectedLabel,
  MAX_INJECT_ATTEMPTS,
  wouldExceedInjectBound,
  uiHealthForAction,
} from '../runtime/content-connection.js';
import { classifySupportedUrl } from '../runtime/supported-url.js';

describe('Content-script recovery contract', () => {
  it('classifies receiving-end-does-not-exist as NO_RECEIVER', () => {
    expect(
      classifySendMessageError('Could not establish connection. Receiving end does not exist.')
    ).toBe('NO_RECEIVER');
  });

  it('injects once on a supported page with no receiver', () => {
    const first = decideRecovery({
      urlSupported: true,
      injectAttempts: 0,
      errorClass: 'NO_RECEIVER',
    });
    expect(first.action).toBe('INJECT');
    expect(uiHealthForAction(first.action)).toBe('INJECTING');
  });

  it('never injects a second time (bounded recovery)', () => {
    expect(MAX_INJECT_ATTEMPTS).toBe(1);
    expect(wouldExceedInjectBound(1)).toBe(true);
    const second = decideRecovery({
      urlSupported: true,
      injectAttempts: 1,
      errorClass: 'NO_RECEIVER',
    });
    expect(second.action).toBe('GIVE_UP');
    expect(uiHealthForAction(second.action)).toBe('DISCONNECTED');
    expect(disconnectedLabel('NO_RECEIVER')).toBe('CONTENT SCRIPT DISCONNECTED');
  });

  it('does not inject into restricted Chrome pages', () => {
    expect(classifySupportedUrl('chrome://extensions').isSupported).toBe(false);
    const decision = decideRecovery({
      urlSupported: false,
      injectAttempts: 0,
      errorClass: 'NO_RECEIVER',
    });
    expect(decision.action).toBe('UNSUPPORTED');
    expect(uiHealthForAction(decision.action)).toBe('UNSUPPORTED');
  });

  it('does not report READY after injection failure', () => {
    const decision = decideRecovery({
      urlSupported: true,
      injectAttempts: 0,
      errorClass: 'INJECTION_FAILED',
    });
    expect(decision.action).toBe('GIVE_UP');
    expect(uiHealthForAction(decision.action)).not.toBe('READY');
  });

  it('does not loop inject attempts in a simulated retry sequence', () => {
    let injects = 0;
    let attempts = 0;
    let action = decideRecovery({
      urlSupported: true,
      injectAttempts: injects,
      errorClass: 'NO_RECEIVER',
    }).action;
    while (action === 'INJECT' && attempts < 20) {
      injects += 1;
      attempts += 1;
      action = decideRecovery({
        urlSupported: true,
        injectAttempts: injects,
        errorClass: 'NO_RECEIVER',
      }).action;
    }
    expect(injects).toBe(1);
    expect(action).toBe('GIVE_UP');
    expect(attempts).toBeLessThan(3);
  });
});
