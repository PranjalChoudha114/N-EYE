# T030 — Claim registry (judge-facing)

Vocabulary: VERIFIED FACT | MEASURED RESULT | TESTED | IMPLEMENTED | LIMITATION | UNVERIFIED | TARGET | POST-SIH

| Claim | Classification | Evidence |
|---|---|---|
| Passwords/OTP/API keys/JWTs are NEVER_SEND on N-Eye’s planner path | VERIFIED FACT (tested path) | Detectors/policy + canary suites + live Gemini serialized SafeContext this run lacked `REAL_TEST_PASSWORD_X7K92` |
| SafeContext is the sole planner egress contract | IMPLEMENTED + TESTED | EgressGuard + schema forbid extras |
| Screenshots are not sent on the normal planner path | MEASURED RESULT | `screenshotOutBytes=0`; screenshot Report FACT only with Remote ledger + egress PASS |
| “No screenshot is ever sent anywhere” | FORBIDDEN / LIMITATION | OS/Chrome capture APIs exist locally; claim is N-Eye planner egress only |
| N-Eye is 90% / 80% / 60% accurate | FORBIDDEN | No single accuracy number. See Accuracy Certificate |
| Report is 100% correct always | FORBIDDEN | Allowed: 100% supported factual claims on report-truth corpus v1 N=10 |
| Works on every website | FORBIDDEN | Unknown-site = correct action or ASK_USER |
| 100% secure | FORBIDDEN | |
| Remote AI never receives raw secret X | MEASURED this run for synthetic email/password canaries on live Gemini | `real-gemini-integration.test.ts` + `test_gemini_real.py` 2026-09-09. Not a universal OS proof |
| TaskGraph drives the live trust loop | LIMITATION | Implemented and unit-tested; not called from `trust-loop.ts` |
| Visual fixtures cascade/OCR/grounding 7/7 | MEASURED | Tesseract fixtures; Wilson 64.6–100% at N=7. Chrome Scenario 08 HUMAN REQUIRED |
| PII development micro F1 100% | MEASURED | t027-pii-corpus.v1 N=69 hash `63a35cd3f367227c` |
| PII holdout micro F1 95.2% | MEASURED | t030-pii-holdout/1 N=28 hash `c8cbd92d2f717e21`; FP order-10digit; FN Hindi name label. Not retuned |
| Judge-Kill 123/123 | TESTED | Node/happy-dom `t029-judge-kill/1`. Not Chrome E2E |
| Chrome Side Panel page↔report agreement | UNVERIFIED | `T030-REAL-CHROME-CHECKLIST.md` |
| T031 persistent memory / passcode | POST-SIH / not this gate | Not implemented |
