# T019/T020 SIH scorecard

Build SHA: `771b51c16ca88d994869c369920516c93749bebc`

Weights below are the **current N-Eye evaluation model** from the project source (25/20/20/20/15). They are not an externally certified SIH scoring law. **No weighted final winner score is computed.**

| Dimension | Weight (model) | Metric | Result | N | Evidence |
|---|---|---|---|---|---|
| Visual-context accuracy | 25% | OCR text hit-rate + grounding accuracy (separate; not averaged into a magic AI score) | OCR 100.0%; grounding 100.0% | OCR 7; grounding 7; cascade 7 | bench/visual/reports/t019-t020-visual.json |
| Sensitive / PII P/R | 20% | Per-class P/R/F1; micro F1 supplemental | micro F1 100.0%; email F1 100.0% | 55 | bench/privacy/raw/t019-t020-privacy.json |
| Redaction / sanitization | 20% | Correct policy transformation + residual leak + utility | correct 41/41; residual leak 0; NEVER_SEND residual 0 | 41 | bench/sanitization/raw/t019-t020-sanitization.json |
| Client-side resource | 20% | dist JS+CSS bytes, OCR assets, SafeContext bytes, screenshot outbound | SafeContext 10264 B; screenshot 0 B; product JS+CSS 213912 B uncompressed / 67054 B gzip PROXY; OCR assets 8123867 B | — | bench/performance/raw/t019-t020-performance.json |
| End-to-end latency | 15% | happy-dom stage p50/p95 (not Chrome E2E) | observe p50=3.21 p95=3.61; OCR p50=10.19 p95=28.63 | observe 40; OCR 7 | bench/performance/raw/t019-t020-performance.json |
