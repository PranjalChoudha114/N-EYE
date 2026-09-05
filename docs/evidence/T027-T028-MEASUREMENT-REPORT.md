# T027 / T028 measurement notes

Method: existing T019 visual/privacy/performance/canary runners composed by `apps/extension/src/eval/t027-t028-bench.ts`. Write path: `N_EYE_BENCH_WRITE=1 pnpm bench:t027`.

Holdout: visual `bench/visual/ground-truth/held-out.json` (frozen). Privacy holdout-shaped row `hold-pan` in `T027_PII_SAMPLES` (not used to retune PAN regex). T019 `PII_SAMPLES` hash unchanged.

P1 during scoring: UPI regex matched `not-an-email@localhost`. Repair: skip non-payment handles `localhost|local|invalid|test|example|internal`. Re-measured. Not a PAN holdout tune.

FR1 (2026-09-04T14:40:48Z dist): empty-password control-vs-value is Report-layer. T027 PII micro remained 100% on `t027-pii-corpus.v1`. JS+CSS 298743 B (gzip PROXY 90302 B) vs prior ~293345 / 89098. Observe p50 ~5.68 ms (n=40).

Limitations: happy-dom observation/execution; Tesseract on synthetic PNGs; `os.cpus()[0].model` empty on this host (CPU recorded as unknown in JSON; sysctl Apple M5); no live HTTP planner capture; no Chrome RSS.

Do not average the 25/20/20/20/15 weights into a single “SIH score.”
