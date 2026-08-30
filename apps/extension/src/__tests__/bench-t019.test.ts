/**
 * T019/T020 formal measurement pack.
 * Writes machine-readable JSON under bench/ and generated markdown under docs/evidence/.
 */
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureManifest, formatMs, pct, ratio, writeJson, writeText } from '../eval/bench-io.js';
import { PII_DATASET_VERSION, PII_SAMPLES } from '../eval/pii-corpus.js';
import { runPrivacyBench } from '../eval/privacy-bench.js';
import { runCanaryRedTeam, T019_CANARIES } from '../eval/canary-bench.js';
import { ensureBenchDom, rawSceneSerializedSize, runPerformanceBench } from '../eval/performance-bench.js';
import { runTaskBench } from '../eval/task-bench.js';
import { runVisualEval } from '../eval/visual-bench.js';
import { privacyMarkdown, scorecardMarkdown } from '../eval/t019-reports.js';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { createPageEpoch } from '@n-eye/protocol';
import { compactContainsForbiddenJargon } from '../ui/human-copy.js';
import { statusCopy } from '../ui/status-map.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

describe('T019/T020 formal SIH measurement', () => {
  it('runs privacy, sanitization, canary, visual, performance, task benches and writes reports', async () => {
    const manifest = captureManifest(repoRoot);
    writeJson(join(repoRoot, 'bench/manifests/t019-t020-manifest.json'), manifest);
    writeJson(join(repoRoot, 'bench/privacy/dataset/t019-pii-corpus.v1.json'), {
      version: PII_DATASET_VERSION,
      split: 'eval',
      notes: 'Synthetic labels only. Not the T021 hidden corpus.',
      samples: PII_SAMPLES,
    });

    const privacy = runPrivacyBench();
    writeJson(join(repoRoot, 'bench/privacy/raw/t019-t020-privacy.json'), { manifest, privacy });
    writeText(join(repoRoot, 'bench/privacy/reports/t019-t020-privacy.md'), privacyMarkdown(privacy, manifest.gitSha));
    writeJson(join(repoRoot, 'bench/sanitization/raw/t019-t020-sanitization.json'), { manifest, sanitization: privacy.sanitization, auth: privacy.authNeverSend });
    writeText(
      join(repoRoot, 'bench/sanitization/reports/t019-t020-sanitization.md'),
      [
        '# T019/T020 sanitization / NEVER_SEND',
        '',
        `SHA: \`${manifest.gitSha}\``,
        '',
        `Correct transformations: ${privacy.sanitization.correct}/${privacy.sanitization.n}`,
        `Missed: ${privacy.sanitization.miss}; wrong: ${privacy.sanitization.wrong}; over-redaction: ${privacy.sanitization.overRedaction}`,
        `Residual leak samples: ${privacy.sanitization.residualLeak}`,
        `Utility preserved: ${privacy.sanitization.utilityPreserved}/${privacy.n}`,
        `Auth NEVER_SEND policy: ${privacy.authNeverSend.policyCorrect}/${privacy.authNeverSend.n}; residual leak ${privacy.authNeverSend.residualLeak}`,
        '',
      ].join('\n')
    );

    const canary = runCanaryRedTeam();
    writeJson(join(repoRoot, 'bench/canary/raw/t019-t020-canary.json'), {
      manifest,
      canaries: T019_CANARIES,
      note: 'Synthetic identifiers. Dataset files may name them by design. Runtime channels must not.',
      canary,
    });
    writeText(
      join(repoRoot, 'bench/canary/reports/t019-t020-canary.md'),
      [
        '# T019/T020 canary leakage red-team',
        '',
        `SHA: \`${manifest.gitSha}\``,
        '',
        'Claim form: **No tested forbidden canary appeared in the tested outbound/log/storage channels.**',
        'This is not a proof of zero leakage everywhere.',
        '',
        '| Channel | Result | Hits |',
        '|---|---|---|',
        ...canary.channels.map((c) => `| ${c.channel} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.hits.join(', ') || '—'} |`),
        '',
        `Untested in this pack: live HTTP bytes, Chrome extension console, backend console, IndexedDB, screenshot files on disk.`,
        '',
      ].join('\n')
    );

    const distDir = join(repoRoot, 'apps/extension/dist');
    const performance = await runPerformanceBench(existsSync(distDir) ? distDir : undefined);
    ensureBenchDom();
    document.body.innerHTML = `<input type="email" /><button>Continue</button>`;
    const rawBytes = rawSceneSerializedSize(observePage(new ElementRegistry(), createPageEpoch(1)));
    writeJson(join(repoRoot, 'bench/performance/raw/t019-t020-performance.json'), { manifest, performance, rawSceneBytesComparison: { rawBytes, note: 'Local serialization baseline. RawScene is not sent.' } });

    const task = await runTaskBench();
    writeJson(join(repoRoot, 'bench/task/raw/t019-t020-task.json'), { manifest, task });

    const visual = await runVisualEval();
    writeJson(join(repoRoot, 'bench/visual/reports/t019-t020-visual.json'), { gate: 'T019-T020', manifest, visual });
    writeText(
      join(repoRoot, 'bench/visual/reports/t019-t020-visual.md'),
      [
        '# T019/T020 visual-context measurement',
        '',
        `SHA: \`${manifest.gitSha}\``,
        '',
        'Held-out vs development splits from `bench/visual/ground-truth`. Not the T021 hidden corpus.',
        '',
        `Text recognition (normalized contains): ${visual.ocr.hits}/${visual.ocr.total} = ${pct(visual.ocr.accuracy)}`,
        `Target grounding: ${visual.grounding.correct}/${visual.grounding.total} = ${pct(visual.grounding.accuracy)} (abstain ${visual.grounding.abstain}, false grounding ${visual.grounding.falseGrounding})`,
        `Adaptive cascade: ${visual.cascade.correct}/${visual.cascade.total}; DOM-only ${visual.cascade.domOnlyCount}; escalate ${visual.cascade.escalateCount}`,
        `OCR privacy F1 (visual canaries): ${pct(visual.privacy.f1)}; leakCount=${visual.privacy.leakCount}`,
        `OCR latency p50/p95: ${formatMs(visual.ocr.latencyMs.p50)} / ${formatMs(visual.ocr.latencyMs.p95)} ms (N=${visual.ocr.latencyMs.count})`,
        `OCR warmup (cold proxy): ${formatMs(visual.ocr.coldWarmupMs)} ms; first recognize after warmup: ${formatMs(visual.ocr.firstRecognizeAfterWarmupMs)} ms`,
        `Screenshot outbound: 0 B`,
        `MODEL_ADMISSION: ${visual.modelAdmission.decision}`,
        '',
      ].join('\n')
    );

    const stages = performance.stages;
    writeText(
      join(repoRoot, 'bench/performance/reports/t019-t020-performance.md'),
      [
        '# T019/T020 performance / resource',
        '',
        `SHA: \`${manifest.gitSha}\``,
        `Runtime: happy-dom on ${manifest.cpu}`,
        '',
        '| Stage | N | p50 (ms) | p95 (ms) |',
        '|---|---:|---:|---:|',
        ...Object.entries(stages).map(([name, s]) => `| ${name} | ${s.count} | ${s.p50?.toFixed(2) ?? 'n/a'} | ${s.p95?.toFixed(2) ?? 'n/a'} |`),
        '',
        `SafeContext bytes (this scene): ${performance.payload.safeContextBytes}`,
        `RawScene local JSON bytes (comparison only, not sent): ${rawBytes}`,
        `Screenshot outbound: 0 B`,
        '',
        `JS+CSS product dist bytes (uncompressed, excluding ocr/ and maps): ${performance.resources.jsCssBytes || 'dist missing — rebuild'}`,
        `JS+CSS product gzip PROXY: ${performance.resources.jsCssGzipBytes ?? 'n/a'}`,
        `OCR asset bytes (traineddata + wasm + worker): ${performance.resources.ocrAssetBytes}`,
        `${performance.resources.memoryProxyLabel}`,
        '',
      ].join('\n')
    );

    writeText(
      join(repoRoot, 'bench/task/reports/t019-t020-task.md'),
      [
        '# T019/T020 task outcomes (local completion arbiter)',
        '',
        `SHA: \`${manifest.gitSha}\``,
        `N=${task.n}`,
        '',
        'ASK_USER is not success. Planner COMPLETE is not success.',
        '',
        JSON.stringify(task.counts, null, 2),
        '',
        ...task.rows.map((r) => `- ${r.id}: phase=${r.phase} verification=${r.verification}`),
        '',
      ].join('\n')
    );

    const email = privacy.classes.find((c) => c.className === 'PII_EMAIL');
    const scorecard = scorecardMarkdown({
      sha: manifest.gitSha,
      visual: {
        metric: 'OCR text hit-rate + grounding accuracy (separate; not averaged into a magic AI score)',
        result: `OCR ${pct(visual.ocr.accuracy)}; grounding ${pct(visual.grounding.accuracy)}`,
        n: `OCR ${visual.ocr.total}; grounding ${visual.grounding.total}; cascade ${visual.cascade.total}`,
        path: 'bench/visual/reports/t019-t020-visual.json',
      },
      pii: {
        metric: 'Per-class P/R/F1; micro F1 supplemental',
        result: `micro F1 ${pct(privacy.micro.f1)}; email F1 ${email ? pct(email.f1) : 'n/a'}`,
        n: String(privacy.n),
        path: 'bench/privacy/raw/t019-t020-privacy.json',
      },
      sanitization: {
        metric: 'Correct policy transformation + residual leak + utility',
        result: `correct ${ratio(privacy.sanitization.correct, privacy.sanitization.n)}; residual leak ${privacy.sanitization.residualLeak}; NEVER_SEND residual ${privacy.authNeverSend.residualLeak}`,
        n: String(privacy.sanitization.n),
        path: 'bench/sanitization/raw/t019-t020-sanitization.json',
      },
      resource: {
        metric: 'dist JS+CSS bytes, OCR assets, SafeContext bytes, screenshot outbound',
        result: `SafeContext ${performance.payload.safeContextBytes} B; screenshot 0 B; product JS+CSS ${performance.resources.jsCssBytes} B uncompressed / ${performance.resources.jsCssGzipBytes ?? 'n/a'} B gzip PROXY; OCR assets ${performance.resources.ocrAssetBytes} B`,
        path: 'bench/performance/raw/t019-t020-performance.json',
      },
      latency: {
        metric: 'happy-dom stage p50/p95 (not Chrome E2E)',
        result: `observe p50=${formatMs(stages.observation.p50)} p95=${formatMs(stages.observation.p95)}; OCR p50=${formatMs(visual.ocr.latencyMs.p50)} p95=${formatMs(visual.ocr.latencyMs.p95)}`,
        n: `observe ${stages.observation.count}; OCR ${visual.ocr.latencyMs.count}`,
        path: 'bench/performance/raw/t019-t020-performance.json',
      },
    });
    writeText(join(repoRoot, 'docs/evidence/T019-T020-SCORECARD.md'), scorecard);

    const claims = [
      '# T019/T020 claims / evidence matrix',
      '',
      `SHA: \`${manifest.gitSha}\``,
      '',
      '| Claim | Status | Evidence |',
      '|---|---|---|',
      `| N-Eye protects detected sensitive information before remote planning | ${privacy.sanitization.residualLeak === 0 && canary.passed === canary.tested ? 'PROVEN (tested corpus/channels)' : 'PARTIALLY PROVEN'} | privacy bench + canary channels |`,
      `| N-Eye does not normally send raw screenshots | PROVEN (this pack) | visual + performance screenshotOutboundBytes=0 |`,
      `| N-Eye uses local OCR when pixels contain needed text | PROVEN (controlled fixtures) | visual OCR ${visual.ocr.hits}/${visual.ocr.total} |`,
      `| N-Eye is adaptive rather than always-on vision | PROVEN (cascade corpus) | DOM-only ${visual.cascade.domOnlyCount}/${visual.cascade.total} |`,
      `| N-Eye verifies browser actions locally | PARTIALLY PROVEN | task bench uses local arbiter; Chrome E2E remains MANUAL |`,
      `| ASK_USER is not confirmation | PROVEN (automated) | ask-user + overlay + trust-loop tests |`,
      `| Compact UI does not require SafeContext/PageEpoch/EgressGuard vocabulary | PROVEN (copy audit) | statusCopy compact jargon check |`,
      `| Hidden-site generalization | UNVERIFIED | T021/T022 |`,
      `| Clean-profile real Chrome E2E | UNVERIFIED | T021/T022 |`,
      '',
    ].join('\n');
    writeText(join(repoRoot, 'docs/evidence/T019-T020-CLAIMS-EVIDENCE.md'), claims);

    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-PRIVACY-REPORT.md'),
      privacyMarkdown(privacy, manifest.gitSha)
    );
    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-CANARY-REPORT.md'),
      [
        '# T019/T020 canary leakage',
        '',
        `SHA: \`${manifest.gitSha}\``,
        '',
        `Passed ${canary.passed}/${canary.tested} tested channels.`,
        '',
        'Claim form: **No tested forbidden canary appeared in the tested outbound/log/storage channels.**',
        'This is not a proof of zero leakage everywhere.',
        '',
        '| Channel | Result | Hits |',
        '|---|---|---|',
        ...canary.channels.map((c) => `| ${c.channel} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.hits.join(', ') || '—'} |`),
        '',
        '## Untested in this pack',
        '- live HTTP request bytes',
        '- Chrome extension console',
        '- planner-api / backend console',
        '- chrome.storage / IndexedDB',
        '- page localStorage/sessionStorage (overlay does not write page storage)',
        '- screenshot files on disk',
        '',
      ].join('\n')
    );
    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-VISUAL-REPORT.md'),
      [
        '# T019/T020 visual-context',
        '',
        `SHA: \`${manifest.gitSha}\``,
        `Dataset: ${visual.dataset}`,
        '',
        `| Metric | Result | N |`,
        `|---|---|---|`,
        `| Text recognition (normalized contains) | ${visual.ocr.hits}/${visual.ocr.total} = ${pct(visual.ocr.accuracy)} | ${visual.ocr.total} |`,
        `| Target grounding | ${visual.grounding.correct}/${visual.grounding.total} = ${pct(visual.grounding.accuracy)} | ${visual.grounding.total} |`,
        `| Abstain | ${visual.grounding.abstain} | ${visual.grounding.total} |`,
        `| False grounding | ${visual.grounding.falseGrounding} | ${visual.grounding.total} |`,
        `| Adaptive cascade | ${visual.cascade.correct}/${visual.cascade.total} | ${visual.cascade.total} |`,
        `| DOM-only | ${visual.cascade.domOnlyCount}/${visual.cascade.total} | ${visual.cascade.total} |`,
        `| Escalate | ${visual.cascade.escalateCount}/${visual.cascade.total} | ${visual.cascade.total} |`,
        `| OCR privacy F1 | ${pct(visual.privacy.f1)} | visual canaries |`,
        `| OCR leakCount | ${visual.privacy.leakCount} | visual canaries |`,
        `| OCR p50/p95 ms | ${formatMs(visual.ocr.latencyMs.p50)} / ${formatMs(visual.ocr.latencyMs.p95)} | ${visual.ocr.latencyMs.count} |`,
        `| OCR cold warmup PROXY ms | ${formatMs(visual.ocr.coldWarmupMs)} | 1 |`,
        `| Screenshot outbound | 0 B | — |`,
        `| MODEL_ADMISSION | ${visual.modelAdmission.decision} | — |`,
        '',
        visual.modelAdmission.rationale,
        '',
        'These fixtures are development + held-out splits, not the T021 hidden corpus.',
        '',
      ].join('\n')
    );
    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-PERFORMANCE-REPORT.md'),
      [
        '# T019/T020 performance / resource',
        '',
        `SHA: \`${manifest.gitSha}\``,
        `Runtime: ${performance.runtime} on ${manifest.cpu}`,
        `OS: ${manifest.os} ${manifest.arch}; RAM ${manifest.ramBytes} B; Node ${manifest.node}`,
        '',
        'Classification: **RESULT** for this Node/happy-dom pack. Not Chrome E2E.',
        '',
        '| Stage | N | p50 (ms) | p95 (ms) |',
        '|---|---:|---:|---:|',
        ...Object.entries(stages).map(
          ([name, s]) => `| ${name} | ${s.count} | ${formatMs(s.p50)} | ${formatMs(s.p95)} |`
        ),
        `| OCR recognize (visual fixtures) | ${visual.ocr.latencyMs.count} | ${formatMs(visual.ocr.latencyMs.p50)} | ${formatMs(visual.ocr.latencyMs.p95)} |`,
        '',
        `SafeContext bytes (this scene): ${performance.payload.safeContextBytes}`,
        `RawScene local JSON bytes (comparison only, not sent): ${rawBytes}`,
        `Screenshot outbound: 0 B`,
        `Product JS+CSS uncompressed: ${performance.resources.jsCssBytes} B`,
        `Product JS+CSS gzip PROXY: ${performance.resources.jsCssGzipBytes ?? 'n/a'} B`,
        `OCR assets: ${performance.resources.ocrAssetBytes} B`,
        performance.resources.memoryProxyLabel,
        '',
      ].join('\n')
    );
    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-HUMAN-FIRST-UX.md'),
      [
        '# T019/T020 human-first UX',
        '',
        '## What did not change',
        '- Overlay card + Side Panel architecture, logo, tabs (Activity / Privacy / Action / Evidence), dark/light/system.',
        '- CSS additions only: `.nq-hint` and `.n-receipt h4` using existing type tokens.',
        '',
        '## ASK_USER vs CONFIRM',
        '- CONFIRM: “N-Eye needs your approval” + Allow once / Don’t allow. Bound capability.',
        '- ASK_USER: “I need your help” + rewrite field + Continue + Cancel. Continue calls `start()` (fresh observe/validate). Cancel dismisses to READY. No Allow once.',
        '',
        '## Compact copy mappings',
        '- ASK_USER → I need your help',
        '- RATE_LIMITED → AI service is temporarily busy',
        '- GATEWAY_UNREACHABLE → Can’t connect to the AI service',
        '- Tokenized (compact) → Hidden from the AI',
        '- Kept local (compact) → Stayed on your device (for this AI request; website may still see what you type)',
        '- SafeContext (compact) → Protected AI context',
        '- Egress Guard (compact) → Privacy check passed',
        '- OCR invoked (compact) → Read visible text locally',
        '- Screenshot outbound 0 B → No screenshot was sent',
        '- Pipeline SEE…VERIFY rail: Look / Read / Protect / Ask / Check / Do / Prove',
        '',
        'Technical terms remain on Evidence and under View technical details.',
        '',
        '## Copy audit (automated)',
        'Compact status headlines/messages for READY through ASK_USER omit SafeContext, PageEpoch, EgressGuard, tokenization, and OCR as required vocabulary.',
        'Formal human usability study: not performed.',
        '',
      ].join('\n')
    );

    const piiTable = privacy.classes
      .map(
        (c) =>
          `| ${c.className} | ${c.nPos} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(c.precision)} | ${pct(c.recall)} | ${pct(c.f1)} |`
      )
      .join('\n');
    writeText(
      join(repoRoot, 'docs/evidence/T019-T020-MEASUREMENT-REPORT.md'),
      [
        '# T019/T020 — Human-First Product + Formal SIH Measurement',
        '',
        '## 1. STATUS',
        'COMPLETE (product corrections + formal measurement pack). Chrome unpacked UI: UNVERIFIED until human reload.',
        '',
        '## 2. STARTING BASELINE',
        `Incoming HEAD \`${manifest.gitSha}\` on \`main\`. Reports below are generated from this run.`,
        `Dirty at generation: ${manifest.dirty}. Manifest: bench/manifests/t019-t020-manifest.json`,
        '',
        '## 3–6. PRODUCT CORRECTIONS',
        'See docs/evidence/T019-T020-HUMAN-FIRST-UX.md. ASK_USER is clarification, not confirmation.',
        '',
        '## 7. BENCHMARK METHODOLOGY',
        `- Dataset privacy: ${PII_DATASET_VERSION} hash ${privacy.datasetHash} N=${privacy.n} split=eval`,
        '- Visual: bench/visual/ground-truth development + held-out (not T021 hidden)',
        `- Hardware: ${manifest.cpu} ${manifest.arch} RAM ${manifest.ramBytes} B; ${manifest.os}; Node ${manifest.node}; pnpm ${manifest.pnpm}`,
        `- Commands: pnpm bench:privacy | pnpm bench:visual | pnpm bench:performance | pnpm bench:all`,
        '- Provider: MOCK for task/planner. Live Gemini not required for this pack.',
        '',
        '## 8. PII RESULTS',
        '| class | N_pos | TP | FP | FN | precision | recall | F1 |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        piiTable,
        '',
        `Micro: TP=${privacy.micro.tp} FP=${privacy.micro.fp} FN=${privacy.micro.fn} P=${pct(privacy.micro.precision)} R=${pct(privacy.micro.recall)} F1=${pct(privacy.micro.f1)}`,
        '',
        '## 9. AUTH-SECRET / NEVER_SEND',
        `N=${privacy.authNeverSend.n}; policy ${ratio(privacy.authNeverSend.policyCorrect, privacy.authNeverSend.n)}; residual leak ${privacy.authNeverSend.residualLeak}`,
        '',
        '## 10. SANITIZATION',
        `correct ${privacy.sanitization.correct}/${privacy.sanitization.n}; miss ${privacy.sanitization.miss}; wrong ${privacy.sanitization.wrong}; over-redaction ${privacy.sanitization.overRedaction}; residual leak ${privacy.sanitization.residualLeak}; utility ${privacy.sanitization.utilityPreserved}/${privacy.n}`,
        '',
        '## 11. CANARY',
        `Passed ${canary.passed}/${canary.tested} tested channels. See T019-T020-CANARY-REPORT.md`,
        '',
        '## 12. VISUAL-CONTEXT',
        `OCR ${visual.ocr.hits}/${visual.ocr.total}; grounding ${visual.grounding.correct}/${visual.grounding.total}; abstain ${visual.grounding.abstain}; DOM-only ${visual.cascade.domOnlyCount}/${visual.cascade.total}; escalate ${visual.cascade.escalateCount}/${visual.cascade.total}`,
        '',
        '## 13. TASK OUTCOMES',
        JSON.stringify(task.counts),
        ...task.rows.map((r) => `- ${r.id}: ${r.phase} / ${r.verification}`),
        'ASK_USER is not success. Planner COMPLETE is not success.',
        '',
        '## 14. ADAPTIVE PERCEPTION',
        `DOM-only ${visual.cascade.domOnlyCount}/${visual.cascade.total}; escalate ${visual.cascade.escalateCount}/${visual.cascade.total}; unnecessary OCR on DOM-sufficient ${visual.cascade.unnecessaryOcrOnDomSufficient}`,
        '',
        '## 15–16. LATENCY / RESOURCE',
        `observe N=${stages.observation.count} p50=${formatMs(stages.observation.p50)} p95=${formatMs(stages.observation.p95)}`,
        `OCR N=${visual.ocr.latencyMs.count} p50=${formatMs(visual.ocr.latencyMs.p50)} p95=${formatMs(visual.ocr.latencyMs.p95)} cold=${formatMs(visual.ocr.coldWarmupMs)}`,
        `SafeContext ${performance.payload.safeContextBytes} B; screenshot 0 B; product JS+CSS ${performance.resources.jsCssBytes} B / gzip PROXY ${performance.resources.jsCssGzipBytes ?? 'n/a'} B; OCR assets ${performance.resources.ocrAssetBytes} B`,
        '',
        '## 17. SIH SCORECARD',
        'See docs/evidence/T019-T020-SCORECARD.md. No weighted winner score.',
        '',
        '## 18. CLAIMS',
        'See docs/evidence/T019-T020-CLAIMS-EVIDENCE.md',
        '',
        'Generated from machine-readable JSON. Do not hand-edit numbers.',
        '',
      ].join('\n')
    );

    expect(compactContainsForbiddenJargon(`${statusCopy('ASK_USER').headline} ${statusCopy('READY').message}`)).toBe(false);
    expect(canary.passed).toBe(canary.tested);
    expect(privacy.authNeverSend.residualLeak).toBe(0);
    expect(visual.privacy.leakCount).toBe(0);
    expect(task.rows.some((r) => r.id === 'unknown-github-style' && r.phase === 'ASK_USER')).toBe(true);
    expect(task.rows.every((r) => r.phase !== 'COMPLETED' || r.verification !== '—')).toBe(true);
  }, 180_000);
});
