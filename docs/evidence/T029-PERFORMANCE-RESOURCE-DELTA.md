# T029 — Performance / resource delta

**Build:** `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z (uncommitted source)`
**HEAD:** `64638ad42da2fa401fa2f471d4f39e116770380f` dirty
**Hardware this machine:** Apple M5 · RAM 25769803776 B (24 GB) · Darwin 25.6.0 arm64 · macOS 26.6 (25G72) · Node v26.7.0 · pnpm 11.24.0
**Classification:** MEASURED (Node / file sizes). Chrome RSS / CPU: **UNVERIFIED**.

No T029 production optimization was applied. Hot paths were inspected (observer, OCR admission, vault, arbiter, verifier). Candidates remain MEASURE-FIRST or DANGEROUS TO OPTIMIZE (privacy scans, OCR).

## Observer (this `pnpm test` run)

`apps/extension/src/__tests__/benchmark.test.ts` — 100 elements, 100 iterations, happy-dom:

| | ms |
|---|---:|
| Min | 3.97 |
| Median | 6.68 |
| P95 | 12.09 |
| Max | 16.30 |

T028 formal pack used **n=40** observation p50 5.68 / p95 6.66. Different n and noise. Do not claim a T029 regression or win from these two tables.

## Product JS+CSS (this dist, after T029 rebuild)

Method: sum of `apps/extension/dist` `*.js` + `*.css`, excluding `ocr/` and `*.map`.

| | Bytes | vs T028-FR1 recorded |
|---|---:|---|
| Uncompressed | **305117** | T028 `298743` → **+6374** |
| gzip PROXY (Python `gzip.compress` level 9) | **90811** | T028 node `gzipSync` `90302` — **method differs**; order-of-magnitude only |
| OCR assets | 8123867 | unchanged |

Not a Chrome download/RSS figure. Screenshot outbound remains 0 B by architecture.

## Formal T027/T028 stage latencies

Not re-run with `N_EYE_BENCH_WRITE=1` this gate (`bench-t027-t028.test.ts` **passed** without rewriting JSON). Treat T028 stage p50/p95 as **prior MEASURED**, not this-run.

## Resource audit notes (inspect-only)

| Candidate | Class |
|---|---|
| Repeated whole-DOM observe per step | MEASURE-FIRST (required for TOCTOU) |
| OCR when structure sufficient | Adaptive controller already gates; DANGEROUS TO OPTIMIZE |
| Unbounded evidence history | MEASURE-FIRST / POST-SIH |
| TaskGraph unused in trust-loop | Not a perf bug; DESIGN LIMITATION T029-F009 |
| Tesseract re-init | Existing worker lifecycle; not changed |
