/**
 * Verified Task Report (Zone 3).
 *
 * OWNS: Constructing a user-facing report from the evidence ledger + local product state.
 * TRUST: Planner/page text cannot author facts. Missing evidence → UNVERIFIED / UNKNOWN / NOT OBSERVED.
 * MUST NEVER: Display raw secrets, vault mappings, or hidden chain-of-thought.
 */

import type { EvidenceEvent, EvidenceEventType, EvidenceLedger } from './evidence-ledger.js';
import type { ProductState } from './ui-snapshot.js';
import { classifyAskUser } from '../ui/ask-user.js';
import { isPlaceholderLabel } from '../ui/human-copy.js';
import { statusFromEvidence, validateClaims, type ReportAudit } from './report-claim-validator.js';

export type TaskReportResult =
  | 'VERIFIED COMPLETE'
  | 'PARTIALLY COMPLETE'
  | 'COULD NOT COMPLETE'
  | 'STOPPED FOR SAFETY'
  | 'CANCELLED'
  | 'SYSTEM ERROR';

export type ClaimEvidenceStatus = 'PROVEN' | 'OBSERVED' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';

export type ClaimStatus = 'FACT' | 'OBSERVED' | 'UNVERIFIED' | 'UNKNOWN' | 'NOT OBSERVED' | 'NOT APPLICABLE';

export interface ReportClaim {
  id: string;
  claimId: string;
  claimType: 'PERCEPTION' | 'PRIVACY' | 'EGRESS' | 'ACTION' | 'OUTCOME';
  statementKey: string;
  text: string;
  requiredEvents: EvidenceEventType[];
  evidenceIds: string[];
  evidenceStatus: ClaimEvidenceStatus;
  status: ClaimStatus;
  taskId: string;
  stepId?: string;
}

export interface TaskReportHuman {
  whatYouAsked: string;
  whatUnderstood: string;
  whatLookedAt: string;
  privacy: string;
  howDecided: string;
  whatDid: string;
  whatHappened: string;
  result: TaskReportResult;
  why: string;
  time: string;
}

export interface TaskReportTechnical {
  taskId: string;
  buildId: string;
  origin: string;
  taskInterpretation: string;
  observationMethod: string;
  ocrUsed: string;
  visualAnalysisUsed: string;
  privacyFindingCount: number;
  protectedContextBytes: number;
  reasoningMode: string;
  actionProposal: string;
  targetEvidence: string;
  risk: string;
  confirmation: string;
  executionResult: string;
  verification: string;
  failureReason: string;
  stageTimings: string;
  networkPayloadBytes: number;
  screenshotOutboundBytes: number;
  recoveryPath: string;
  events: EvidenceEvent[];
}

export interface VerifiedTaskReport {
  taskId: string;
  result: TaskReportResult;
  human: TaskReportHuman;
  technical: TaskReportTechnical;
  claims: ReportClaim[];
  audit: ReportAudit;
  generatedAt: number;
}

function has(ledger: EvidenceLedger, type: EvidenceEventType): boolean {
  return ledger.has(type);
}

function makeClaim(args: {
  id: string;
  claimType: ReportClaim['claimType'];
  statementKey: string;
  text: string;
  required: EvidenceEventType[];
  ledger: EvidenceLedger;
  taskId: string;
  evidenceStatus: ClaimEvidenceStatus;
}): ReportClaim {
  return {
    id: args.id,
    claimId: args.id,
    claimType: args.claimType,
    statementKey: args.statementKey,
    text: args.text,
    requiredEvents: args.required,
    evidenceIds: args.ledger.idsOf(args.required),
    evidenceStatus: args.evidenceStatus,
    status: statusFromEvidence(args.evidenceStatus),
    taskId: args.taskId,
  };
}

