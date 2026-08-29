import type {
  PerceptionSource,
  PrivacyDecision,
  PrivacyFinding,
  PrivacyReceipt,
  ProtectionEventKind,
} from '@n-eye/protocol';
import { humanClassName } from './protection-state.js';

export interface ReceiptInput {
  hostname: string;
  protectionEvent: ProtectionEventKind;
  perceptionSource: PerceptionSource | 'NONE';
  findings: PrivacyFinding[];
  decisions: PrivacyDecision[];
  rawScreenshotSent?: boolean;
  safeCropSent?: boolean;
  safeContextBytes: number;
  plannerProvider?: string;
  plannerModel?: string;
  egressResult: PrivacyReceipt['egressResult'];
  requestId?: string;
  latencyMs?: number;
  actionStatus?: string;
  ocrInvoked?: boolean;
  roiCount?: number;
  ocrBlockCount?: number;
  escalationReasons?: string;
}

const SECRET_CLASSES = new Set([
  'SECRET_PASSWORD',
  'SECRET_OTP',
  'SECRET_API_KEY',
  'SECRET_AUTH_TOKEN',
  'SECRET_SESSION',
]);

/**
 * Privacy Receipt (Zone 2/3 evidence).
 * OWNS: Human summary + technical evidence for an actual protection event.
 * MUST NEVER: Display raw password, OTP, vault realValue, API key, full sensitive URL, or raw OCR secrets.
 */
export function buildPrivacyReceipt(input: ReceiptInput): PrivacyReceipt {
  const classes = [...new Set(input.findings.map((f) => f.privacyClass))];
  const transformations = input.decisions.map((d) => ({
    privacyClass: d.privacyClass,
    action: d.decision,
  }));

  const tokenized = input.decisions.filter((d) => d.decision === 'TOKENIZE').map((d) => humanClassName(d.privacyClass));
  const neverSend = input.decisions
    .filter((d) => d.decision === 'NEVER_SEND')
    .map((d) => humanClassName(d.privacyClass));

  return {
    receiptId: `rcpt_${input.requestId || Date.now()}`,
    timestamp: Date.now(),
    hostname: input.hostname,
    protectionEvent: input.protectionEvent,
    perceptionSource: input.perceptionSource,
    sensitiveClasses: classes,
    transformations,
    rawScreenshotSent: input.rawScreenshotSent === true,
    safeCropSent: input.safeCropSent === true,
    safeContextBytes: input.safeContextBytes,
    plannerProvider: input.plannerProvider,
    plannerModel: input.plannerModel,
    egressResult: input.egressResult,
    requestId: input.requestId,
    latencyMs: input.latencyMs,
    actionStatus: input.actionStatus,
    humanSummary: humanSummary(input.protectionEvent, tokenized, neverSend, input.ocrInvoked === true),
    technicalEvidence: {
      perceptionSource: input.perceptionSource,
      ocrInvoked: input.ocrInvoked === true,
      roiCount: input.roiCount || 0,
      ocrBlockCount: input.ocrBlockCount || 0,
      escalationReasons: input.escalationReasons || '',
      rawScreenshotSent: input.rawScreenshotSent === true,
      safeCropSent: input.safeCropSent === true,
      egressResult: input.egressResult,
      secretClassesExcluded: neverSend.join(', '),
    },
  };
}

export function receiptContainsForbiddenSecret(receipt: PrivacyReceipt, secrets: string[]): boolean {
  const blob = JSON.stringify(receipt);
  return secrets.some((secret) => secret.length > 3 && blob.includes(secret));
}

export function findingsHaveOcrSecrets(findings: PrivacyFinding[]): boolean {
  return findings.some((f) => f.source === 'ocr' && SECRET_CLASSES.has(f.privacyClass));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function humanSummary(
  event: ProtectionEventKind,
  tokenized: string[],
  neverSend: string[],
  ocrInvoked: boolean
): string {
  if (event === 'LOCAL_ONLY') {
    return 'N-Eye active. Page observed locally. No N-Eye AI request occurred.';
  }
  if (event === 'BLOCKED') {
    return 'N-Eye blocked an unsafe AI request. Forbidden sensitive data was detected before network.';
  }
  const parts: string[] = ['N-Eye detected private information locally before this AI request.'];
  const tok = unique(tokenized);
  const nev = unique(neverSend);
  if (tok.includes('Email')) {
    parts.push('Your email was represented by a private token.');
  }
  if (nev.includes('Password')) {
    parts.push('Your password was not included in the AI request.');
  } else if (nev.length > 0) {
    parts.push(`${nev.join(' and ')} was not sent to the AI planner.`);
  }
  if (ocrInvoked) {
    parts.push('Visual text in this region was processed locally.');
  }
  return parts.join(' ');
}
