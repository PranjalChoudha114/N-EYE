/**
 * T030 frozen Report-truth corpus.
 * OWNS: Ground-truth of what a Report may claim given ledger+state.
 * MUST NOT: Treat planner prose or UI color as facts.
 */

import { EvidenceLedger, type EvidenceEventType } from '../runtime/evidence-ledger.js';
import { buildVerifiedTaskReport, type TaskReportResult } from '../runtime/task-report.js';
import { createIdleState, type ProductState } from '../runtime/ui-snapshot.js';

export const T030_REPORT_TRUTH_VERSION = 't030-report-truth/1';

export type HighImpactKey = 'TASK_COMPLETED' | 'SCREENSHOT_NOT_SENT' | 'AUTHORIZED_CLICK' | 'PASSWORD_NEVER_SEND';

export interface ReportTruthCase {
  id: string;
  partition: 'development' | 'holdout';
  events: EvidenceEventType[];
  patch: (state: ProductState) => void;
  expectedResult: TaskReportResult;
  forbiddenSubstrings: string[];
  expectedClaimStatus: Partial<Record<string, 'FACT' | 'OBSERVED' | 'UNVERIFIED' | 'NOT APPLICABLE'>>;
  highImpactMustNotBeFact?: HighImpactKey[];
}

function typeThenComplete(state: ProductState): void {
  state.phase = 'COMPLETED';
  state.goal = 'Enter Jane in the name field';
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
}

