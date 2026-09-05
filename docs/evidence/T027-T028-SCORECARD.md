# T027 / T028 / FR1 SIH scorecard

Build: `DEV • 64638ad*` · `Built 2026-09-04T14:40:48.172Z (uncommitted source)` — T027/T028-FR1 dist
SHA: `64638ad42da2fa401fa2f471d4f39e116770380f` (dirty working tree)
Hardware: Apple M5 · 24 GB RAM · Darwin 25.6.0 · Node v26.7.0 · pnpm 11.24.0
Runtime for these numbers: Node + happy-dom + Tesseract.js fixtures. **Not a Chrome E2E judge score. No weighted winner total is computed.**

Bench version: `t027-t028-bench/1` written `2026-09-04T14:40:56.319Z`
Dataset: `t027-pii-corpus.v1` hash `63a35cd3f367227c` N=69

| Dimension | Weight (model) | Method | Measured result | N | Classification | Evidence |
|---|---|---|---|---|---|---|
| Visual-context accuracy | 25% | Fixture cascade + grounding + OCR | Cascade 7/7; grounding 7/7 (false 0, abstain 4); OCR 7/7 | 7 / 7 / 7 | MEASURED (fixtures). Scenario 08 Chrome: LIMITATION | `docs/evidence/T027-VISUAL-REPORT.md` |
| Sensitive / PII P/R | 20% | Per-class P/R/F1; micro supplemental | Micro P/R/F1 100.0%. NAME/ADDRESS labeled-only (n_pos=1). Control-vs-value did **not** change this corpus (passwords are valued / type=password TP). | 69 | MEASURED | `docs/evidence/T027-PRIVACY-REPORT.md` |
| Redaction / sanitization | 20% | Policy + residual leak + utility | correct 54/54; residual leak 0; NEVER_SEND 24/24 leak 0; utility 68/69 | 54 / 24 / 69 | MEASURED | same |
| Client-side resource | 20% | dist JS+CSS, OCR assets, SafeContext, screenshot, Node heap PROXY | JS+CSS **298743 B** / gzip PROXY **90302 B** (was ~293345 / 89098 before FR1); OCR assets 8123867 B; SafeContext 8348 B; screenshot 0 B | — | MEASURED (Node PROXY). Chrome RSS: UNVERIFIED | `docs/evidence/T028-PERFORMANCE-REPORT.md` |
| End-to-end latency | 15% | Stage p50/p95 | observe p50=5.68 p95=6.66 (n=40); OCR p50=10.52 p95=29.80 (n=7); verify p50=5.52 p95=7.66 (n=15) | see JSON | MEASURED (happy-dom). Chrome E2E: UNVERIFIED | performance + visual JSON |

**Pixel-only:** Automated PNG→OCR→ground→CLICK: TESTED. Real Chrome Scenario 08: HUMAN REQUIRED.

**Live Remote network body:** not captured (planner gateway offline).

**FR1 bundle delta:** JS+CSS +~5.4 KB uncompressed / +~1.2 KB gzip PROXY. Observation p50 stayed ~5.7 ms. Not a catastrophic regression. Not a Chrome RSS result.
