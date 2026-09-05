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

export type TaskReportResult =
  | 'VERIFIED COMPLETE'
  | 'PARTIALLY COMPLETE'
  | 'COULD NOT COMPLETE'
  | 'STOPPED FOR SAFETY'
  | 'CANCELLED'
  | 'SYSTEM ERROR';

export type ClaimStatus = 'FACT' | 'UNVERIFIED' | 'UNKNOWN' | 'NOT OBSERVED' | 'NOT APPLICABLE';

export interface ReportClaim {
  id: string;
  text: string;
  requiredEvents: EvidenceEventType[];
  status: ClaimStatus;
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
  generatedAt: number;
}

function has(ledger: EvidenceLedger, type: EvidenceEventType): boolean {
  return ledger.has(type);
}

function claim(
  id: string,
  text: string,
  required: EvidenceEventType[],
  ledger: EvidenceLedger,
  extras?: { inapplicable?: boolean; unknown?: boolean; fact?: boolean }
): ReportClaim {
  if (extras?.inapplicable) {
    return { id, text, requiredEvents: required, status: 'NOT APPLICABLE' };
  }
  if (extras?.unknown) {
    return { id, text, requiredEvents: required, status: 'UNKNOWN' };
  }
  if (extras?.fact) {
    return { id, text, requiredEvents: required, status: 'FACT' };
  }
  if (required.length === 0) {
    return { id, text, requiredEvents: required, status: 'UNVERIFIED' };
  }
  const ok = required.every((t) => ledger.has(t));
  return { id, text, requiredEvents: required, status: ok ? 'FACT' : 'UNVERIFIED' };
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
  const remoteUsed = has(ledger, 'REMOTE_INTELLIGENCE_USED') || state.plannerMode === 'REMOTE';
  const ocrUsed = has(ledger, 'OCR_USED');
  const visualUsed = has(ledger, 'VISUAL_ANALYSIS_USED');
  const executed = has(ledger, 'ACTION_EXECUTED');
  const verified = has(ledger, 'OUTCOME_VERIFIED');
  const missingTarget = has(ledger, 'TARGET_NOT_FOUND');
  const screenshotZero = state.evidence.screenshotOutBytes === 0;
  const egressPass = state.evidence.egressAudit === 'PASS';

  const claims: ReportClaim[] = [
    claim('ocr', 'N-Eye used OCR.', ['OCR_USED'], ledger, { inapplicable: !ocrUsed }),
    claim('screenshot', 'No screenshot was sent.', ['PROTECTED_CONTEXT_CREATED'], ledger, {
      inapplicable: !remoteUsed,
    }),
    claim('completed', 'The task completed.', ['OUTCOME_VERIFIED'], ledger, {
      inapplicable: result !== 'VERIFIED COMPLETE',
    }),
    claim('clicked', 'N-Eye performed an authorized click.', ['ACTION_EXECUTED'], ledger, {
      inapplicable: !executed,
    }),
    claim('password-local', 'Password class findings were kept local (NEVER_SEND).', ['DATA_PROTECTED'], ledger, {
      inapplicable: !state.privacySummary?.keptLocal.some((n) => /password/i.test(n)),
    }),
  ];

  const shot = claims.find((c) => c.id === 'screenshot');
  if (shot && !remoteUsed) {
    shot.status = 'NOT APPLICABLE';
  } else if (shot && remoteUsed && screenshotZero && egressPass) {
    shot.status = 'FACT';
    shot.text = 'No screenshot was sent.';
  } else if (shot && remoteUsed) {
    shot.status = 'UNVERIFIED';
  }

  if (ocrUsed) {
    const ocr = claims.find((c) => c.id === 'ocr');
    if (ocr) {
      ocr.status = 'FACT';
      ocr.text = 'N-Eye read visible text locally (OCR).';
    }
  }

  if (result === 'VERIFIED COMPLETE' && (verified || state.evidence.verificationResult === 'ALREADY_SATISFIED')) {
    const done = claims.find((c) => c.id === 'completed');
    if (done) done.status = 'FACT';
  } else {
    const done = claims.find((c) => c.id === 'completed');
    if (done) {
      done.status = 'NOT APPLICABLE';
      done.text = 'The task completed.';
    }
  }

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
      privacyLines.push(
        valueCount > 0
          ? `PROTECTED / NOT SENT: ${state.privacySummary.keptLocal.join(', ')} stayed on this device (NEVER_SEND).`
          : `PROTECTED / NOT SENT: ${state.privacySummary.keptLocal.join(', ')} — sensitive control(s) classified; no private value was present to send.`
      );
    }
    if (state.privacySummary.tokenized.length > 0) {
      const names = state.privacySummary.tokenized.map((t) => t.label).join(', ');
      privacyLines.push(`PROTECTED: ${names} replaced with local references before reasoning.`);
      privacyLines.push(
        remoteUsed
          ? `SENT: only those protected references, not the original values.`
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
  if (shotClaim?.status === 'FACT') {
    privacyLines.push('No screenshot was sent.');
  } else if (!remoteUsed) {
    privacyLines.push('Screenshot outbound: not applicable (no remote request).');
  } else {
    privacyLines.push('Screenshot outbound: not proven as a report fact.');
  }

  const proposedType = state.action?.proposalType;
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

  const whatDid =
    result === 'VERIFIED COMPLETE' && executed
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

  return {
    taskId,
    result,
    human,
    technical,
    claims: claims.map((c) => {
      if (c.status !== 'FACT') return c;
      if (c.id === 'screenshot' && remoteUsed && screenshotZero && egressPass) return c;
      if (c.id === 'completed' && state.evidence.verificationResult === 'ALREADY_SATISFIED') return c;
      if (c.requiredEvents.length > 0 && !c.requiredEvents.every((t) => ledger.has(t))) {
        return { ...c, status: 'UNVERIFIED' };
      }
      return c;
    }),
    generatedAt: Date.now(),
  };
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
