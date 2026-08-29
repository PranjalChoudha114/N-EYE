import type { PrivacyDecision, PrivacyFinding } from '@n-eye/protocol';

/**
 * Token value selection (Zone 3)
 * OWNS: Choosing the real value bound into PrivateTokenVault.
 * PRIVACY: Never invent demo identities. A field type (email/tel) is not a value.
 * MUST NOT: Fall back to hardcoded emails/phones when the finding has no text span.
 */
export function selectVaultRealValue(finding: PrivacyFinding | undefined): string | null {
  const span = finding?.textSpan?.trim();
  return span && span.length > 0 ? span : null;
}

/**
 * Pair TOKENIZE decisions with the finding that produced them.
 * WHY: Field-type detections (input type=email) must not create vault bindings without a real value.
 */
export function tokenizeDecisionsWithValues(
  decisions: PrivacyDecision[],
  findings: PrivacyFinding[]
): Array<{ decision: PrivacyDecision; realValue: string }> {
  const byId = new Map(findings.map((f) => [f.findingId, f]));
  const pairs: Array<{ decision: PrivacyDecision; realValue: string }> = [];

  for (const decision of decisions) {
    if (decision.decision !== 'TOKENIZE' || !decision.tokenRole) continue;
    const realValue = selectVaultRealValue(byId.get(decision.findingId));
    if (!realValue) continue;
    pairs.push({ decision, realValue });
  }

  return pairs;
}
