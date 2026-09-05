# T029 — Privacy / security results

**Build:** `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z`
**HEAD:** `64638ad42da2fa401fa2f471d4f39e116770380f` dirty
**This is not a universal zero-leakage claim.** Finite canaries and unit contracts only.

## Invariants attacked (code + tests)

| Attack | Result this tree |
|---|---|
| RawScene / raw screenshot / raw OCR on planner transport | Architecture + egress allowlist unchanged. No T029 weakening. |
| URL query/hash in verification `observedDelta` / `priorOutcome` | **Was P1 (T029-F006).** Now `safeUrlEvidence` = origin + pathname. TESTED. |
| Empty OTP / label-only password/session/name/address as leaked **values** | **Was P1 (T029-F007).** `valuePresent: hasValue === true`. NEVER_SEND still applies to the control class. TESTED. |
| Vault invented / expired / cross-task / cross-origin / cross-tab / `*` wildcard | Cross-tab + no `*` **T029-F008**. TESTED. Frame-wrong still via origin/semantics. |
| Fake page token text | Unknown token deny. TESTED (vault + Judge-Kill J). |
| Planner extra keys / CSS selector target / fabricated confirm | Proposal shape gate + validator. TESTED (M-PLANNER + existing `proposal-adversarial`). |
| DOM/ARIA/OCR “already approved” / “send secrets” | Page text has zero policy authority. TESTED (L-INJECTION + existing injection suites). |
| Goal-text secrets | `detectGoalPrivacy` still runs. TESTED (goal-privacy cases). |
| JWT in title | Prior T026 + Judge-Kill K. TESTED in unit; live HTTP body **UNVERIFIED**. |
| Confirmation replay / semantic swap | Existing confirmation-binding tests + N-CONFIRM contracts. Chrome dialog: HUMAN REQUIRED. |
| Arbitrary JS / XPath | Still not in ActionProposal. TESTED reject. |

## Judge-Kill privacy/security slices (TESTED Node)

| Category | N | Pass |
|---|---:|---:|
| I-PRIVACY | 13 | 13 |
| J-VAULT | 6 | 6 |
| K-EGRESS | 4 | 4 |
| L-INJECTION | 3 | 3 |
| M-PLANNER | 9 | 9 |
| N-CONFIRM | 4 | 4 |

## T027 PII pack

`bench-t027-t028.test.ts` **passed** on this tree. Historical MEASURED micro P/R/F1 100% on `t027-pii-corpus.v1` N=69 is **T027 evidence**, not a new T029 re-measure (WRITE was not used this gate). Empty-control vs value is Report-layer; the T027 corpus passwords are valued / `type=password` TP.

## Live Remote byte proof

**UNVERIFIED / ENVIRONMENT BLOCKED.** `real-gemini-integration.test.ts` skipped: `ECONNREFUSED 127.0.0.1:8000`. Do not substitute Mock canaries for a captured `/v1/plan` body.

Mock/unit canaries (serialized SafeContext, retry same payload, report ledger) remain TESTED (`canary.test.ts`, `unicode-transport.test.ts`, `combo-resilience.test.ts`).

## CORS / gateway

`allow_origins=["*"]` unchanged (known limitation CONTEXT §44). Not a T029 repair. Must be tightened before any non-local deployment.