export function classifyTaskReportResult(state: ProductState, ledger: EvidenceLedger): TaskReportResult {
  if (state.phase === 'CANCELLED') return 'CANCELLED';
  if (state.phase === 'BLOCKED') return 'STOPPED FOR SAFETY';
  if (state.phase === 'ERROR' || state.phase === 'OCR_UNAVAILABLE') return 'SYSTEM ERROR';
  if (
    state.phase === 'RATE_LIMITED' ||
    state.phase === 'GATEWAY_UNREACHABLE' ||
    state.phase === 'PROVIDER_UNAVAILABLE'
  ) {
    return 'COULD NOT COMPLETE';
  }
  if (state.phase === 'COMPLETED') {
    if (has(ledger, 'OUTCOME_VERIFIED') || state.evidence.verificationResult === 'ALREADY_SATISFIED') {
      return 'VERIFIED COMPLETE';
    }
    return 'COULD NOT COMPLETE';
  }
  if (state.phase === 'ASK_USER') {
    const reason = state.askUser?.reason;
    if (reason === 'PARTIAL_GOAL' || reason === 'SEARCH_SUBMIT_MISSING' || has(ledger, 'PARTIAL_OUTCOME')) {
      return 'PARTIALLY COMPLETE';
    }
    if (reason === 'ENGINE_FAILURE') return 'SYSTEM ERROR';
    return 'COULD NOT COMPLETE';
  }
  return 'COULD NOT COMPLETE';
}