export const T030_REPORT_TRUTH_CASES: ReportTruthCase[] = [
  {
    id: 'dev-verified-click',
    partition: 'development',
    events: [
      'TASK_RECEIVED',
      'ACTION_CHECKED',
      'ACTION_EXECUTED',
      'OUTCOME_VERIFIED',
      'PROTECTED_CONTEXT_CREATED',
    ],
    patch: (state) => {
      state.phase = 'COMPLETED';
      state.goal = 'Click Continue';
      state.action = {
        proposalText: 'Click Continue',
        targetLabel: 'Continue',
        proposalType: 'CLICK',
        risk: 'LOW',
        reasoning: 'click',
        validation: {
          targetCurrent: true,
          frameCurrent: true,
          pageCurrent: true,
          tokenScopeValid: true,
          riskPolicy: 'LOW',
        },
      };
      state.evidence.verificationResult = 'VERIFIED_SUCCESS';
    },
    expectedResult: 'VERIFIED COMPLETE',
    forbiddenSubstrings: ['CANARY_PASSWORD', 'hunter2'],
    expectedClaimStatus: { completed: 'FACT', clicked: 'FACT' },
  },
  {
    id: 'dev-type-is-not-click',
    partition: 'development',
    events: ['TASK_RECEIVED', 'ACTION_EXECUTED', 'OUTCOME_VERIFIED'],
    patch: typeThenComplete,
    expectedResult: 'VERIFIED COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { clicked: 'NOT APPLICABLE', completed: 'FACT' },
    highImpactMustNotBeFact: ['AUTHORIZED_CLICK'],
  },
  {
    id: 'dev-planner-complete-lie',
    partition: 'development',
    events: ['TASK_RECEIVED', 'ACTION_PROPOSED'],
    patch: (state) => {
      state.phase = 'COMPLETED';
      state.evidence.verificationResult = '—';
    },
    expectedResult: 'COULD NOT COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { completed: 'NOT APPLICABLE' },
    highImpactMustNotBeFact: ['TASK_COMPLETED'],
  },
  {
    id: 'dev-screenshot-requires-egress',
    partition: 'development',
    events: ['TASK_RECEIVED', 'REMOTE_INTELLIGENCE_USED'],
    patch: (state) => {
      state.phase = 'GATEWAY_UNREACHABLE';
      state.plannerMode = 'REMOTE';
      state.evidence.screenshotOutBytes = 0;
      state.evidence.egressAudit = 'NOT_ATTEMPTED';
    },
    expectedResult: 'COULD NOT COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { screenshot: 'UNVERIFIED' },
    highImpactMustNotBeFact: ['SCREENSHOT_NOT_SENT'],
  },
  {
    id: 'hold-click-observed-not-complete',
    partition: 'holdout',
    events: ['TASK_RECEIVED', 'ACTION_CHECKED', 'ACTION_EXECUTED'],
    patch: (state) => {
      state.phase = 'ASK_USER';
      state.askUser = {
        reason: 'PARTIAL_GOAL',
        headline: 'I need your help',
        message: 'The form was not submitted. This is not task completion.',
        hint: 'Rewrite',
        continueLabel: 'Continue',
        dismissLabel: 'Cancel',
        technicalDetail: 'form was not submitted',
      };
      state.action = {
        proposalText: 'Click Submit',
        targetLabel: 'Submit',
        proposalType: 'CLICK',
        risk: 'HIGH',
        reasoning: 'submit',
        validation: {
          targetCurrent: true,
          frameCurrent: true,
          pageCurrent: true,
          tokenScopeValid: true,
          riskPolicy: 'HIGH',
        },
      };
    },
    expectedResult: 'PARTIALLY COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { clicked: 'OBSERVED', completed: 'NOT APPLICABLE' },
    highImpactMustNotBeFact: ['TASK_COMPLETED'],
  },
  {
    id: 'hold-password-without-protect-event',
    partition: 'holdout',
    events: ['TASK_RECEIVED'],
    patch: (state) => {
      state.phase = 'ASK_USER';
      state.privacySummary = {
        sensitiveCount: 1,
        keptLocal: ['Password'],
        tokenized: [],
        screenshotBytes: 0,
        protectedContextBytes: 0,
      };
    },
    expectedResult: 'COULD NOT COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { 'password-local': 'UNVERIFIED' },
    highImpactMustNotBeFact: ['PASSWORD_NEVER_SEND'],
  },
  {
    id: 'hold-ocr-without-event',
    partition: 'holdout',
    events: ['TASK_RECEIVED'],
    patch: (state) => {
      state.phase = 'ASK_USER';
      state.evidence.ocrInvoked = true;
    },
    expectedResult: 'COULD NOT COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { ocr: 'NOT APPLICABLE' },
  },
  {
    id: 'hold-confirmation-cancelled',
    partition: 'holdout',
    events: ['TASK_RECEIVED', 'CONFIRMATION_REQUIRED'],
    patch: (state) => {
      state.phase = 'BLOCKED';
      state.message = 'Confirmation was required and was not granted.';
    },
    expectedResult: 'STOPPED FOR SAFETY',
    forbiddenSubstrings: [],
    expectedClaimStatus: { clicked: 'NOT APPLICABLE', completed: 'NOT APPLICABLE' },
    highImpactMustNotBeFact: ['AUTHORIZED_CLICK', 'TASK_COMPLETED'],
  },
  {
    id: 'hold-wait-success-not-task',
    partition: 'holdout',
    events: ['TASK_RECEIVED', 'ACTION_EXECUTED', 'PARTIAL_OUTCOME'],
    patch: (state) => {
      state.phase = 'ASK_USER';
      state.askUser = {
        reason: 'SEARCH_SUBMIT_MISSING',
        headline: 'I need your help',
        message: 'The text may be entered, but I found no unique search button to click.',
        hint: 'Rewrite',
        continueLabel: 'Continue',
        dismissLabel: 'Cancel',
        technicalDetail: 'no unique search button',
      };
      state.action = {
        proposalText: 'Wait',
        targetLabel: '—',
        proposalType: 'WAIT',
        risk: 'LOW',
        reasoning: 'settle',
        verificationDelta: 'Bounded settle wait completed.',
        validation: {
          targetCurrent: null,
          frameCurrent: null,
          pageCurrent: null,
          tokenScopeValid: null,
          riskPolicy: null,
        },
      };
    },
    expectedResult: 'PARTIALLY COMPLETE',
    forbiddenSubstrings: [],
    expectedClaimStatus: { completed: 'NOT APPLICABLE', clicked: 'NOT APPLICABLE' },
    highImpactMustNotBeFact: ['TASK_COMPLETED', 'AUTHORIZED_CLICK'],
  },
  {
    id: 'hold-remote-screenshot-proven',
    partition: 'holdout',
    events: [
      'TASK_RECEIVED',
      'DATA_PROTECTED',
      'PROTECTED_CONTEXT_CREATED',
      'REMOTE_INTELLIGENCE_USED',
      'ACTION_CHECKED',
      'ACTION_EXECUTED',
      'OUTCOME_VERIFIED',
    ],
    patch: (state) => {
      state.phase = 'COMPLETED';
      state.plannerMode = 'REMOTE';
      state.evidence.screenshotOutBytes = 0;
      state.evidence.egressAudit = 'PASS';
      state.evidence.verificationResult = 'VERIFIED_SUCCESS';
      state.action = {
        proposalText: 'Click Continue',
        targetLabel: 'Continue',
        proposalType: 'CLICK',
        risk: 'LOW',
        reasoning: 'click',
        validation: {
          targetCurrent: true,
          frameCurrent: true,
          pageCurrent: true,
          tokenScopeValid: true,
          riskPolicy: 'LOW',
        },
      };
      state.privacySummary = {
        sensitiveCount: 1,
        keptLocal: ['Password'],
        tokenized: [{ label: 'Email', token: '[EMAIL_1]' }],
        screenshotBytes: 0,
        protectedContextBytes: 400,
      };
    },
    expectedResult: 'VERIFIED COMPLETE',
    forbiddenSubstrings: ['agent.lab@example.com', 'CANARY_PASSWORD'],
    expectedClaimStatus: { screenshot: 'FACT', completed: 'FACT' },
  },
];

