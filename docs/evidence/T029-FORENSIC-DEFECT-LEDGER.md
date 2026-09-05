# T029 — Forensic defect ledger

**Build:** `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z (uncommitted source)`
**HEAD:** `64638ad42da2fa401fa2f471d4f39e116770380f` (dirty T025–T029 working tree)
**Classification vocabulary:** CONFIRMED DEFECT | PROBABLE DEFECT | DESIGN LIMITATION | EXPECTED SAFE ABSTENTION | TEST DEFECT | DOCUMENTATION DRIFT | PERFORMANCE OPPORTUNITY | POST-SIH | NOT A BUG

Repairs are generalized. Production must not special-case holdout labels.

---

## P0

None confirmed this gate. No RawScene/screenshot/OCR cloud egress, vault dump, confirmation mint, or arbitrary JS/CSS/XPath execute path was proven.

---

## P1 — repaired this gate

| ID | Repair | Class | First incorrect transition | Controlling module | Generalized fix | Regression |
|---|---|---|---|---|---|---|
| T029-F001 | T029-R1 | CONFIRMED DEFECT | `"Enter Jane in the name field and click Continue"` did not split. Field name absorbed `click Continue`. | `goal-interpreter.ts` `parseMultiStep` | After `and submit` / `and then`, split `\s+and\s+(?:then\s+)?((?:click\|submit\|continue\|select)\b.*)$` unless the goal starts with search/find/look up/open/go to/navigate/visit. Preserve `optionText` on MULTI_STEP compose. | `goal-interpreter.test.ts`, `t029-repairs.test.ts` R1 |
| T029-F002 | T029-R1b / arbiter | CONFIRMED DEFECT | After split, TYPE MATCHED still completed because remaining `ACTIVATE_TARGET` was ignored. | `completion-arbiter.ts` | `needsTailActivate` for remaining `ACTIVATE_TARGET` / `PROVE_ACTIVATION` / `CONTINUE`. TYPE MATCHED alone → PARTIAL. | `completion-arbiter.test.ts` |
| T029-F003 | T029-R5 | CONFIRMED DEFECT | `"Select India and continue"`: tail is RECOVERY `CONTINUE`, not `ACTIVATE_TARGET`. Mock mapped MULTI_STEP without query to `click_labeled`. Planner completed after SELECT. | `mock-grammar.ts`, `deterministic-planner.ts`, arbiter | MULTI_STEP + `optionText` + no `queryText` → `select`. After verified SELECT, unique tail CLICK else ASK_USER. Remaining `CONTINUE` unfinished. | `t029-repairs.test.ts` R5 |
| T029-F004 | T029-R1 PRESS_ENTER | CONFIRMED DEFECT | `arbitratePlannerComplete` treated `PRESS_ENTER` + `verifiedSearchOutcome` as COMPLETE before click-intent checks. `"Click Continue"` + Enter + nav = false complete. | `completion-arbiter.ts` | Search-submit still first. PRESS_ENTER + nav may complete type+submit only. Unrelated click goals stay PARTIAL/ASK_USER. | `completion-arbiter.test.ts` |
| T029-F005 | T029-R2 | CONFIRMED DEFECT | Opaque `eN` remint + control-set length change treated autocomplete churn as CLICK success. | `verifier.ts` | CLICK uses `matchLiveTargetBySemanticIdentity`. Unique gone → consumed success; 2+ → AMBIGUOUS; length change without target correlation → AMBIGUOUS. | `t029-repairs.test.ts` R2 |
| T029-F006 | T029-R3 | CONFIRMED DEFECT | `observedDelta` included full `postScene.url` (query/hash) and could enter `priorOutcome.summary`. | `verifier.ts` `safeUrlEvidence` | Origin + pathname only. | `t029-repairs.test.ts` R3 |
| T029-F007 | T029-R4 | CONFIRMED DEFECT | Label OTP / “password” / session / NAME / ADDRESS findings omitted `valuePresent` → report counted empty controls as values (`valuePresent !== false`). | `detectors.ts` | Label-semantic findings: `valuePresent: element.hasValue === true`. NEVER_SEND policy unchanged. | `privacy.test.ts` |
| T029-F008 | T029-R6 | CONFIRMED DEFECT | Vault stored `tabId` but did not check it. `allowed === '*'` was a semantic bypass. | `vault.ts`, `validator.ts`, `trust-loop.ts` | `resolve(..., tabId?)` cross-tab deny when provided. No `*` wildcard. Validator/trust-loop pass `tabId`. | `vault.test.ts` |

---

## P1 / P2 — remaining (not repaired)

