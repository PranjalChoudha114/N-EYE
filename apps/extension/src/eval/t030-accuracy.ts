/**
 * T030 accuracy certification pack.
 * OWNS: Combining frozen PII partitions, visual eval, report-truth, reliability, fallback matrix.
 * MUST NOT: Tune on holdout, invent Chrome E2E, or publish a single vague accuracy number.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureManifest, formatMs, pct, writeJson, writeText } from './bench-io.js';
import { runPrivacyBench } from './privacy-bench.js';
import { runVisualEval } from './visual-bench.js';
import { runPerformanceBench } from './performance-bench.js';
import { runCanaryRedTeam } from './canary-bench.js';
import { formatWilson, wilsonScoreInterval } from './metrics.js';
import { t030DevelopmentPii, t030HoldoutPii, T030_PII_DEV_VERSION, T030_PII_HOLDOUT_VERSION } from './t030-pii-corpus.js';
import { scoreReportTruth, T030_REPORT_TRUTH_VERSION } from './t030-report-truth.js';
import { scoreReliability, T030_RELIABILITY_VERSION } from './t030-reliability.js';
import { fallbackNeverIncreasesAuthority, T030_FALLBACK_MATRIX } from './t030-fallback-matrix.js';
import { MAX_STEPS } from '../runtime/trust-loop.js';
import { PLANNER_MAX_ATTEMPTS } from '../planner/transport-error.js';
import { MAX_IDENTICAL_ACTION_FAILURES, MAX_RECOVERY_ATTEMPTS } from '../intelligence/recovery-policy.js';
import { MAX_EXPLORE_SCROLLS } from '../intelligence/exploration-policy.js';

export const T030_ACCURACY_VERSION = 't030-accuracy/1';

function classInterval(successes: number, n: number): { low: number; high: number } | null {
  return wilsonScoreInterval(successes, n);
}

export async function runT030AccuracyPack(args: {
  repoRoot: string;
  includeVisualOcr: boolean;
}): Promise<{
  version: string;
  privacyDev: ReturnType<typeof runPrivacyBench>;
  privacyHoldout: ReturnType<typeof runPrivacyBench>;
  reportTruth: ReturnType<typeof scoreReportTruth>;
  reliability: ReturnType<typeof scoreReliability>;
  fallbackRows: number;
  fallbackAuthorityClosed: boolean;
    loopBounds: {
      maxSteps: number;
      plannerMaxAttempts: number;
      maxRecoveryAttempts: number;
      maxIdenticalActionFailures: number;
      maxExploreScrolls: number;
    };
  canaryPass: boolean;
  visual: Awaited<ReturnType<typeof runVisualEval>> | null;
  performance: Awaited<ReturnType<typeof runPerformanceBench>> | null;
}> {
  const privacyDev = runPrivacyBench(t030DevelopmentPii(), {
    datasetVersion: T030_PII_DEV_VERSION,
    extraClasses: ['PII_NAME', 'PII_ADDRESS', 'PII_ACCOUNT_ID'],
  });
  const privacyHoldout = runPrivacyBench(t030HoldoutPii(), {
    datasetVersion: T030_PII_HOLDOUT_VERSION,
    extraClasses: ['PII_NAME', 'PII_ADDRESS', 'PII_ACCOUNT_ID'],
  });
  const reportTruth = scoreReportTruth();
  const reliability = scoreReliability();
  const canary = runCanaryRedTeam();
  let visual: Awaited<ReturnType<typeof runVisualEval>> | null = null;
  let performance: Awaited<ReturnType<typeof runPerformanceBench>> | null = null;
  if (args.includeVisualOcr) {
    visual = await runVisualEval();
    performance = await runPerformanceBench(join(args.repoRoot, 'apps/extension/dist'));
  }
  return {
    version: T030_ACCURACY_VERSION,
    privacyDev,
    privacyHoldout,
    reportTruth,
    reliability,
    fallbackRows: T030_FALLBACK_MATRIX.length,
    fallbackAuthorityClosed: fallbackNeverIncreasesAuthority(),
    loopBounds: {
      maxSteps: MAX_STEPS,
      plannerMaxAttempts: PLANNER_MAX_ATTEMPTS,
      maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
      maxIdenticalActionFailures: MAX_IDENTICAL_ACTION_FAILURES,
      maxExploreScrolls: MAX_EXPLORE_SCROLLS,
    },
    canaryPass: canary.channels.every((c) => c.pass),
    visual,
    performance,
  };
}

export function writeT030Evidence(
  repoRoot: string,
  pack: Awaited<ReturnType<typeof runT030AccuracyPack>>
): void {
  const manifest = captureManifest(repoRoot);
  const certificate = {
    schema: T030_ACCURACY_VERSION,
    measuredAt: new Date().toISOString(),
    gitSha: manifest.gitSha,
    gitShaShort: manifest.gitShaShort,
    dirty: manifest.dirty,
    environment: {
      os: manifest.os,
      arch: manifest.arch,
      cpu: manifest.cpu,
      ramBytes: manifest.ramBytes,
      node: manifest.node,
      browser: 'Node/happy-dom (not Chrome E2E)',
      ocrEngine: manifest.ocrEngine,
    },
    scoring: {
      visual: 'per-class cascade/OCR/grounding; not a single accuracy %',
      pii: 'per-class P/R/F1 on frozen development vs holdout',
      redaction: 'residual leak + NEVER_SEND + utility from privacy bench',
      reliability: 'arbiter/interpreter contract; wrong-action and false-complete penalized',
    },
    exclusions: [
      'Real Chrome Side Panel E2E',
      'Live Remote /v1/plan body unless separately captured',
      'Tuning on holdout PII JSON',
    ],
    privacy: {
      development: {
        corpus: pack.privacyDev.datasetVersion,
        hash: pack.privacyDev.datasetHash,
        n: pack.privacyDev.n,
        micro: pack.privacyDev.micro,
        classes: pack.privacyDev.classes,
        sanitization: pack.privacyDev.sanitization,
        neverSend: pack.privacyDev.authNeverSend,
        fpReview: pack.privacyDev.fpReview,
        fnReview: pack.privacyDev.fnReview,
      },
      holdout: {
        corpus: pack.privacyHoldout.datasetVersion,
        hash: pack.privacyHoldout.datasetHash,
        n: pack.privacyHoldout.n,
        micro: pack.privacyHoldout.micro,
        classes: pack.privacyHoldout.classes,
        sanitization: pack.privacyHoldout.sanitization,
        neverSend: pack.privacyHoldout.authNeverSend,
        fpReview: pack.privacyHoldout.fpReview,
        fnReview: pack.privacyHoldout.fnReview,
      },
    },
    visual: pack.visual
      ? {
          cascade: pack.visual.cascade,
          grounding: pack.visual.grounding,
          ocr: pack.visual.ocr,
          wilsonCascade: classInterval(pack.visual.cascade.correct, pack.visual.cascade.total),
          wilsonGrounding: classInterval(pack.visual.grounding.correct, pack.visual.grounding.total),
          wilsonOcr: classInterval(pack.visual.ocr.hits, pack.visual.ocr.total),
        }
      : null,
    reportTruth: pack.reportTruth,
    reliability: pack.reliability,
    fallback: {
      rows: pack.fallbackRows,
      authorityClosed: pack.fallbackAuthorityClosed,
    },
    loopBounds: pack.loopBounds,
    canaryPass: pack.canaryPass,
    performance: pack.performance,
    knownBiases: [
      'Node/happy-dom is not Chrome hit-testing or Tesseract-on-tab-capture.',
      'Holdout IN_MOBILE false positives on bare 10-digit prose are measured, not retuned.',
      'Hindi name labels are scored as desired PII_NAME and may FN.',
    ],
  };
  writeJson(join(repoRoot, 'docs/evidence/T030-ACCURACY-CERTIFICATE.json'), certificate);
  writeJson(join(repoRoot, 'bench/t030/t030-accuracy.json'), certificate);

  const md = [
    '# T030 Accuracy Certificate',
    '',
    `Corpus/build: \`${manifest.gitSha}\` dirty=${manifest.dirty}`,
    `Measured: ${certificate.measuredAt}`,
    `Harness: ${T030_ACCURACY_VERSION}`,
    '',
    'No single “accuracy %” is published. Dimensions are separate.',
    '',
    '## PII — development',
    '',
    `Corpus ${pack.privacyDev.datasetVersion} hash ${pack.privacyDev.datasetHash} N=${pack.privacyDev.n}`,
    '',
    '| Class | TP | FP | FN | P | R | F1 | N_pos |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...pack.privacyDev.classes.map(
      (c) =>
        `| ${c.className} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.f1)} | ${c.nPos} |`
    ),
    '',
    `Micro P/R/F1 ${pct(pack.privacyDev.micro.precision)} / ${pct(pack.privacyDev.micro.recall)} / ${pct(pack.privacyDev.micro.f1)}`,
    `Sanitization residual leak ${pack.privacyDev.sanitization.residualLeak}; NEVER_SEND leak ${pack.privacyDev.authNeverSend.residualLeak}`,
    '',
    '## PII — frozen holdout (not used to retune)',
    '',
    `Corpus ${pack.privacyHoldout.datasetVersion} hash ${pack.privacyHoldout.datasetHash} N=${pack.privacyHoldout.n}`,
    '',
    '| Class | TP | FP | FN | P | R | F1 | N_pos |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...pack.privacyHoldout.classes.map(
      (c) =>
        `| ${c.className} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.f1)} | ${c.nPos} |`
    ),
    '',
    `Micro P/R/F1 ${pct(pack.privacyHoldout.micro.precision)} / ${pct(pack.privacyHoldout.micro.recall)} / ${pct(pack.privacyHoldout.micro.f1)}`,
    'FP review:',
    pack.privacyHoldout.fpReview.length === 0
      ? '- None'
      : pack.privacyHoldout.fpReview.map((f) => `- \`${f.id}\`: ${f.predicted.join(', ')}`).join('\n'),
    'FN review:',
    pack.privacyHoldout.fnReview.length === 0
      ? '- None'
      : pack.privacyHoldout.fnReview.map((f) => `- \`${f.id}\`: expected ${f.expected.join(', ')}`).join('\n'),
    '',
    '## Visual',
    '',
    pack.visual
      ? [
          `Cascade ${pack.visual.cascade.correct}/${pack.visual.cascade.total} (Wilson ${formatWilson(pack.visual.cascade.correct, pack.visual.cascade.total)})`,
          `Grounding ${pack.visual.grounding.correct}/${pack.visual.grounding.total} false=${pack.visual.grounding.falseGrounding} abstain=${pack.visual.grounding.abstain} (Wilson ${formatWilson(pack.visual.grounding.correct, pack.visual.grounding.total)})`,
          `OCR ${pack.visual.ocr.hits}/${pack.visual.ocr.total} (Wilson ${formatWilson(pack.visual.ocr.hits, pack.visual.ocr.total)}) p50=${formatMs(pack.visual.ocr.latencyMs.p50)} p95=${formatMs(pack.visual.ocr.latencyMs.p95)}`,
          'Classification: MEASURED (fixtures). Chrome Scenario 08: HUMAN REQUIRED.',
        ].join('\n')
      : 'Visual OCR pack not run this invocation (`N_EYE_BENCH_WRITE` required for Tesseract).',
    '',
    '## Report truth',
    '',
    `Corpus ${T030_REPORT_TRUTH_VERSION} N=${pack.reportTruth.n} (dev ${pack.reportTruth.developmentN}, holdout ${pack.reportTruth.holdoutN})`,
    `Result matches ${pack.reportTruth.resultMatches}/${pack.reportTruth.n}`,
    `Factual claim precision ${pct(pack.reportTruth.factualClaimPrecision)}`,
    `Unsupported high-impact FACT count ${pack.reportTruth.unsupportedHighImpact}`,
    `Secret leaks ${pack.reportTruth.secretLeaks}`,
    pack.reportTruth.failures.length ? `Failures:\n${pack.reportTruth.failures.map((f) => `- ${f}`).join('\n')}` : 'No scorer failures.',
    '',
    '## Agent reliability (contract, not Chrome)',
    '',
    `Corpus ${T030_RELIABILITY_VERSION} N=${pack.reliability.n}`,
    `Verified success ${pack.reliability.verifiedSuccess}`,
    `False-completion caught ${pack.reliability.falseCompletionCaught}`,
    `Wrong action ${pack.reliability.wrongAction}`,
    `Correct abstention ${pack.reliability.correctAbstention}`,
    `TaskGraph disagreements ${pack.reliability.graphDisagreements}`,
    pack.reliability.failures.length ? pack.reliability.failures.map((f) => `- ${f}`).join('\n') : 'No scorer failures.',
    '',
    '## Method',
    '',
    'Development PII is t027-pii-corpus.v1. Holdout is t030-pii-holdout/1 JSON. Holdout labels are desired behavior.',
    '',
  ];
  writeText(join(repoRoot, 'docs/evidence/T030-ACCURACY-CERTIFICATE.md'), md.join('\n'));
}

export function t030RepoRootFromEval(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../../../..');
}
