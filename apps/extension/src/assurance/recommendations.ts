import type { PrivacyFinding, PerceptionResult } from '@n-eye/protocol';

/**
 * Advisory recommendations only. They never bypass local authority.
 */
export function buildAdvisoryRecommendations(
  findings: PrivacyFinding[],
  perception?: PerceptionResult
): string[] {
  const notes: string[] = [];
  if (findings.some((f) => f.privacyClass === 'SECRET_OTP')) {
    notes.push('An OTP field was detected. N-Eye will not expose OTP values to remote reasoning.');
  }
  if (findings.some((f) => f.privacyClass === 'SECRET_PASSWORD')) {
    notes.push('A password field was detected. Its value is not sent to the AI planner.');
  }
  if (perception?.fallback === 'GROUNDING_AMBIGUOUS' || perception?.fallback === 'OCR_LOW_CONFIDENCE') {
    notes.push('Visual context is ambiguous. Select the intended control manually.');
  }
  if (perception?.invoked && perception.ocrBlocks.length > 0) {
    notes.push('Visual text was read locally and then passed through the same privacy engine as DOM text.');
  }
  return notes.slice(0, 3);
}
