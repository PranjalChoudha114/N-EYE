/**
 * Task Report presentation (Zone 2).
 * OWNS: Turning a verified report into DOM. Never invents facts.
 */

import type { VerifiedTaskReport } from '../runtime/task-report.js';

function section(title: string, body: string, extraClass?: string): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = extraClass ? `n-report-section ${extraClass}` : 'n-report-section';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  wrap.append(h, p);
  return wrap;
}

export function paintTaskReport(host: HTMLElement, report: VerifiedTaskReport | null | undefined): void {
  host.replaceChildren();
  if (!report) {
    const empty = document.createElement('p');
    empty.className = 'n-caption';
    empty.textContent = 'No task report yet. Run a task, then open View Report.';
    host.append(empty);
    return;
  }
  const result = document.createElement('p');
  result.className = 'n-report-result';
  result.textContent = report.human.result;
  host.append(result);
  host.append(section('What you asked', report.human.whatYouAsked));
  host.append(section('What N-Eye understood', report.human.whatUnderstood));
  host.append(section('What N-Eye looked at', report.human.whatLookedAt));
  host.append(section('Privacy', report.human.privacy));
  host.append(section('How N-Eye decided', report.human.howDecided));
  host.append(section('What N-Eye did', report.human.whatDid));
  host.append(section('What actually happened', report.human.whatHappened));
  host.append(section('Result', report.human.result));
  host.append(section('Why', report.human.why));
  host.append(section('Time', report.human.time, 'n-report-time'));

  const tech = document.createElement('details');
  tech.className = 'n-accordion';
  const summary = document.createElement('summary');
  summary.textContent = 'View technical details';
  const body = document.createElement('div');
  const t = report.technical;
  const rows: Array<[string, string]> = [
    ['Task ID', t.taskId],
    ['Build ID', t.buildId],
    ['Site', t.origin],
    ['Interpretation', t.taskInterpretation],
    ['Observation', t.observationMethod],
    ['OCR used', t.ocrUsed],
    ['Visual analysis used', t.visualAnalysisUsed],
    ['Privacy findings', String(t.privacyFindingCount)],
    ['Protected context bytes', String(t.protectedContextBytes)],
    ['Reasoning mode', t.reasoningMode],
    ['Action proposal', t.actionProposal],
    ['Target evidence', t.targetEvidence],
    ['Risk', t.risk],
    ['Confirmation', t.confirmation],
    ['Execution', t.executionResult],
    ['Verification', t.verification],
    ['Failure reason', t.failureReason],
    ['Stage timings', t.stageTimings],
    ['Network payload bytes', String(t.networkPayloadBytes)],
    ['Screenshot outbound bytes', String(t.screenshotOutboundBytes)],
    ['Recovery path', t.recoveryPath],
  ];
  for (const [k, v] of rows) {
    const row = document.createElement('div');
    row.className = 'n-row';
    const key = document.createElement('span');
    key.className = 'n-row-k';
    key.textContent = k;
    const val = document.createElement('span');
    val.className = 'n-row-v';
    val.textContent = v;
    row.append(key, val);
    body.append(row);
  }
  const claimsHead = document.createElement('p');
  claimsHead.className = 'n-caption';
  claimsHead.textContent = 'Claim audit (facts require local evidence)';
  body.append(claimsHead);
  for (const claim of report.claims) {
    const row = document.createElement('div');
    row.className = 'n-row';
    const key = document.createElement('span');
    key.className = 'n-row-k';
    key.textContent = claim.status;
    const val = document.createElement('span');
    val.className = 'n-row-v';
    val.textContent = claim.text;
    row.append(key, val);
    body.append(row);
  }
  tech.append(summary, body);
  host.append(tech);
}
