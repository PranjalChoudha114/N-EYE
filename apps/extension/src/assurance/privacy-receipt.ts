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
    return 'Looking at this page on your device. No AI request has been sent.';
  }
  if (event === 'BLOCKED') {
    return 'N-Eye blocked an unsafe AI request. Forbidden personal or secret data was found before sending.';
  }
  const parts: string[] = ['N-Eye found private information on this page before asking AI for help.'];
  const tok = unique(tokenized);
  const nev = unique(neverSend);
  if (tok.length > 0) {
    parts.push(`${tok.join(' and ')} ${tok.length === 1 ? 'was' : 'were'} hidden from the AI.`);
  }
  if (nev.includes('Password')) {
    parts.push('Your password was not included in the AI request.');
  } else if (nev.length > 0) {
    parts.push(`${nev.join(' and ')} ${nev.length === 1 ? 'was' : 'were'} not sent to the AI.`);
  }
  if (ocrInvoked) {
    parts.push('Visible text in this region was read on this device.');
  }
  return parts.join(' ');
}
