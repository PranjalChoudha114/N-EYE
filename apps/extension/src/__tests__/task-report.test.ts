/**
 * Evidence-backed Task Report. Facts require ledger events, never model or UI color.
 */
import { describe, expect, it } from 'vitest';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { EvidenceLedger } from '../runtime/evidence-ledger.js';
import { buildVerifiedTaskReport, classifyTaskReportResult } from '../runtime/task-report.js';
import { paintTaskReport } from '../ui/task-report-view.js';
import { mountProductShell } from '../ui/shell.js';
import { bindProductUi } from '../ui/render.js';

function ledgerWith(events: Array<Parameters<EvidenceLedger['record']>[0]>): EvidenceLedger {
  const ledger = new EvidenceLedger();
  ledger.begin('task-report-1');
  for (const type of events) {
    ledger.record(type, 'SYSTEM LIFECYCLE', type);
  }
  return ledger;
}

describe('Verified Task Report', () => {
  it('successful task is VERIFIED COMPLETE only with OUTCOME_VERIFIED', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.goal = 'Click Continue';
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    state.evidence.screenshotOutBytes = 0;
    state.evidence.executionResult = 'OK';
    const ledger = ledgerWith(['TASK_RECEIVED', 'ACTION_EXECUTED', 'OUTCOME_VERIFIED', 'PROTECTED_CONTEXT_CREATED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1', buildId: 'DEV • test' });
    expect(report.result).toBe('VERIFIED COMPLETE');
    expect(report.claims.find((c) => c.id === 'completed')?.status).toBe('FACT');
    expect(report.human.whatYouAsked).toBe('Click Continue');
  });

  it('partial search does not claim completed', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.goal = 'Search for CodeWithHarry and open the latest C tutorial';
    state.askUser = {
      reason: 'SEARCH_SUBMIT_MISSING',
      headline: 'I need your help',
      message: 'The text may be entered, but I found no unique search button to click.',
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: 'no unique search button',
    };
    const ledger = ledgerWith(['TASK_RECEIVED', 'ACTION_EXECUTED', 'PARTIAL_OUTCOME']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.result).toBe('PARTIALLY COMPLETE');
    expect(report.claims.find((c) => c.id === 'completed')?.status).not.toBe('FACT');
  });

  it('failed target report says no click and TARGET_NOT_FOUND', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.askUser = {
      reason: 'TARGET_NOT_FOUND',
      headline: 'I need your help',
      message: "I couldn't find one safe, unique control that matches your request, so I stopped without clicking anything.",
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: 'TARGET_NOT_FOUND',
    };
    const ledger = ledgerWith(['TASK_RECEIVED', 'TARGET_NOT_FOUND']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.result).toBe('COULD NOT COMPLETE');
    expect(report.human.whatDid.toLowerCase()).toMatch(/no browser action/);
    expect(report.technical.failureReason).toBe('TARGET_NOT_FOUND');
  });

  it('does not claim OCR or screenshot facts without evidence', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    const ledger = ledgerWith(['TASK_RECEIVED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.claims.find((c) => c.id === 'ocr')?.status).not.toBe('FACT');
    const shot = report.claims.find((c) => c.id === 'screenshot');
    expect(shot?.status === 'FACT').toBe(false);
  });

  it('does not store canary secrets in the ledger or report', () => {
    const ledger = new EvidenceLedger();
    ledger.begin('task-canary');
    ledger.record('UNTRUSTED_INPUT', 'USER INTENT', 'password CANARY_PASSWORD_T027');
    expect(ledger.containsSecret('CANARY_PASSWORD_T027')).toBe(false);
    const state = createIdleState();
    state.phase = 'CANCELLED';
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-canary' });
    expect(JSON.stringify(report)).not.toContain('CANARY_PASSWORD_T027');
  });

  it('View Report is available after a terminal snapshot', () => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = {
      runtime: { getURL: (p: string) => `/${p}`, getManifest: () => ({ version_name: 'DEV • test' }) },
    };
    const els = mountProductShell(document);
    const ui = bindProductUi(els);
    const state = createIdleState();
    state.running = false;
    state.phase = 'ASK_USER';
    const ledger = ledgerWith(['TASK_RECEIVED', 'TARGET_NOT_FOUND']);
    state.taskReport = buildVerifiedTaskReport({ state, ledger, taskId: 'task-ui' });
    ui.update(state, { role: 'owner', themePref: 'dark' });
    expect(els.extra.classList.contains('hidden')).toBe(false);
    expect(els.extra.textContent).toBe('View Report');
    paintTaskReport(els.reportView, state.taskReport);
    expect(els.reportView.textContent).toMatch(/COULD NOT COMPLETE/);
    expect(classifyTaskReportResult(state, ledger)).toBe('COULD NOT COMPLETE');
  });

  it('planner COMPLETE / green phase is not VERIFIED COMPLETE without OUTCOME_VERIFIED', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.evidence.verificationResult = '—';
    const ledger = ledgerWith(['TASK_RECEIVED', 'ACTION_PROPOSED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.result).toBe('COULD NOT COMPLETE');
    expect(report.claims.find((c) => c.id === 'completed')?.status).not.toBe('FACT');
  });

  it('ASK_USER without partial evidence is COULD NOT COMPLETE', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.askUser = {
      reason: 'UNKNOWN_GOAL',
      headline: 'I need your help',
      message: 'N-Eye could not safely interpret the next step.',
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: 'UNKNOWN_GOAL',
    };
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('COULD NOT COMPLETE');
  });

  it('high-risk confirmation without execution does not claim a click', () => {
    const state = createIdleState();
    state.phase = 'BLOCKED';
    state.message = 'Confirmation was required and was not granted.';
    const ledger = ledgerWith(['TASK_RECEIVED', 'CONFIRMATION_REQUIRED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.result).toBe('STOPPED FOR SAFETY');
    expect(report.claims.find((c) => c.id === 'clicked')?.status).not.toBe('FACT');
    expect(report.human.whatDid.toLowerCase()).toMatch(/no browser action/);
  });

  it('cancel is CANCELLED and does not claim completion', () => {
    const state = createIdleState();
    state.phase = 'CANCELLED';
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'TASK_CANCELLED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('CANCELLED');
    expect(report.claims.find((c) => c.id === 'completed')?.status).not.toBe('FACT');
  });

  it('remote gateway failure is COULD NOT COMPLETE', () => {
    const state = createIdleState();
    state.phase = 'GATEWAY_UNREACHABLE';
    state.plannerMode = 'REMOTE';
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'REMOTE_INTELLIGENCE_USED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('COULD NOT COMPLETE');
    expect(report.claims.find((c) => c.id === 'screenshot')?.status).not.toBe('FACT');
  });

  it('OCR failure is SYSTEM ERROR and does not claim OCR ran', () => {
    const state = createIdleState();
    state.phase = 'OCR_UNAVAILABLE';
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('SYSTEM ERROR');
    expect(report.claims.find((c) => c.id === 'ocr')?.status).not.toBe('FACT');
  });

  it('visual-only OCR claim is FACT only with OCR_USED', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.evidence.ocrInvoked = true;
    const ledger = ledgerWith(['TASK_RECEIVED', 'OCR_USED', 'ACTION_EXECUTED', 'OUTCOME_VERIFIED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.result).toBe('VERIFIED COMPLETE');
    expect(report.claims.find((c) => c.id === 'ocr')?.status).toBe('FACT');
    expect(report.human.whatLookedAt.toLowerCase()).toMatch(/pixel/);
  });

  it('ocrInvoked without OCR_USED is not an OCR fact', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.evidence.ocrInvoked = true;
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED']),
      taskId: 'task-report-1',
    });
    expect(report.claims.find((c) => c.id === 'ocr')?.status).not.toBe('FACT');
  });

  it('privacy-protected password claim requires DATA_PROTECTED and keptLocal', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.privacySummary = {
      sensitiveCount: 1,
      keptLocal: ['Password'],
      tokenized: [],
      screenshotBytes: 0,
      protectedContextBytes: 0,
    };
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'DATA_PROTECTED']),
      taskId: 'task-report-1',
    });
    expect(report.claims.find((c) => c.id === 'password-local')?.status).toBe('FACT');
    expect(report.human.privacy.toLowerCase()).toMatch(/password/);
    expect(report.human.privacy).toMatch(/NOT SENT/);
    expect(report.human.privacy).toMatch(/DETECTED/);
  });

  it('Remote screenshot FACT accepts PASS prefix and never names a raw secret', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.plannerMode = 'REMOTE';
    state.evidence.screenshotOutBytes = 0;
    state.evidence.egressResult = 'PASS (0 Secrets Detected)';
    state.evidence.egressAudit = 'PASS';
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    state.privacySummary = {
      sensitiveCount: 2,
      keptLocal: ['Password'],
      tokenized: [{ label: 'Email', token: '[EMAIL_1]' }],
      screenshotBytes: 0,
      protectedContextBytes: 512,
    };
    const ledger = ledgerWith([
      'TASK_RECEIVED',
      'DATA_PROTECTED',
      'PROTECTED_CONTEXT_CREATED',
      'REMOTE_INTELLIGENCE_USED',
      'ACTION_EXECUTED',
      'OUTCOME_VERIFIED',
    ]);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.claims.find((c) => c.id === 'screenshot')?.status).toBe('FACT');
    expect(report.human.privacy).toMatch(/SENT: only those protected references/);
    expect(report.human.privacy).toMatch(/NOT SENT/);
    expect(report.audit.unsupportedHighImpact).toBe(0);
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(JSON.stringify(report)).not.toContain('agent.lab@example.com');
  });

  it('policy-like page text is not a report fact', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.goal = 'Click Continue';
    const ledger = new EvidenceLedger();
    ledger.begin('task-report-1');
    ledger.record('TASK_RECEIVED', 'USER INTENT', 'goal-len=15');
    ledger.record('UNTRUSTED_INPUT', 'PAGE OBSERVATION', 'policy-like page text treated as data only', {
      provenance: 'UNTRUSTED_PAGE',
    });
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.claims.every((c) => !/ignore n-eye|already approved|skip confirmation/i.test(c.text))).toBe(true);
    expect(JSON.stringify(report.human)).not.toMatch(/SYSTEM:/);
  });

  it('engine exception ASK_USER is SYSTEM ERROR', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.askUser = {
      reason: 'ENGINE_FAILURE',
      headline: 'Could not finish',
      message: 'Something went wrong while checking this page. N-Eye stopped without changing anything.',
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: "Cannot read properties of undefined (reading 'targetCurrent')",
    };
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'TASK_FAILED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('SYSTEM ERROR');
    expect(JSON.stringify(report.human)).not.toMatch(/targetCurrent/);
  });

  it('stale-target block does not claim verified complete', () => {
    const state = createIdleState();
    state.phase = 'BLOCKED';
    state.evidence.securityReason = 'STALE_TARGET';
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'ACTION_CHECKED']),
      taskId: 'task-report-1',
    });
    expect(report.result).toBe('STOPPED FOR SAFETY');
    expect(report.claims.find((c) => c.id === 'completed')?.status).not.toBe('FACT');
  });

  it('does not treat a formatted PASSED string as typed egress PASS', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.plannerMode = 'REMOTE';
    state.evidence.screenshotOutBytes = 0;
    state.evidence.egressResult = 'PASSED SECRET SCAN';
    state.evidence.egressAudit = 'NOT_ATTEMPTED';
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'PROTECTED_CONTEXT_CREATED', 'REMOTE_INTELLIGENCE_USED', 'OUTCOME_VERIFIED']),
      taskId: 'task-report-1',
    });
    expect(report.claims.find((c) => c.id === 'screenshot')?.status).not.toBe('FACT');
  });

  it('does not print placeholder dash as a proposed target', () => {
    const state = createIdleState();
    state.phase = 'ASK_USER';
    state.action = {
      proposalText: 'Ask user',
      targetLabel: '—',
      risk: 'LOW',
      reasoning: 'ambiguous',
      proposalType: 'ASK_USER',
      validation: {
        targetCurrent: null,
        frameCurrent: null,
        pageCurrent: null,
        tokenScopeValid: null,
        riskPolicy: null,
      },
    };
    state.askUser = {
      reason: 'AMBIGUOUS_TARGET',
      headline: 'I need your help',
      message:
        'N-Eye found more than one control that could match. Because it could not prove which one you intended, it stopped without changing the page.',
      hint: 'Rewrite',
      continueLabel: 'Continue',
      dismissLabel: 'Cancel',
      technicalDetail: 'ambiguous',
    };
    const report = buildVerifiedTaskReport({
      state,
      ledger: ledgerWith(['TASK_RECEIVED', 'TARGET_NOT_FOUND']),
      taskId: 'task-report-1',
    });
    expect(report.human.howDecided).not.toMatch(/on [“"]—[”"]/);
    expect(report.human.howDecided).not.toMatch(/ask user on/i);
  });

  it('TYPE execution is not an authorized-click fact', () => {
    const state = createIdleState();
    state.phase = 'COMPLETED';
    state.action = {
      proposalText: 'Type text',
      targetLabel: 'Name',
      proposalType: 'TYPE_TEXT',
      risk: 'LOW',
      reasoning: 'type',
      validation: {
        targetCurrent: true,
        frameCurrent: true,
        pageCurrent: true,
        tokenScopeValid: true,
        riskPolicy: 'LOW',
      },
    };
    state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    const ledger = ledgerWith(['TASK_RECEIVED', 'ACTION_EXECUTED', 'OUTCOME_VERIFIED']);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: 'task-report-1' });
    expect(report.claims.find((c) => c.id === 'clicked')?.status).toBe('NOT APPLICABLE');
    expect(report.claims.find((c) => c.id === 'completed')?.status).toBe('FACT');
  });
});