export interface ReportTruthScore {
  version: string;
  n: number;
  developmentN: number;
  holdoutN: number;
  resultMatches: number;
  claimMatches: number;
  unsupportedHighImpact: number;
  secretLeaks: number;
  contradictionReports: number;
  factualClaimPrecision: number;
  importantFactCoverage: number;
  failures: string[];
}

export function scoreReportTruth(cases: ReportTruthCase[] = T030_REPORT_TRUTH_CASES): ReportTruthScore {
  let resultMatches = 0;
  let claimChecks = 0;
  let claimMatches = 0;
  let unsupportedHighImpact = 0;
  let secretLeaks = 0;
  let contradictionReports = 0;
  let provenClaims = 0;
  let provenSupported = 0;
  let importantPresent = 0;
  let importantCovered = 0;
  const failures: string[] = [];

  for (const item of cases) {
    const ledger = new EvidenceLedger();
    ledger.begin(item.id);
    for (const type of item.events) {
      ledger.record(type, 'SYSTEM LIFECYCLE', type);
    }
    const state = createIdleState();
    item.patch(state);
    const report = buildVerifiedTaskReport({ state, ledger, taskId: item.id, buildId: 'T030' });
    if (report.result === item.expectedResult) resultMatches += 1;
    else failures.push(`${item.id}: result ${report.result} != ${item.expectedResult}`);

    for (const [claimId, expected] of Object.entries(item.expectedClaimStatus)) {
      claimChecks += 1;
      const actual = report.claims.find((c) => c.id === claimId)?.status;
      if (actual === expected) claimMatches += 1;
      else failures.push(`${item.id}: claim ${claimId} ${actual} != ${expected}`);
    }

    for (const key of item.highImpactMustNotBeFact || []) {
      const claim = report.claims.find((c) => c.statementKey === key);
      if (claim?.status === 'FACT' || claim?.evidenceStatus === 'PROVEN') {
        unsupportedHighImpact += 1;
        failures.push(`${item.id}: high-impact ${key} was FACT`);
      }
    }

    const blob = JSON.stringify(report);
    for (const secret of item.forbiddenSubstrings) {
      if (secret && blob.includes(secret)) {
        secretLeaks += 1;
        failures.push(`${item.id}: leaked ${secret}`);
      }
    }

    contradictionReports += report.audit.contradictions.length;
    unsupportedHighImpact += report.audit.unsupportedHighImpact;

    for (const claim of report.claims) {
      if (claim.evidenceStatus === 'PROVEN') {
        provenClaims += 1;
        const ok = claim.requiredEvents.every((t) => ledger.has(t));
        if (ok) provenSupported += 1;
      }
      if (
        claim.statementKey === 'TASK_COMPLETED' ||
        claim.statementKey === 'SCREENSHOT_NOT_SENT' ||
        claim.statementKey === 'AUTHORIZED_CLICK' ||
        claim.statementKey === 'PASSWORD_NEVER_SEND'
      ) {
        importantPresent += 1;
        if (claim.evidenceStatus !== 'NOT_VERIFIED') importantCovered += 1;
      }
    }
  }

  return {
    version: T030_REPORT_TRUTH_VERSION,
    n: cases.length,
    developmentN: cases.filter((c) => c.partition === 'development').length,
    holdoutN: cases.filter((c) => c.partition === 'holdout').length,
    resultMatches,
    claimMatches: claimChecks === 0 ? 0 : claimMatches,
    unsupportedHighImpact,
    secretLeaks,
    contradictionReports,
    factualClaimPrecision: provenClaims === 0 ? 1 : provenSupported / provenClaims,
    importantFactCoverage: importantPresent === 0 ? 1 : importantCovered / importantPresent,
    failures,
  };
}
