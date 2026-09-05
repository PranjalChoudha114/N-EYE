/**
 * Formal PII / sanitization / NEVER_SEND bench (evaluation only).
 * Ground truth is the labeled corpus. Predictions come from detectors + policy + SafeContext.
 */

import { createHash } from 'node:crypto';
import {
  createElementId,
  createPageEpoch,
  createTaskId,
  type InputType,
  type PrivacyClass,
  type PrivacyPolicyDecision,
  type RawElement,
  type RawScene,
} from '@n-eye/protocol';
import { detectElementPrivacy, detectGoalPrivacy, detectOcrTextPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { precisionRecallF1 } from './metrics.js';
import { PII_DATASET_VERSION, PII_SAMPLES, type PiiSample } from './pii-corpus.js';

const AUTH_CLASSES = new Set<string>([
  'SECRET_PASSWORD',
  'SECRET_OTP',
  'SECRET_API_KEY',
  'SECRET_AUTH_TOKEN',
  'SECRET_SESSION',
]);

const EXPECTED_POLICY: Record<string, PrivacyPolicyDecision> = {
  SECRET_PASSWORD: 'NEVER_SEND',
  SECRET_OTP: 'NEVER_SEND',
  SECRET_API_KEY: 'NEVER_SEND',
  SECRET_AUTH_TOKEN: 'NEVER_SEND',
  SECRET_SESSION: 'NEVER_SEND',
  PII_EMAIL: 'TOKENIZE',
  PII_PHONE: 'TOKENIZE',
  PII_NAME: 'MASK',
  PII_ADDRESS: 'MASK',
  PII_ACCOUNT_ID: 'TOKENIZE',
};

function elementFrom(sample: PiiSample, index: number): RawElement {
  return {
    id: createElementId(`bench_${index}`),
    tagName: sample.inputType ? 'input' : 'div',
    role: sample.inputType ? 'textbox' : 'button',
    ariaLabel: sample.ariaLabel ?? null,
    innerTextCandidate: sample.innerText ?? (sample.mode === 'ocr' ? sample.ocrText ?? null : null),
    inputType: (sample.inputType as InputType | undefined) ?? null,
    isEnabled: true,
    bbox: { x: 8, y: 8, width: 160, height: 28 },
  };
}

function baseScene(elements: RawElement[]): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: 'https://bench.example/t019',
    origin: 'https://bench.example',
    title: 'T019 privacy bench',
    viewport: { width: 1280, height: 720 },
    elements,
    privacyFindings: [],
    timestamp: Date.now(),
  };
}

export function datasetHash(samples: PiiSample[] = PII_SAMPLES): string {
  return createHash('sha256').update(JSON.stringify(samples)).digest('hex').slice(0, 16);
}

export function expectedPolicyFor(privacyClass: string): PrivacyPolicyDecision | undefined {
  return EXPECTED_POLICY[privacyClass];
}

