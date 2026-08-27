import type {
  PrivacyClass,
  PrivacyDecision,
  PrivacyFinding,
  PrivacyPolicyDecision,
} from '@n-eye/protocol';

let tokenIndexCounter: Record<string, number> = {};

export function resetTokenCounters(): void {
  tokenIndexCounter = {};
}

export function generateTokenSymbol(privacyClass: PrivacyClass): string {
  const prefix =
    privacyClass === 'PII_EMAIL'
      ? 'EMAIL'
      : privacyClass === 'PII_PHONE'
      ? 'PHONE'
      : privacyClass === 'PII_NAME'
      ? 'NAME'
      : privacyClass === 'PII_ACCOUNT_ID'
      ? 'ACCOUNT'
      : 'SECRET';

  const count = (tokenIndexCounter[prefix] || 0) + 1;
  tokenIndexCounter[prefix] = count;
  return `[${prefix}_${count}]`;
}

/**
 * Privacy Policy Engine (Zone 3 - Local Sensitive Processing)
 * OWNS: Mapping PrivacyFinding instances to deterministic policy decisions (ALLOW, NEVER_SEND, TOKENIZE, MASK).
 * SPECIAL SECRETS INVARIANT: Passwords, OTPs, and API credentials ALWAYS map to NEVER_SEND.
 */
export function evaluatePrivacyPolicy(findings: PrivacyFinding[]): PrivacyDecision[] {
  const decisions: PrivacyDecision[] = [];

  for (const finding of findings) {
    let decision: PrivacyPolicyDecision = 'ALLOW';
    let tokenRole: string | undefined;
    let reason = '';

    switch (finding.privacyClass) {
      case 'SECRET_PASSWORD':
      case 'SECRET_OTP':
      case 'SECRET_API_KEY':
      case 'SECRET_AUTH_TOKEN':
      case 'SECRET_SESSION':
        decision = 'NEVER_SEND';
        reason = `High-risk authentication secret (${finding.privacyClass}) must never leave the local machine.`;
        break;

      case 'PII_EMAIL':
      case 'PII_PHONE':
      case 'PII_ACCOUNT_ID':
        decision = 'TOKENIZE';
        tokenRole = generateTokenSymbol(finding.privacyClass);
        reason = `Direct PII (${finding.privacyClass}) replaced with local scoped token role ${tokenRole}.`;
        break;

      case 'PII_NAME':
      case 'PII_ADDRESS':
        decision = 'MASK';
        reason = `Identity field (${finding.privacyClass}) minimized for privacy preservation.`;
        break;

      case 'SENSITIVE_UNKNOWN':
        decision = 'NEVER_SEND';
        reason = 'Unclassified sensitive text failed safe to NEVER_SEND.';
        break;

      case 'PUBLIC_UI':
      case 'CONTEXTUAL':
      default:
        decision = 'ALLOW';
        reason = 'Public interface element or non-sensitive control.';
        break;
    }

    decisions.push({
      findingId: finding.findingId,
      elementId: finding.elementId,
      privacyClass: finding.privacyClass,
      decision,
      tokenRole,
      reason,
    });
  }

  return decisions;
}
