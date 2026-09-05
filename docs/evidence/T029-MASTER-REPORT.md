# T029 — Master report

National Judge-Kill exam + whole-codebase forensic audit + evidence-gated repair.

**Verdict:** CONDITIONAL PASS (engineering/audit/repair/regression/corpus). **Not** a competition freeze. T030 not started.

**Identity**

| | |
|---|---|
| HEAD | `64638ad42da2fa401fa2f471d4f39e116770380f` |
| Tree | dirty (T025–T029 uncommitted) |
| Dist | `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z (uncommitted source)` |
| OS | Darwin 25.6.0 arm64 · macOS 26.6 (25G72) |
| Hardware | Apple M5 · 24 GB (25769803776 B) |
| Tooling | Node v26.7.0 · pnpm 11.24.0 · Python 3.14.6 |
| Commit / push / tag | **NO / NO / NO** |

**Precondition:** `docs/evidence/T027-T028-MANUAL-CHECKLIST.md` exists with **empty** PASS/FAIL. HUMAN EVIDENCE REQUIRED. T029 did not fabricate Chrome PASS.

## Audited subsystems (code + control flow)

Protocol, identifiers/fingerprints, RawScene, observer, registry, PageEpoch, frames, AccName/role (HTML subset), adaptive perception, ROI/OCR lifecycle (inspect), visual grounding/privacy, detectors/policy/minimization, vault/token scope, SafeContext, EgressGuard, planner manager, deterministic/Mock, NI/NALIS interpreter + TaskGraph (exists; **not** trust-loop driver), session memory, remote planner + gateway schema + adapters + prompt + proposal gate, validator, risk, confirmation, re-grounding, TOCTOU, executor, hit-test, verifier, completion arbiter, recovery/cancel, SW/Side Panel/overlay (source + unit), View Report/ledger, privacy receipt, benches, fixtures, build identity, secret handling (no keys in client), docs vs source.

## Judge-Kill

Corpus `t029-judge-kill/1`: **123** cases (91 development / 32 frozen holdout). Categories A–Q present. **91/91 and 32/32 TESTED** Node/happy-dom this run. Holdout frozen before scoring. No pre-repair holdout number (corpus new). Not Chrome E2E.

## Metrics (this run)

| Metric | Result | Class |
|---|---|---|
| Judge-Kill verified contract pass | 123/123 | TESTED (not Chrome task success) |
| False-completion harness fails | 0 | TESTED |
| Wrong-action Chrome rate | not measured | UNVERIFIED |
| Correct abstention | encoded as ASK_USER / UNSUPPORTED / vault deny cases in corpus | TESTED contracts |
| Privacy canary (unit channels) | existing canary suites PASS; live HTTP body not captured | TESTED / ENVIRONMENT BLOCKED |
| T027 PII P/R/F1 | historical T027 MEASURED; tests still pass; not re-written | TESTED pack |
| Visual Chrome | Scenario 08 HUMAN REQUIRED | UNVERIFIED in Chrome |
| Observer p50/p95 | 6.68 / 12.09 ms (n=100 happy-dom) | MEASURED development |
| JS+CSS | 305117 B uncompressed this dist | MEASURED file sizes |

## Defects / repairs

P0: none confirmed.
P1 repaired: T029-F001…F008 (TYPE→CLICK, SELECT→CONTINUE, PRESS_ENTER click-complete, verifier churn, URL query, empty label-values, vault tabId).
Remaining: Chrome HUMAN REQUIRED, live Remote blocked, TaskGraph not loop driver, any-URL-change success, known platform limits.

## Fresh automated (this T029 execution)

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`real-gemini-integration.test.ts` console) |
| protocol | 27 passed |
| extension | 523 passed (91 files) |
| planner-api pytest | 47 passed |
| `pnpm build:extension` | PASS |
| `pnpm bench:t029` | 2 passed; wrote `bench/judge-kill/t029-judge-kill.json` |
| Live Gemini | skipped ECONNREFUSED :8000 |

## Architecture

No SafeContext/EgressGuard weakening. No cloud screenshots. No site-specific production selectors. No new Chrome permissions. No local LLM. No vault persistence. No T030 freeze.

## Final sentence for this artifact

T029 NOT CLOSED — BLOCKERS: HUMAN CHROME FR1, LIVE REMOTE NETWORK PROOF, MULTI-MACHINE / CLEAN-PROFILE, CLEAN GIT / RELEASE FREEZE.

See `docs/evidence/T029-T030-RESIDUAL-CHECKLIST.md`.
