# T019/T020 — Human-First Product + Formal SIH Measurement

## 1. STATUS
COMPLETE (product corrections + formal measurement pack). Chrome unpacked UI: UNVERIFIED until human reload.

## 2. STARTING BASELINE
Incoming HEAD `333631f1460188e29bc7eaaf38cb88f60b67c363` on `main`. Reports below are generated from this run.
Dirty at generation: true. Manifest: bench/manifests/t019-t020-manifest.json

## 3–6. PRODUCT CORRECTIONS
See docs/evidence/T019-T020-HUMAN-FIRST-UX.md. ASK_USER is clarification, not confirmation.

## 7. BENCHMARK METHODOLOGY
- Dataset privacy: t019-pii-corpus.v1 hash 765fbc9eb89fde53 N=55 split=eval
- Visual: bench/visual/ground-truth development + held-out (not T021 hidden)
- Hardware: unknown arm64 RAM 25769803776 B; Darwin 25.6.0; Node v26.7.0; pnpm 11.24.0
- Commands: pnpm bench:privacy | pnpm bench:visual | pnpm bench:performance | pnpm bench:all
- Provider: MOCK for task/planner. Live Gemini not required for this pack.

## 8. PII RESULTS
| class | N_pos | TP | FP | FN | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
| PII_EMAIL | 10 | 10 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PII_PHONE | 6 | 6 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_PASSWORD | 7 | 7 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_OTP | 5 | 5 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_API_KEY | 6 | 6 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_AUTH_TOKEN | 2 | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_SESSION | 4 | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% |

Micro: TP=40 FP=0 FN=0 P=100.0% R=100.0% F1=100.0%

## 9. AUTH-SECRET / NEVER_SEND
N=24; policy 24/24; residual leak 0

## 10. SANITIZATION
correct 41/41; miss 0; wrong 0; over-redaction 0; residual leak 0; utility 54/55

## 11. CANARY
Passed 5/5 tested channels. See T019-T020-CANARY-REPORT.md

## 12. VISUAL-CONTEXT
OCR 7/7; grounding 7/7; abstain 4; DOM-only 2/7; escalate 5/7

## 13. TASK OUTCOMES
{"ASK_USER":4,"COMPLETED":2}
- unknown-github-style: ASK_USER / —
- type-search-openai: COMPLETED / VERIFIED_SUCCESS
- search-for: ASK_USER / VERIFIED_SUCCESS
- click-missing: ASK_USER / —
- scroll: COMPLETED / VERIFIED_SUCCESS
- continue-no-button: ASK_USER / —
ASK_USER is not success. Planner COMPLETE is not success.

## 14. ADAPTIVE PERCEPTION
DOM-only 2/7; escalate 5/7; unnecessary OCR on DOM-sufficient 0

## 15–16. LATENCY / RESOURCE
observe N=40 p50=3.27 p95=3.51
OCR N=7 p50=10.38 p95=28.86 cold=71.16
SafeContext 10268 B; screenshot 0 B; product JS+CSS 213912 B / gzip PROXY 67054 B; OCR assets 8123867 B

## 17. SIH SCORECARD
See docs/evidence/T019-T020-SCORECARD.md. No weighted winner score.

## 18. CLAIMS
See docs/evidence/T019-T020-CLAIMS-EVIDENCE.md

Generated from machine-readable JSON. Do not hand-edit numbers.
