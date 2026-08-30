import type { ProtectionState } from '@n-eye/protocol';

export interface ProtectionStateView {
  state: ProtectionState;
  headline: string;
  detail: string;
}

/**
 * Truthful product states (Zone 2).
 * MUST NOT: Equate "N-Eye on" with "the website is safe", or claim PROTECTED without an egress event.
 */
export function localMonitoringState(sensitiveClasses: string[]): ProtectionStateView {
  const classes = uniqueClasses(sensitiveClasses);
  const detail =
    classes.length > 0
      ? `Personal information found locally: ${classes.join(', ')}. No AI request was sent.`
      : 'Looking at this page on your device. No AI request has been sent.';
  return {
    state: 'LOCAL_MONITORING',
    headline: 'N-Eye active',
    detail,
  };
}

export function protectingState(): ProtectionStateView {
  return {
    state: 'PROTECTING',
    headline: 'Protecting your information',
    detail: 'Personal information is being handled on this device.',
  };
}

export function remoteReasoningState(): ProtectionStateView {
  return {
    state: 'REMOTE_REASONING',
    headline: 'Asking AI for the next step',
    detail: 'Only protected page information is being sent to the AI.',
  };
}

export function protectedState(sensitiveCount: number): ProtectionStateView {
  return {
    state: 'PROTECTED',
    headline: 'Protected AI request',
    detail:
      sensitiveCount > 0
        ? `N-Eye protected ${sensitiveCount} personal detail${sensitiveCount === 1 ? '' : 's'} before asking AI for help.`
        : 'N-Eye protected this AI request. The privacy check passed.',
  };
}

export function blockedState(): ProtectionStateView {
  return {
    state: 'BLOCKED',
    headline: 'Request blocked',
    detail: 'N-Eye blocked an unsafe AI request. Forbidden personal or secret data was found before sending.',
  };
}

export function unsupportedState(reason: string): ProtectionStateView {
  return {
    state: 'UNSUPPORTED',
    headline: 'Protection unavailable',
    detail: reason,
  };
}

export function disconnectedObservationState(): ProtectionStateView {
  return {
    state: 'DEGRADED',
    headline: 'Observation unavailable',
    detail: 'N-Eye is not connected to this page. No AI request was sent.',
  };
}

export function humanClassName(privacyClass: string): string {
  if (privacyClass.includes('EMAIL')) return 'Email';
  if (privacyClass.includes('PHONE')) return 'Phone';
  if (privacyClass.includes('PASSWORD')) return 'Password';
  if (privacyClass.includes('OTP')) return 'One-time code';
  if (privacyClass.includes('API')) return 'API key';
  if (privacyClass.includes('SESSION') || privacyClass.includes('AUTH')) return 'Sign-in token';
  if (privacyClass.includes('NAME')) return 'Name';
  if (privacyClass.includes('ADDRESS')) return 'Address';
  if (privacyClass.includes('ACCOUNT')) return 'Account ID';
  return 'Personal information';
}

function uniqueClasses(privacyClasses: string[]): string[] {
  const names = privacyClasses.map(humanClassName);
  return [...new Set(names)];
}