| ID | Severity | Class | Finding | Disposition |
|---|---|---|---|---|
| T029-F009 | P2 | DESIGN LIMITATION | `TaskGraph` exists (`intelligence/task-graph.ts`) and is tested, but `trust-loop.ts` does not call `createTaskGraph` / `syncGraphFromRuntime`. Live completion is interpreter + Mock grammar + arbiter. | POST-SIH / REC. Wiring the graph as the loop driver is an architecture change. Not patched in T029. |
| T029-F010 | P2 | DESIGN LIMITATION | Verifier treats **any** origin or URL change as `VERIFIED_SUCCESS` (query/hash stripped from the string, not from the success predicate). Wrong destination can still look like success. | Recorded. Destination matching risks site-specific heuristics. REC-048. |
| T029-F011 | P2 | EXPECTED (settle) | `WAIT` returns `VERIFIED_SUCCESS` (“Bounded settle wait completed”). Trust-loop uses WAIT as settle, not as goal success. Arbiter does not complete on WAIT alone. | NOT A BUG for current contract. Do not treat WAIT as user-goal proof. |
| T029-F013 | P1 (release) | HUMAN REQUIRED | `docs/evidence/T027-T028-MANUAL-CHECKLIST.md` PASS/FAIL columns empty. Overlay/Side Panel/FR1 page↔report agreement UNVERIFIED. | T030 blocker. Do not fabricate Chrome PASS. |
| T029-F014 | P1 (release) | ENVIRONMENT BLOCKED | Live Gemini / `127.0.0.1:8000` `ECONNREFUSED`. Serialized `/v1/plan` body not captured this run. | LIVE REMOTE NETWORK PROOF = UNVERIFIED. Mock/unit canaries still TESTED. |

---

## P2 / P3 — classified, not auto-repaired

| ID | Severity | Class | Finding |
|---|---|---|---|
| T029-F012 | P3 | DOCUMENTATION DRIFT | `docs/PROTOCOLS.md` omitted `PRESS_ENTER` while `packages/protocol/src/action-proposal.ts` includes it. **Closed this gate:** PROTOCOLS action `type` union now lists `PRESS_ENTER`. |
| T029-F015 | P3 | TEST DEFECT | `jk-hold-11` original scorer expected UNSUPPORTED for painted-label Continue; interpreter correctly returns CLICK. **Expected** adjusted. Goal string unchanged. No production special-case. |
| T029-F016 | P2 | DESIGN LIMITATION | Judge-Kill corpus is unit/contract (interpret, arbiter, privacy, vault, proposal-reject, url-strip, report-phase). Geometry/frames/confirmation **Chrome semantics** are not proven by this harness. Existing hit-test / frames / confirmation tests remain separate. |
| T029-F017 | P2 | KNOWN | Closed shadow, untrusted KeyboardEvent Enter (REC-035), CORS `allow_origins=["*"]`, AccName HTML subset (REC-047), MV3 worker kill (REC-046). |
| T029-F018 | P3 | PERFORMANCE OPPORTUNITY | This-run observer 100-el bench: median 6.68 ms, p95 12.09 ms (happy-dom). T028 observation n=40 p50 5.68 p95 6.66. Different n and harness noise. MEASURE-FIRST. No T029 “optimization” applied. |
| T029-F019 | P3 | DOCUMENTATION DRIFT | CONTEXT §75 previously said “Do not start T029.” T029 ran with the FR1 human checklist still empty, as this prompt allowed, without fabricating Chrome PASS. |

---

## Sibling sweeps (bounded)

| Trigger | Siblings inspected | Result |
|---|---|---|
| TYPE→CLICK collapse | TYPE→SUBMIT (FR1), SELECT→CONTINUE, TYPE then PRESS_ENTER, search-then-open | SELECT→CONTINUE and PRESS_ENTER click-goal repaired. Composite search-open already split (T027). |
| Empty password vs value (FR1) | OTP, session, API-key type, email/tel empty, NAME/ADDRESS label findings, Report DETECTED | OTP/session/name/address `valuePresent` set. NEVER_SEND unchanged. |
| URL query in evidence | origin-transition delta, `priorOutcome`, SafeContext titles/visualHints (T026) | `safeUrlEvidence` on URL and origin deltas. Titles/hints already scrubbed. |
| Vault tabId unused | origin, task, expiry, invented token, `*` wildcard, validator tabId | tabId + no `*`. Frame-wrong still via origin/semantic, not a separate frame id on the vault. |
| Verifier remint | epoch-only, identity change, control-set length, TYPE/SELECT/SCROLL evidence-first | CLICK semantic-identity. TYPE/SELECT/SCROLL unchanged (evidence-first). |
| Report COMPLETE vs page | ASK_USER, PARTIAL, COMPLETED without verification, planner COMPLETE | Report classifier still requires local phase + evidence. Planner COMPLETE remains AMBIGUOUS in verifier. |

---

## What was investigated and not patched

- Overlay `confirmationId` display: no confirmed authority leak this pass.
- `WAIT` settle success: expected for bounded wait, not a goal COMPLETE author.
- Wiring TaskGraph into the trust loop: architecture, not a T029 bugfix.
- Wrong-destination URL: needs a destination contract without site lists — POST-SIH.
- Full W3C AccName / closed shadow / `chrome.debugger` Enter: REC only.
