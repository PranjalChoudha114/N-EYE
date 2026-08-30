/**
 * T019/T020 report + scorecard markdown (generated from machine-readable JSON).
 */

import { pct, ratio } from './bench-io.js';
import type { PrivacyBenchResult } from './privacy-bench.js';

export function privacyMarkdown(result: PrivacyBenchResult, sha: string): string {
  const lines = [
    '# T019/T020 — Privacy / PII measurement',
    '',
    `Build SHA: \`${sha}\``,
    `Dataset: ${result.datasetVersion} (hash ${result.datasetHash})`,
    `N (samples): ${result.n}`,
    '',
    'Classification: **RESULT** (this build, labeled synthetic corpus, current detectors).',
    '',
    'Unsupported taxonomy classes `PII_NAME`, `PII_ADDRESS`, `PII_ACCOUNT_ID` are **not scored as detections**; they have policy mappings only.',
    '',
    '| class | N_pos | TP | FP | FN | TN | precision | recall | F1 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of result.classes) {
    lines.push(
      `| ${row.className} | ${row.nPos} | ${row.tp} | ${row.fp} | ${row.fn} | ${row.tn} | ${pct(row.precision)} | ${pct(row.recall)} | ${pct(row.f1)} |`
    );
  }
  lines.push('');
  lines.push(
    `Micro (label instances): TP=${result.micro.tp} FP=${result.micro.fp} FN=${result.micro.fn} P=${pct(result.micro.precision)} R=${pct(result.micro.recall)} F1=${pct(result.micro.f1)}`
  );
  lines.push('');
  lines.push('## False positives');
  if (result.fpReview.length === 0) lines.push('None on this corpus.');
  for (const item of result.fpReview) {
    lines.push(`- \`${item.id}\`: predicted ${item.predicted.join(', ')}${item.notes ? ` — ${item.notes}` : ''}`);
  }
  lines.push('');
  lines.push('## False negatives');
  if (result.fnReview.length === 0) lines.push('None on this corpus.');
  for (const item of result.fnReview) {
    lines.push(`- \`${item.id}\`: missing ${item.expected.join(', ')}; predicted [${item.predicted.join(', ') || 'none'}]${item.notes ? ` — ${item.notes}` : ''}`);
  }
  lines.push('');
  lines.push('## Auth-secret NEVER_SEND');
  lines.push(
    `- N=${result.authNeverSend.n}; policy correct ${ratio(result.authNeverSend.policyCorrect, result.authNeverSend.n)}; residual canary/raw in SafeContext ${result.authNeverSend.residualLeak}`
  );
  lines.push('');
  lines.push('## Sanitization');
  const s = result.sanitization;
  lines.push(
    `- transformations scored: ${s.n}; correct ${s.correct}; miss ${s.miss}; wrong ${s.wrong}; over-redaction ${s.overRedaction}; residual leak samples ${s.residualLeak}; utility-preserved samples ${s.utilityPreserved}/${result.n}`
  );
  lines.push('');
  lines.push('## Caveats');
  lines.push('- `PII_NAME` / `PII_ADDRESS` / `PII_ACCOUNT_ID` have no detectors; corpus labels them expected-empty.');
  lines.push('- `unicode-email` may match an ASCII suffix rather than the full Unicode local-part.');
  lines.push('- CANARY_ strings are always stripped from SafeContext labels; a public-looking sample that contains `CANARY_` can fail the utility check without being a PII miss.');
  lines.push('');
  return lines.join('\n');
}

export function scorecardMarkdown(input: {
  sha: string;
  visual: { metric: string; result: string; n: string; path: string };
  pii: { metric: string; result: string; n: string; path: string };
  sanitization: { metric: string; result: string; n: string; path: string };
  resource: { metric: string; result: string; path: string };
  latency: { metric: string; result: string; n: string; path: string };
}): string {
  return [
    '# T019/T020 SIH scorecard',
    '',
    `Build SHA: \`${input.sha}\``,
    '',
    'Weights below are the **current N-Eye evaluation model** from the project source (25/20/20/20/15). They are not an externally certified SIH scoring law. **No weighted final winner score is computed.**',
    '',
    '| Dimension | Weight (model) | Metric | Result | N | Evidence |',
    '|---|---|---|---|---|---|',
    `| Visual-context accuracy | 25% | ${input.visual.metric} | ${input.visual.result} | ${input.visual.n} | ${input.visual.path} |`,
    `| Sensitive / PII P/R | 20% | ${input.pii.metric} | ${input.pii.result} | ${input.pii.n} | ${input.pii.path} |`,
    `| Redaction / sanitization | 20% | ${input.sanitization.metric} | ${input.sanitization.result} | ${input.sanitization.n} | ${input.sanitization.path} |`,
    `| Client-side resource | 20% | ${input.resource.metric} | ${input.resource.result} | — | ${input.resource.path} |`,
    `| End-to-end latency | 15% | ${input.latency.metric} | ${input.latency.result} | ${input.latency.n} | ${input.latency.path} |`,
    '',
  ].join('\n');
}
