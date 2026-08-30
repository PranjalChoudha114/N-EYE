import type { RiskLevel, VerificationResult } from '@n-eye/protocol';

/**
 * Replay policy for verified outcomes (Zone 3).
 *
 * WHY: A HIGH action that may already have run must not be replayed because
 *      verification is FAILURE or AMBIGUOUS. Planner HTTP retries are a
 *      different class and never authorize a second Submit/Delete/Send.
 */
export function shouldStopAfterUnverifiedHighRisk(
  approvedRiskLevel: RiskLevel,
  status: VerificationResult['status']
): boolean {
  return approvedRiskLevel === 'HIGH' && status !== 'VERIFIED_SUCCESS';
}
