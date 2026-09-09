/**
 * Report claim validator (Zone 3).
 *
 * OWNS: Refusing FACT/PROVEN claims that the ledger does not support, and
 *       catching result-vs-prose contradictions before paint.
 * TRUST: Planner/page text cannot author facts. Missing evidence → NOT_VERIFIED.
 * MUST NEVER: Invent events, keep raw secrets, or let UI color upgrade a claim.
 */

import type { EvidenceEventType, EvidenceLedger } from './evidence-ledger.js';
import type { ClaimEvidenceStatus, ClaimStatus, ReportClaim, TaskReportResult } from './task-report.js';

export const HIGH_IMPACT_STATEMENT_KEYS = [
  'TASK_COMPLETED',
  'SCREENSHOT_NOT_SENT',
  'AUTHORIZED_CLICK',
  'PASSWORD_NEVER_SEND',
] as const;

export interface ReportAudit {
  contradictions: string[];
  unsupportedHighImpact: number;
  downgraded: string[];
}

export function statusFromEvidence(evidenceStatus: ClaimEvidenceStatus): ClaimStatus {
  switch (evidenceStatus) {
    case 'PROVEN':
      return 'FACT';
    case 'OBSERVED':
      return 'OBSERVED';
    case 'NOT_VERIFIED':
      return 'UNVERIFIED';
    case 'NOT_APPLICABLE':
      return 'NOT APPLICABLE';
    default:
      return 'UNVERIFIED';
  }
}

export function validateClaims(
  claims: ReportClaim[],
  ledger: EvidenceLedger,
  result: TaskReportResult,
  humanBlob: string
): { claims: ReportClaim[]; audit: ReportAudit } {
  const downgraded: string[] = [];
  const next = claims.map((claim) => {
    if (claim.evidenceStatus === 'NOT_APPLICABLE' || claim.evidenceStatus === 'NOT_VERIFIED') {
      return { ...claim, status: statusFromEvidence(claim.evidenceStatus) };
    }
    if (claim.evidenceStatus === 'PROVEN' || claim.status === 'FACT') {
      const missing = claim.requiredEvents.filter((t) => !ledger.has(t));
      if (missing.length > 0) {
        downgraded.push(claim.claimId);
        return {
          ...claim,
          evidenceStatus: 'NOT_VERIFIED' as const,
          status: 'UNVERIFIED' as const,
        };
      }
    }
    return { ...claim, status: statusFromEvidence(claim.evidenceStatus) };
  });

  const contradictions: string[] = [];
  const completed = next.find((c) => c.statementKey === 'TASK_COMPLETED');
  if (result === 'VERIFIED COMPLETE' && /could not complete/i.test(humanBlob)) {
    contradictions.push('VERIFIED COMPLETE result with COULD NOT COMPLETE prose');
  }
  if (completed?.evidenceStatus === 'PROVEN' && result !== 'VERIFIED COMPLETE') {
    contradictions.push('TASK_COMPLETED proven while result is not VERIFIED COMPLETE');
    const idx = next.findIndex((c) => c.claimId === completed.claimId);
    if (idx >= 0) {
      next[idx] = {
        ...completed,
        evidenceStatus: 'NOT_APPLICABLE',
        status: 'NOT APPLICABLE',
      };
      downgraded.push(completed.claimId);
    }
  }
  if (result !== 'VERIFIED COMPLETE' && /the task completed\./i.test(humanBlob) && completed?.evidenceStatus === 'PROVEN') {
    contradictions.push('Completion sentence without VERIFIED COMPLETE result');
  }

  const unsupportedHighImpact = next.filter(
    (c) =>
      (HIGH_IMPACT_STATEMENT_KEYS as readonly string[]).includes(c.statementKey) &&
      (c.evidenceStatus === 'PROVEN' || c.status === 'FACT') &&
      c.requiredEvents.some((t: EvidenceEventType) => !ledger.has(t))
  ).length;

  return {
    claims: next,
    audit: { contradictions, unsupportedHighImpact, downgraded },
  };
}
