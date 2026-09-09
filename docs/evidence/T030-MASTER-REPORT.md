# T030 — Master report

**Gate:** T030 Core Truth / Accuracy / Reliability Certification  
**Not:** T031 (persistence) or T032 (release freeze)  
**Date:** 2026-09-09  
**Parent HEAD before this gate:** `7bca2ec4f1946020d11428a38d74a11448039c08` (T029-R2)  
**Working tree during measurement:** dirty (this gate)  
**Dist at measurement:** `DEV • 7bca2ec*` · `Built 2026-09-09T06:56:35.098Z (uncommitted source)`  
**Hardware:** Apple Silicon arm64 · RAM 24 GB (`25769803776`) · Darwin 25.6.0 · macOS 26.6 · Node v26.7.0 · pnpm 11.24.0 · Python 3.14.6  
**Verdict:** **CONDITIONAL PASS (automated).** Chrome Side Panel / Scenario 08 owner loop remains **HUMAN REQUIRED**. T031 must not start until the human reviews this pack.

No single “accuracy %” is published. Claims are bound to `docs/evidence/T030-ACCURACY-CERTIFICATE.json`.

---

## 1. Repository identity

| Item | Before T030 edits | After T030 automated work (pre-commit) |
|---|---|---|
| Branch | `main` tracking `origin/main` | same |
| HEAD | `7bca2ec` T029-R2 | same until commit |
| Working tree | clean | dirty (this gate) |
| Dist | **STALE** `DEV • cdddfef*` (T029-R1 dirty) vs HEAD `7bca2ec` | rebuilt `DEV • 7bca2ec*` |

T029-R1 `cdddfef` and T029-R2 `7bca2ec` were verified in git history. Dist/source mismatch at T030 start was a real evaluation-hygiene defect (REC-026 class). Rebuild + `t030-forensic` identity test now fail the suite when an unpacked dist SHA disagrees with HEAD.

---

## 2. Architecture truth (source, not slides)

PAGE → local observe → optional on-device OCR → privacy/vault → SafeContext → EgressGuard → Mock or Remote planner → untrusted ActionProposal → local validate/risk/confirm → semantic re-ground → native execute → fresh observe → verify → completion arbiter → evidence ledger → View Report.

TaskGraph exists and is tested. The production trust loop still drives completion via interpreter + Mock grammar + arbiter. T030 compared TaskGraph subgoals to `interpretGoal` on the reliability corpus: **0 disagreements**. Not wired as the loop driver (T029-F009 / T030-P2). Not a proven first-incorrect-transition today.

---

## 3. Independent defects (human did not file these)

| ID | Sev | Class | First incorrect transition | Repair |
|---|---|---|---|---|
| T030-F001 | P1 | CONFIRMED | `perception.invoked` recorded `OCR_USED` even when capture threw and `ocrBlocks.length === 0`. Report could FACT “read visible text” after capture failure. Evidence `perceptionSource` could say `OCR` with zero blocks. | Record `OCR_USED` only when OCR produced blocks. Evidence source is FUSED/OCR/DOM from fusion+blocks, not invoke. |
| T030-F002 | P1 | CONFIRMED H06 | Visual-required + no structure + `GROUNDING_AMBIGUOUS` applied phase `OCR_UNAVAILABLE` / “Could not read visible text” even if OCR text existed. SYSTEM ERROR vs OCR FACT contradiction. | `VISUAL_UNBOUND` ASK_USER; capture/timeout/load stay `OCR_UNAVAILABLE` with distinct copy. |
| T030-F003 | P1 | CONFIRMED | Any `ACTION_EXECUTED` authored claim “authorized click”, including TYPE. | Click claim requires `proposalType === 'CLICK'`. TYPE is not a click fact. |
| T030-F004 | P2 | CONFIRMED | `ACTION_EXECUTED` stored `status: 'VERIFIED'` at dispatch, before post-state verification. | Record as `RECORDED`. Abort after dispatch records `FALLBACK_USED` `action-may-have-executed-before-verify`. |
| T030-F005 | P1 | CONFIRMED | Screenshot FACT used `plannerMode === 'REMOTE'` as if a remote request happened. | Screenshot PROVEN requires ledger `REMOTE_INTELLIGENCE_USED` + `PROTECTED_CONTEXT_CREATED` + `egressAudit === 'PASS'` + 0 screenshot bytes. |

