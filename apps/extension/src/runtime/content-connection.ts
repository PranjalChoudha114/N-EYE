import type { ContentScriptErrorClass, ContentScriptHealth } from '@n-eye/protocol';

/**
 * Content-script recovery planner (Zone 2).
 * OWNS: Bounded inject/handshake decisions. No Chrome APIs — those stay in the Side Panel / SW.
 * TRUST: Failure never reports READY. Inject at most once per observation attempt.
 */

export const MAX_INJECT_ATTEMPTS = 1;
export const MAX_OBSERVE_AFTER_INJECT = 1;
export const HANDSHAKE_TIMEOUT_MS = 1500;
export const HANDSHAKE_POLL_MS = 50;

export type RecoveryAction = 'OBSERVE' | 'INJECT' | 'HANDSHAKE' | 'GIVE_UP' | 'UNSUPPORTED';

export function classifySendMessageError(message: string | undefined): ContentScriptErrorClass {
  const text = (message || '').toLowerCase();
  if (!text) return 'UNKNOWN';
  if (text.includes('receiving end does not exist') || text.includes('could not establish connection')) {
    return 'NO_RECEIVER';
  }
  if (text.includes('frame was removed') || text.includes('the tab was closed')) {
    return 'TAB_NAVIGATING';
  }
  if (text.includes('cannot be scripted') || text.includes('cannot access') || text.includes('extensions gallery')) {
    return 'UNSUPPORTED_URL';
  }
  return 'NO_RECEIVER';
}

export function uiHealthForAction(action: RecoveryAction): ContentScriptHealth {
  switch (action) {
    case 'INJECT':
    case 'HANDSHAKE':
      return 'INJECTING';
    case 'OBSERVE':
      return 'UNKNOWN';
    case 'UNSUPPORTED':
      return 'UNSUPPORTED';
    case 'GIVE_UP':
      return 'DISCONNECTED';
    default:
      return 'UNKNOWN';
  }
}

export function decideRecovery(input: {
  urlSupported: boolean;
  injectAttempts: number;
  errorClass: ContentScriptErrorClass;
}): { action: RecoveryAction; reason: string } {
  if (!input.urlSupported || input.errorClass === 'UNSUPPORTED_URL') {
    return { action: 'UNSUPPORTED', reason: 'Page scheme cannot host a content script.' };
  }
  if (input.injectAttempts >= MAX_INJECT_ATTEMPTS) {
    return {
      action: 'GIVE_UP',
      reason: 'Bounded content-script recovery exhausted. Refresh the page after reloading the extension.',
    };
  }
  if (input.errorClass === 'NO_RECEIVER' || input.errorClass === 'TAB_NAVIGATING' || input.errorClass === 'UNKNOWN') {
    return { action: 'INJECT', reason: 'No content-script receiver; attempting one programmatic injection.' };
  }
  if (input.errorClass === 'INJECTION_FAILED' || input.errorClass === 'TIMEOUT' || input.errorClass === 'VERSION_MISMATCH') {
    return {
      action: 'GIVE_UP',
      reason: 'Content script did not become ready after bounded recovery.',
    };
  }
  return { action: 'GIVE_UP', reason: 'Content script unavailable.' };
}

export function disconnectedLabel(errorClass: ContentScriptErrorClass): string {
  if (errorClass === 'VERSION_MISMATCH') {
    return 'STALE CONTENT SCRIPT — REFRESH PAGE';
  }
  if (errorClass === 'UNSUPPORTED_URL') {
    return 'RESTRICTED PAGE';
  }
  return 'CONTENT SCRIPT DISCONNECTED';
}

/** Guard against infinite inject loops in tests and runtime. */
export function wouldExceedInjectBound(injectAttempts: number): boolean {
  return injectAttempts >= MAX_INJECT_ATTEMPTS;
}