function parseMs(label: string): number | null {
  const match = label.trim().match(/^([\d.]+)\s*ms$/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function formatSeconds(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms.toFixed(0)} ms`;
}

export function buildVerifiedTaskReport(args: {
  state: ProductState;
  ledger: EvidenceLedger;
  taskId: string;
  buildId?: string;
}): VerifiedTaskReport {
  const { state, ledger, taskId } = args;
  const result = classifyTaskReportResult(state, ledger);
  const remoteUsed = has(ledger, 'REMOTE_INTELLIGENCE_USED');
  const ocrUsed = has(ledger, 'OCR_USED');
  const visualUsed = has(ledger, 'VISUAL_ANALYSIS_USED');
  const executed = has(ledger, 'ACTION_EXECUTED');
  const checked = has(ledger, 'ACTION_CHECKED');
  const verified = has(ledger, 'OUTCOME_VERIFIED');
  const protectedCtx = has(ledger, 'PROTECTED_CONTEXT_CREATED');
  const dataProtected = has(ledger, 'DATA_PROTECTED');
  const missingTarget = has(ledger, 'TARGET_NOT_FOUND');
  const screenshotZero = state.evidence.screenshotOutBytes === 0;
  const egressPass = state.evidence.egressAudit === 'PASS';
  const proposedType = state.action?.proposalType;
  const isClick = proposedType === 'CLICK';
  const passwordKept = Boolean(state.privacySummary?.keptLocal.some((n) => /password/i.test(n)));
  const emailTokenized = Boolean(state.privacySummary?.tokenized.some((t) => /email/i.test(t.label)));

  const screenshotStatus: ClaimEvidenceStatus = !remoteUsed
    ? 'NOT_APPLICABLE'
    : remoteUsed && protectedCtx && screenshotZero && egressPass
      ? 'PROVEN'
      : 'NOT_VERIFIED';

  const clickStatus: ClaimEvidenceStatus = !isClick
    ? 'NOT_APPLICABLE'
    : checked && executed && verified && result === 'VERIFIED COMPLETE'
      ? 'PROVEN'
      : executed
        ? 'OBSERVED'
        : 'NOT_APPLICABLE';

  const completedStatus: ClaimEvidenceStatus =
    result === 'VERIFIED COMPLETE' && verified ? 'PROVEN' : 'NOT_APPLICABLE';

  const claims: ReportClaim[] = [
    makeClaim({
      id: 'ocr',
      claimType: 'PERCEPTION',
      statementKey: 'OCR_USED',
      text: ocrUsed ? 'N-Eye read visible text locally (OCR).' : 'N-Eye used OCR.',
      required: ['OCR_USED'],
      ledger,
      taskId,
      evidenceStatus: ocrUsed ? 'PROVEN' : 'NOT_APPLICABLE',
    }),
    makeClaim({
      id: 'screenshot',
      claimType: 'EGRESS',
      statementKey: 'SCREENSHOT_NOT_SENT',
      text: 'No screenshot was sent.',
      required: ['PROTECTED_CONTEXT_CREATED', 'REMOTE_INTELLIGENCE_USED'],
      ledger,
      taskId,
      evidenceStatus: screenshotStatus,
    }),
    makeClaim({
      id: 'completed',
      claimType: 'OUTCOME',
      statementKey: 'TASK_COMPLETED',
      text: 'The task completed.',
      required: ['OUTCOME_VERIFIED'],
      ledger,
      taskId,
      evidenceStatus: completedStatus,
    }),
    makeClaim({
      id: 'clicked',
      claimType: 'ACTION',
      statementKey: 'AUTHORIZED_CLICK',
      text:
        clickStatus === 'OBSERVED'
          ? 'N-Eye dispatched an authorized click. The requested task was not verified complete.'
          : 'N-Eye performed an authorized click.',
      required: clickStatus === 'PROVEN' ? ['ACTION_CHECKED', 'ACTION_EXECUTED', 'OUTCOME_VERIFIED'] : ['ACTION_EXECUTED'],
      ledger,
      taskId,
      evidenceStatus: clickStatus,
    }),
    makeClaim({
      id: 'password-local',
      claimType: 'PRIVACY',
      statementKey: 'PASSWORD_NEVER_SEND',
      text: 'Password class findings were kept local (NEVER_SEND).',
      required: ['DATA_PROTECTED'],
      ledger,
      taskId,
      evidenceStatus: passwordKept && dataProtected ? 'PROVEN' : passwordKept ? 'NOT_VERIFIED' : 'NOT_APPLICABLE',
    }),
    makeClaim({
      id: 'email-protected',
      claimType: 'PRIVACY',
      statementKey: 'EMAIL_PROTECTED',
      text: 'Email was protected before reasoning.',
      required: ['PRIVACY_DETECTED', 'DATA_PROTECTED', 'PROTECTED_CONTEXT_CREATED'],
      ledger,
      taskId,
      evidenceStatus: emailTokenized
        ? has(ledger, 'PRIVACY_DETECTED') && dataProtected && protectedCtx
          ? 'PROVEN'
          : 'NOT_VERIFIED'
        : 'NOT_APPLICABLE',
    }),
  ];

  const understood =
    state.askUser?.reason === 'UNKNOWN_GOAL'
      ? 'N-Eye could not safely interpret the next step.'
      : `N-Eye treated this as a local ${state.plannerMode === 'REMOTE' ? 'protected-remote' : 'on-device'} task.`;

  const lookedAt = ocrUsed
    ? 'N-Eye inspected the visible page structure and read pixels locally where structure was not enough.'
    : 'N-Eye inspected the visible controls on this page.';

  const privacyLines: string[] = [];
  if (state.privacySummary) {
    const valueCount = state.privacySummary.sensitiveCount;
    const controlCount = state.privacySummary.sensitiveControlCount ?? 0;
    if (valueCount > 0) {
      privacyLines.push(`DETECTED: ${valueCount} private value(s) locally.`);
    } else if (controlCount > 0) {
      privacyLines.push(
        `DETECTED: ${controlCount} sensitive control(s) with no private value present (empty).`
      );
    } else {
      privacyLines.push('DETECTED: no private information was classified on this step.');
    }
    if (state.privacySummary.keptLocal.length > 0) {
      const passwordClaim = claims.find((c) => c.id === 'password-local');
      const neverSendOk = passwordClaim?.evidenceStatus === 'PROVEN' || dataProtected;
      privacyLines.push(
        valueCount > 0 && neverSendOk
          ? `PROTECTED / NOT SENT: ${state.privacySummary.keptLocal.join(', ')} stayed on this device (NEVER_SEND).`
          : `PROTECTED / NOT SENT: ${state.privacySummary.keptLocal.join(', ')} — sensitive control(s) classified; no private value was present to send.`
      );
    }
    if (state.privacySummary.tokenized.length > 0) {
      const names = state.privacySummary.tokenized.map((t) => t.label).join(', ');
      const emailClaim = claims.find((c) => c.id === 'email-protected');
      if (emailClaim?.evidenceStatus === 'PROVEN') {
        privacyLines.push('Email was protected before reasoning.');
      }
      privacyLines.push(`PROTECTED: ${names} replaced with local references before reasoning.`);
      privacyLines.push(
        remoteUsed && protectedCtx
          ? `SENT: only those protected references, not the original values.`
          : remoteUsed
            ? 'SENT: not verified — protected-context evidence is incomplete.'
            : `NOT SENT: Remote AI was not used, so protected references did not leave this device.`
      );
    }
  } else {
    privacyLines.push('DETECTED: no privacy transformation was recorded for this task.');
  }
  if (remoteUsed) {
    privacyLines.push('Remote AI was used on a protected context.');
  } else {
    privacyLines.push('Remote AI was not used for this task. NOT SENT: no planner payload.');
  }
  const shotClaim = claims.find((c) => c.id === 'screenshot');
  if (shotClaim?.evidenceStatus === 'PROVEN') {
    privacyLines.push('No screenshot was sent.');
  } else if (!remoteUsed) {
    privacyLines.push('Screenshot outbound: not applicable (no remote request).');
  } else {
    privacyLines.push('Screenshot outbound: not proven as a report fact.');
  }

  const proposedLabel = state.action?.targetLabel;
  let howDecided: string;
  if (missingTarget) {
    howDecided = 'N-Eye looked for one unique matching control and did not find it.';
  } else if (state.askUser?.reason === 'AMBIGUOUS_TARGET' || state.askUser?.reason === 'MULTIPLE_CANDIDATES') {
    howDecided =
      state.askUser.message ||
      'N-Eye found more than one control that could match. It stopped without changing the page.';
  } else if (!proposedType) {
    howDecided = 'N-Eye did not propose a page action.';
  } else if (proposedType === 'ASK_USER') {
    howDecided =
      state.askUser?.message ||
      'N-Eye stopped because it could not prove a unique next action.';
  } else if (isPlaceholderLabel(proposedLabel)) {
    howDecided = `N-Eye proposed ${proposedType.toLowerCase().replace(/_/g, ' ')}.`;
  } else {
    howDecided = `N-Eye proposed ${proposedType.toLowerCase().replace(/_/g, ' ')} on “${proposedLabel}”.`;
  }

  const clickClaim = claims.find((c) => c.id === 'clicked');
  const whatDid =
    clickClaim?.evidenceStatus === 'PROVEN'
      ? `Authorized action: ${state.action?.proposalText || 'click'}.`
      : clickClaim?.evidenceStatus === 'OBSERVED'
        ? 'An authorized click was dispatched. That is not the requested task succeeding.'
        : result === 'VERIFIED COMPLETE' && executed
          ? `Authorized action: ${state.action?.proposalText || state.action?.proposalType || 'recorded execution'}.`
          : executed && result !== 'VERIFIED COMPLETE'
            ? `A local system step ran (${state.action?.proposalType || 'recorded'}). That is not the requested task succeeding.`
            : 'No browser action was performed.';

  const rawHappened =
    state.action?.verificationDelta ||
    state.evidence.verificationResult ||
    (missingTarget ? 'No unique matching target was found.' : 'No fresh outcome was recorded.');
  const lastLooksLikeSuccess =
    rawHappened === 'VERIFIED_SUCCESS' || /bounded settle wait completed/i.test(rawHappened);
  const whatHappened =
    result === 'VERIFIED COMPLETE'
      ? rawHappened
      : lastLooksLikeSuccess
        ? 'A local system step succeeded (clarification delivered, or a settle wait finished). The requested task did not complete.'
        : rawHappened;

  const why =
    result === 'VERIFIED COMPLETE'
      ? 'Fresh local evidence satisfied the success condition.'
      : result === 'PARTIALLY COMPLETE'
        ? state.askUser?.message || 'Some requested steps were verified; others were not.'
        : result === 'STOPPED FOR SAFETY'
          ? state.message || 'N-Eye refused this action.'
          : result === 'CANCELLED'
            ? 'The task was stopped.'
            : result === 'SYSTEM ERROR'
              ? state.askUser?.message || ENGINE_SAFE
              : state.askUser?.message ||
                (missingTarget
                  ? "N-Eye could not uniquely identify the requested control and stopped rather than guessing."
                  : state.message);

  const see = parseMs(state.latency.see);
  const perceive = parseMs(state.latency.perceive);
  const protect = parseMs(state.latency.protect);
  const plan = parseMs(state.latency.plan);
  const validate = parseMs(state.latency.validate);
  const act = parseMs(state.latency.act);
  const verify = parseMs(state.latency.verify);
  const systemParts = [see, perceive, protect, plan, validate, act, verify].filter((n): n is number => n != null);
  const systemTotal = systemParts.reduce((a, b) => a + b, 0);
  const approval = state.latency.approvalWait && state.latency.approvalWait !== '—' ? state.latency.approvalWait : null;
  const timeLines = [
    `Page understanding     ${state.latency.see}`,
    `Privacy protection      ${state.latency.protect}`,
    `AI reasoning           ${state.latency.plan}`,
    `Safety checks           ${state.latency.validate}`,
    `Browser action          ${state.latency.act}`,
    `Verification           ${state.latency.verify}`,
    `Total system processing: ${systemTotal > 0 ? formatSeconds(systemTotal) : state.latency.total}`,
  ];
  if (approval) timeLines.push(`Waiting for your approval: ${approval}`);

  const human: TaskReportHuman = {
    whatYouAsked: state.goal || '—',
    whatUnderstood: understood,
    whatLookedAt: lookedAt,
    privacy: privacyLines.join(' '),
    howDecided,
    whatDid,
    whatHappened,
    result,
    why,
    time: timeLines.join('\n'),
  };

  const askReason = state.askUser ? classifyAskUser(state.askUser.technicalDetail) : '';
  const technical: TaskReportTechnical = {
    taskId,
    buildId: args.buildId || '—',
    origin: state.origin || state.siteHostname || '—',
    taskInterpretation: `${state.plannerMode} · ${state.evidence.reasoningProvenance}`,
    observationMethod: state.evidence.perceptionSource,
    ocrUsed: ocrUsed ? 'YES' : 'NO',
    visualAnalysisUsed: visualUsed ? 'YES' : 'NO',
    privacyFindingCount: state.evidence.findingsCount,
    protectedContextBytes: state.evidence.payloadBytes,
    reasoningMode: state.evidence.reasoningProvenance || state.plannerMode,
    actionProposal: state.action?.proposalType || '—',
    targetEvidence: state.action?.targetId || '—',
    risk: state.action?.risk || '—',
    confirmation: state.action?.confirmationRequired ? 'Required' : 'Not required',
    executionResult: state.evidence.executionResult,
    verification: state.evidence.verificationResult,
    failureReason: askReason || state.action?.securityReason || state.evidence.securityReason || '—',
    stageTimings: `SEE ${state.latency.see} · PERCEIVE ${state.latency.perceive} · PROTECT ${state.latency.protect} · PLAN ${state.latency.plan} · VALIDATE ${state.latency.validate} · ACT ${state.latency.act} · VERIFY ${state.latency.verify} · TOTAL ${state.latency.total}`,
    networkPayloadBytes: state.evidence.payloadBytes,
    screenshotOutboundBytes: state.evidence.screenshotOutBytes,
    recoveryPath: state.evidence.recoveryPath,
    events: ledger.list(),
  };

  const draft: VerifiedTaskReport = {
    taskId,
    result,
    human,
    technical,
    claims,
    audit: { contradictions: [], unsupportedHighImpact: 0, downgraded: [] },
    generatedAt: Date.now(),
  };
  const audited = validateClaims(draft.claims, ledger, result, JSON.stringify(draft.human));
  return { ...draft, claims: audited.claims, audit: audited.audit };
}

const ENGINE_SAFE = 'Something went wrong while checking this page. N-Eye stopped without changing anything.';

export function reportContainsSecret(report: VerifiedTaskReport, canary: string): boolean {
  if (!canary) return false;
  const blob = JSON.stringify(report);
  return blob.includes(canary);
}

export function humanResultLabel(result: TaskReportResult): string {
  return result;
}
