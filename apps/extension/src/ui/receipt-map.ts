/**
 * Privacy Receipt product mapping.
 * OWNS: Compact receipt rows from a real PrivacyReceipt. No extra claims.
 */

import type { PrivacyReceipt } from '@n-eye/protocol';
import type { PrivacySummary } from './privacy-summary.js';
import { formatPayloadBytes, screenshotOutboundLabel } from './human-copy.js';

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
  protectedLines: string[];
  receivedLines: string[];
  technicalLines: Array<{ label: string; value: string }>;
}

export function mapReceiptView(
  receipt: PrivacyReceipt,
  summary: PrivacySummary | null
): ReceiptViewModel {
  const provider = receipt.plannerProvider
    ? `${receipt.plannerProvider}${receipt.plannerModel ? ` · ${receipt.plannerModel}` : ''}`
    : 'Not recorded';
  const title = receipt.protectionEvent === 'BLOCKED' ? 'Blocked' : 'Protected';
  const sensitiveCount = summary?.sensitiveCount ?? receipt.sensitiveClasses.length;
  const keptLocalCount = summary?.keptLocal.length ?? 0;
  const tokenizedCount = summary?.tokenized.length ?? 0;
  const screenshotBytes = receipt.rawScreenshotSent ? -1 : 0;
  const protectedContextBytes = receipt.safeContextBytes;

  const protectedLines: string[] = [];
  if (sensitiveCount > 0) {
    protectedLines.push(
      `Found ${sensitiveCount} piece${sensitiveCount === 1 ? '' : 's'} of personal information`
    );
  } else {
    protectedLines.push('No personal details were classified in this request');
  }
  if (tokenizedCount > 0) {
    protectedLines.push('Hid them before asking AI for help');
  }
  if (keptLocalCount > 0) {
    protectedLines.push('Secrets remained under local N-Eye control for this AI request');
  }
  protectedLines.push(screenshotOutboundLabel(screenshotBytes));

  const receivedLines = [
    'Only protected page information needed to reason about your request.',
    `Protected AI context: ${formatPayloadBytes(protectedContextBytes)}`,
  ];

  return {
    title,
    sensitiveCount,
    keptLocalCount,
    tokenizedCount,
    screenshotBytes,
    protectedContextBytes,
    providerLine: provider,
    verification: receipt.actionStatus || 'See evidence',
    humanSummary: receipt.humanSummary,
    protectedLines,
    receivedLines,
    technicalLines: [
      { label: 'Sensitive classes', value: String(sensitiveCount) },
      { label: 'Kept local (NEVER_SEND)', value: String(keptLocalCount) },
      { label: 'Tokenized', value: String(tokenizedCount) },
      { label: 'Screenshot outbound', value: screenshotBytes < 0 ? 'unknown' : `${screenshotBytes} B` },
      { label: 'SafeContext bytes', value: String(protectedContextBytes) },
      { label: 'Provider / model', value: provider },
      { label: 'Egress', value: receipt.egressResult },
    ],
  };
}