export interface ClassCounts {
  className: string;
  nPos: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface PrivacyBenchResult {
  datasetVersion: string;
  datasetHash: string;
  n: number;
  classes: ClassCounts[];
  micro: { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number };
  authNeverSend: {
    n: number;
    policyCorrect: number;
    residualLeak: number;
    rows: Array<{ id: string; className: string; policyOk: boolean; leaked: boolean }>;
  };
  sanitization: {
    n: number;
    correct: number;
    miss: number;
    wrong: number;
    overRedaction: number;
    residualLeak: number;
    utilityPreserved: number;
  };
  rows: Array<{
    id: string;
    expected: string[];
    predicted: string[];
    decisions: string[];
    leaked: boolean;
    bytes: number;
  }>;
  fpReview: Array<{ id: string; predicted: string[]; notes?: string }>;
  fnReview: Array<{ id: string; expected: string[]; predicted: string[]; notes?: string }>;
}

export function runPrivacyBench(
  samples: PiiSample[] = PII_SAMPLES,
  options?: { datasetVersion?: string; extraClasses?: PrivacyClass[] }
): PrivacyBenchResult {
  resetTokenCounters();
  const classNames: PrivacyClass[] = [
    'PII_EMAIL',
    'PII_PHONE',
    'SECRET_PASSWORD',
    'SECRET_OTP',
    'SECRET_API_KEY',
    'SECRET_AUTH_TOKEN',
    'SECRET_SESSION',
    ...(options?.extraClasses || []),
  ];
  const counts = new Map<string, { tp: number; fp: number; fn: number; tn: number }>();
  for (const c of classNames) counts.set(c, { tp: 0, fp: 0, fn: 0, tn: 0 });

  let microTp = 0;
  let microFp = 0;
  let microFn = 0;
  const rows: PrivacyBenchResult['rows'] = [];
  const fpReview: PrivacyBenchResult['fpReview'] = [];
  const fnReview: PrivacyBenchResult['fnReview'] = [];
  const authRows: PrivacyBenchResult['authNeverSend']['rows'] = [];

  let sanN = 0;
  let sanCorrect = 0;
  let sanMiss = 0;
  let sanWrong = 0;
  let sanOver = 0;
  let sanLeak = 0;
  let sanUtility = 0;
  let authN = 0;
  let authPolicy = 0;
  let authLeak = 0;

  samples.forEach((sample, index) => {
    const findings =
      sample.mode === 'goal'
        ? detectGoalPrivacy(sample.goal || '')
        : sample.mode === 'ocr'
          ? detectOcrTextPrivacy(sample.ocrText || '', { roiId: `roi_${sample.id}`, blockId: 'b1' })
          : detectElementPrivacy(elementFrom(sample, index));
    const predicted: PrivacyClass[] = [...new Set(findings.map((f) => f.privacyClass))];
    const expected = sample.expectedClasses as PrivacyClass[];

    for (const c of classNames) {
      const bucket = counts.get(c);
      if (!bucket) continue;
      const exp = expected.includes(c);
      const pred = predicted.includes(c);
      if (exp && pred) bucket.tp += 1;
      else if (!exp && pred) bucket.fp += 1;
      else if (exp && !pred) bucket.fn += 1;
      else bucket.tn += 1;
    }
    for (const c of expected) {
      if (predicted.includes(c)) microTp += 1;
      else microFn += 1;
    }
    for (const c of predicted) {
      if (!expected.includes(c)) microFp += 1;
    }

    const extra = predicted.filter((c) => !expected.includes(c));
    const missing = expected.filter((c) => !predicted.includes(c));
    if (extra.length > 0) fpReview.push({ id: sample.id, predicted: extra, notes: sample.notes });
    if (missing.length > 0) fnReview.push({ id: sample.id, expected: missing, predicted, notes: sample.notes });

    resetTokenCounters();
    const decisions = evaluatePrivacyPolicy(findings);
    const vault = new PrivateTokenVault();
    const taskId = createTaskId(`pii-${sample.id}`);
    const el = elementFrom(sample, index);
    const scene = baseScene([el]);
    for (const pair of tokenizeDecisionsWithValues(decisions, findings)) {
      vault.registerToken(pair.decision.tokenRole || '', pair.decision.privacyClass, pair.realValue, taskId, 1, scene.origin, [
        'text',
        'textbox',
        'email',
        'tel',
      ]);
    }
    const goal = sample.goal || 'Continue';
    const safe = buildSafeContext(scene, goal, decisions, vault, taskId, findings);
    let serialized = '';
    let leaked = false;
    try {
      serialized = validateSafeContextEgress(safe);
    } catch {
      serialized = JSON.stringify(safe);
    }
    leaked = sample.rawSecrets.some((secret) => secret.length > 3 && serialized.includes(secret));
    if (leaked) sanLeak += 1;

    const hasControls = safe.safeElements.length > 0;
    const droppedPublic =
      expected.length === 0 &&
      Boolean(sample.innerText && sample.innerText.length > 2 && !JSON.stringify(safe).includes(sample.innerText.slice(0, 12)));
    if (hasControls && !droppedPublic) sanUtility += 1;

    for (const finding of findings) {
      sanN += 1;
      const decision = decisions.find((d) => d.findingId === finding.findingId);
      const expectedDecision = expectedPolicyFor(finding.privacyClass);
      if (!decision || !expectedDecision) {
        sanMiss += 1;
        continue;
      }
      if (decision.decision === expectedDecision) sanCorrect += 1;
      else if (decision.decision === 'NEVER_SEND' && expectedDecision !== 'NEVER_SEND') sanOver += 1;
      else sanWrong += 1;
    }
    for (const cls of expected) {
      if (!predicted.includes(cls as PrivacyClass)) {
        sanN += 1;
        sanMiss += 1;
      }
    }

    for (const cls of expected.filter((c) => AUTH_CLASSES.has(c))) {
      authN += 1;
      const decision = decisions.find((d) => d.privacyClass === cls);
      const policyOk = decision?.decision === 'NEVER_SEND';
      if (policyOk) authPolicy += 1;
      const secretLeak = sample.rawSecrets.some((secret) => secret.length > 3 && serialized.includes(secret));
      if (secretLeak) authLeak += 1;
      authRows.push({ id: sample.id, className: cls, policyOk: Boolean(policyOk), leaked: secretLeak });
    }

    rows.push({
      id: sample.id,
      expected,
      predicted,
      decisions: decisions.map((d) => `${d.privacyClass}:${d.decision}`),
      leaked,
      bytes: serialized.length,
    });
  });

  const classes: ClassCounts[] = classNames.map((className) => {
    const bucket = counts.get(className) || { tp: 0, fp: 0, fn: 0, tn: 0 };
    const pr = precisionRecallF1(bucket.tp, bucket.fp, bucket.fn);
    return {
      className,
      nPos: bucket.tp + bucket.fn,
      tp: bucket.tp,
      fp: bucket.fp,
      fn: bucket.fn,
      tn: bucket.tn,
      precision: pr.precision,
      recall: pr.recall,
      f1: pr.f1,
    };
  });

  const micro = precisionRecallF1(microTp, microFp, microFn);
  return {
    datasetVersion: options?.datasetVersion || PII_DATASET_VERSION,
    datasetHash: datasetHash(samples),
    n: samples.length,
    classes,
    micro: { tp: microTp, fp: microFp, fn: microFn, ...micro },
    authNeverSend: { n: authN, policyCorrect: authPolicy, residualLeak: authLeak, rows: authRows },
    sanitization: {
      n: sanN,
      correct: sanCorrect,
      miss: sanMiss,
      wrong: sanWrong,
      overRedaction: sanOver,
      residualLeak: sanLeak,
      utilityPreserved: sanUtility,
    },
    rows,
    fpReview,
    fnReview,
  };
}
