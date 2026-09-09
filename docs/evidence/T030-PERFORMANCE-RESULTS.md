# T030 — Performance / resource results

**Classification:** MEASURED (Node / happy-dom / Tesseract fixtures). **Not** Chrome RSS/CPU SIH judge numbers.

SHA: `7bca2ec` dirty=true · Darwin 25.6.0 arm64 · RAM 24 GB · Node v26.7.0  
Measured: 2026-09-09T06:57:45Z (T027/T028 pack rewrite this gate) + observer bench 100-el.

## Bundle / resources

| Item | Value |
|---|---|
| JS+CSS uncompressed | 314292 B |
| JS+CSS gzip PROXY | 94184 B |
| OCR assets | 8123867 B |
| SafeContext sample | 8348 B |
| Screenshot outbound | 0 B |
| Node heap proxy | 46296928 B (`memoryUsage().heapUsed`) |

## Stage latency

| Stage | n | p50 ms | p95 ms |
|---|---:|---:|---:|
| observation | 40 | 5.98 | 7.29 |
| privacy | 40 | 0.02 | 0.03 |
| sanitization | 20 | 0.42 | 0.55 |
| mock planner | 20 | 0.02 | 0.06 |
| execution | 15 | 0.21 | 1.89 |
| verification | 15 | 5.63 | 13.33 |
| OCR (visual pack) | 7 | 11.55 | 43.47 |
| observer 100-el (separate) | 100 | 3.93 | 7.19 |

Live Gemini propose (this machine, not p50 of N tasks): **7176 ms** one successful TYPE_TOKEN round-trip in the final T030 `pnpm test` (after a 503 retry). N=1. Not a p95.

OCR invocation: adaptive, not continuous. Capture frequency: ROI-bounded when escalated.

Companion: `docs/evidence/T028-PERFORMANCE-REPORT.md` (rewritten this run).
