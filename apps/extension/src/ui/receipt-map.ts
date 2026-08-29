/**
 * Privacy Receipt product mapping.
 * OWNS: Compact receipt rows from a real PrivacyReceipt. No extra claims.
 */

import type { PrivacyReceipt } from '@n-eye/protocol';
import type { PrivacySummary } from './privacy-summary.js';

export interface ReceiptViewModel {
  title: string;
  sensitiveCount: number;
  keptLocalCount: number;
  tokenizedCount: number;
  screenshotBytes: number;
  protectedContextBytes: number;
  providerLine: string;
  verification: string;
  humanSummary: string;
}

export function mapReceiptView(
  receipt: PrivacyReceipt,
  summary: PrivacySummary | null
): ReceiptViewModel {
  const provider = receipt.plannerProvider
    ? `${receipt.plannerProvider}${receipt.plannerModel ? ` · ${receipt.plannerModel}` : ''}`
    : 'Not recorded';
  const title = receipt.protectionEvent === 'BLOCKED' ? 'Blocked' : 'Protected';
  return {
    title,
    sensitiveCount: summary?.sensitiveCount ?? receipt.sensitiveClasses.length,
    keptLocalCount: summary?.keptLocal.length ?? 0,
    tokenizedCount: summary?.tokenized.length ?? 0,
    screenshotBytes: receipt.rawScreenshotSent ? -1 : 0,
    protectedContextBytes: receipt.safeContextBytes,
    providerLine: provider,
    verification: receipt.actionStatus || 'See evidence',
    humanSummary: receipt.humanSummary,
  };
}
