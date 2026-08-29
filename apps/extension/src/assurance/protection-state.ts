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
      ? `Sensitive fields detected locally: ${classes.join(', ')}. No N-Eye AI request occurred.`
      : 'Page observed locally. No N-Eye AI request occurred.';
  return {
    state: 'LOCAL_MONITORING',
    headline: 'N-Eye active',
    detail,
  };
}

export function protectingState(): ProtectionStateView {
  return {
    state: 'PROTECTING',
    headline: 'Protecting',
    detail: 'Sensitive context is being processed locally.',
  };
}

export function remoteReasoningState(): ProtectionStateView {
  return {
    state: 'REMOTE_REASONING',
    headline: 'Remote reasoning',
    detail: 'Only approved SafeContext is being processed by the configured planner.',
  };
}

export function protectedState(sensitiveCount: number): ProtectionStateView {
  return {
    state: 'PROTECTED',
    headline: 'Protected AI request',
    detail:
      sensitiveCount > 0
        ? `N-Eye protected an AI request. ${sensitiveCount} sensitive value(s) handled locally.`
        : 'N-Eye protected an AI request. SafeContext passed local egress policy.',
  };
}

export function blockedState(): ProtectionStateView {
  return {
    state: 'BLOCKED',
    headline: 'Request blocked',
    detail: 'N-Eye blocked an unsafe AI request. Forbidden sensitive data was detected before network.',
  };
}

export function unsupportedState(reason: string): ProtectionStateView {
  return {
    state: 'UNSUPPORTED',
    headline: 'Protection unavailable',
    detail: reason,
  };
}

export function humanClassName(privacyClass: string): string {
  if (privacyClass.includes('EMAIL')) return 'Email';
  if (privacyClass.includes('PHONE')) return 'Phone';
  if (privacyClass.includes('PASSWORD')) return 'Password';
  if (privacyClass.includes('OTP')) return 'OTP';
  if (privacyClass.includes('API')) return 'API key';
  if (privacyClass.includes('SESSION') || privacyClass.includes('AUTH')) return 'Session token';
  return 'Sensitive data';
}

function uniqueClasses(privacyClasses: string[]): string[] {
  const names = privacyClasses.map(humanClassName);
  return [...new Set(names)];
}