No confirmed P0 (no RawScene/screenshot/OCR cloud egress, vault dump, or arbitrary JS execute path proven).

Not repaired (holdout-measured, not retuned): IN_MOBILE FP on bare 10-digit order prose (`hold-order-10digit`); Hindi name label FN (`hold-hindi-name-label`). See REC-050 / REC-052.

---

## 4. Cross-gate defect table (canonical)

Historical H01–H07 remain adversarial evidence. IDs below are source-ledger IDs, not slides.

| ID | Gate | Class | Status |
|---|---|---|---|
| H01 | Human Chrome | Hit-test vs `.click()` | LIMITATION — Chrome HUMAN REQUIRED |
| H02 | Human Chrome | TYPE without submit → false COMPLETE | Repaired T029-F002 family; Chrome retest HUMAN |
| H03 | Human Chrome | Wikipedia MULTIPLE_CANDIDATES | SAFE ABSTENTION |
| H04 | Human Chrome | GitHub SEARCH_COMMIT | Affordance LIMITATION / ASK_USER |
| H05 | T029-R1 | Visual bind small OCR in large canvas | Repaired VisualBindingScore |
| H06 | T029-R1 / T030 | Capture/OCR vs grounding copy | T030-F001/F002 repaired |
| H07 | T029-R2 | Scenario 05 no postcondition | Fixture repaired; verifier honest |
| T029-F001–F008 | T029 | Interpreter/arbiter/verifier/vault | Repaired |
| T029-F009 | T029/T030 | TaskGraph not loop driver | LIMITATION — no FIT on N=8 |
| T029-F010 | T029/T030 | Action-level any URL success | LIMITATION — task hay for SEARCH |
| T029-F014 | T029 | Live Remote ECONNREFUSED | T030: live Gemini canary VERIFIED this machine |
| T030-F001–F005 | T030 | OCR claim / unbound / TYPE-as-click / early VERIFIED / screenshot mode | Repaired |
| T030 holdout FP/FN | T030 | IN_MOBILE 10-digit; Hindi NAME | Not retuned |

## 5. Prior gates

T025–T029 / R1 / R2 forensic IDs remain valid. T029-R2 fixture postcondition for Scenario 05 is preserved. Production verifier still refuses click-without-postcondition. Chrome RC08 / Scenario 05 owner retest still HUMAN REQUIRED.

Masterbook PDFs named in CONTEXT §0 were **not present** in this repository clone; T030 used source + accepted ADRs + fresh tests as truth.

## 6. Loops and idempotency (source)

| Loop | Bound | Exit |
|---|---|---|
| Trust-loop steps | `MAX_STEPS = 8` | Stop / ASK_USER |
| Planner transport | `PLANNER_MAX_ATTEMPTS = 3` | Classified error; same SafeContext only |
| Recovery | `MAX_RECOVERY_ATTEMPTS = 3` | Fail closed |
| Identical action failure | `MAX_IDENTICAL_ACTION_FAILURES = 2` | No click-until-something |
| Explore scrolls | `MAX_EXPLORE_SCROLLS` | Not completion (ADR-0016) |

HIGH + unverified: no auto-replay. Abort after dispatch records `action-may-have-executed-before-verify`. Uncertain HIGH retry → ASK_USER. LOW retry still predicted (T030-P013).

---

## 7. Automated counts (fresh this run)

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | 0 errors, 1 pre-existing `real-gemini-integration.test.ts` console warning |
| protocol | **27** passed |
| extension | **560** passed |
| planner-api pytest | **47** passed |
| `pnpm bench:t029` | 123/123 TESTED (dev 91, holdout 32, false-complete fails 0) |
| Observer 100-el | median 4.05 ms, p95 6.11 ms MEASURED (dev, this `pnpm test` run) |
| Live Gemini `/v1/plan` | **VERIFIED IN REAL RUNTIME** this machine: `real-gemini-integration.test.ts` 7176 ms (one 503 then retry SUCCESS); pytest `test_gemini_real.py` PASS. |
| Chrome Side Panel E2E | **UNVERIFIED** / HUMAN REQUIRED |

---

## 8. Do not start T031

No persistent chat, passcode, encrypted user vault, or cloud history was added.
