# T030 — Predictive defect ledger

Predicted live risks vs confirmed repairs. Prediction ≠ proof.

Classification: CONFIRMED DEFECT | PREDICTED RISK | DESIGN LIMITATION | SAFE ABSTENTION | POST-SIH

| ID | Module | Trigger | Why tests may miss it | Sev | Confidence | Reproduction | Root cause | Disposition | Fallback | Manual? |
|---|---|---|---|---|---|---|---|---|---|---|
| T030-F001 | trust-loop / report | Capture fail + visual required | Unit OCR_USED was recorded on `invoked`; Evidence source could say OCR | P1 | CONFIRMED | Capture throw, `ocrBlocks=[]` | Invoked ≠ OCR text | **Repaired** OCR_USED + perceptionSource from blocks | OCR_UNAVAILABLE, no OCR FACT | Chrome pixels |
| T030-F002 | trust-loop / status | OCR text, no unique bind | All fallbacks used OCR_UNAVAILABLE | P1 | CONFIRMED H06 | `GROUNDING_AMBIGUOUS` + unlabeled canvas | Collapsed fallback | **Repaired** ASK_USER VISUAL_UNBOUND | ASK_USER | Scenario 08 |
| T030-F003 | task-report | TYPE_TEXT success | Tests asserted click from any ACTION_EXECUTED | P1 | CONFIRMED | TYPE then report | Claim text vs action type | **Repaired** | N/A | Yes |
| T030-F004 | evidence ledger | Execute then cancel | Happy path always verified | P2 | CONFIRMED | Abort after dispatch | VERIFIED too early | **Repaired** RECORDED + may-have-executed | ASK_USER / cancel | SW kill |
| T030-F005 | task-report | Remote mode UI, no POST | `plannerMode === 'REMOTE'` | P1 | CONFIRMED | Gateway down after mode switch | Mode ≠ egress | **Repaired** | Screenshot NOT_VERIFIED | Remote UI |
| T030-P001 | executor | Sites ignoring untrusted KeyboardEvent | Node dispatches events | P2 | PREDICTED | YouTube search Enter | REC-035 | DESIGN LIMITATION | Unique CLICK or ASK_USER | YouTube |
| T030-P002 | observer | Closed shadow search icon | Open-shadow fixtures | P2 | PREDICTED | Closed-root host | REC-036 | DESIGN LIMITATION | Visual / ASK_USER | Real sites |
| T030-P003 | verifier | Click navigates to wrong site | Task arbiter only when hay present | P2 | PREDICTED / known T029-F010 | Generic CLICK + any URL | Action-level any origin change = success | Leave action-level OBSERVED navigation; task-level hay for SEARCH | PARTIAL on search hay miss | Adversarial nav |
| T030-P004 | background | SW killed mid-HIGH | Hydrate unit tests | P2 | PREDICTED | chrome://serviceworker-internals | REC-046 | Fail closed, lose progress | No stale execute | Yes |
| T030-P005 | confirmation | Allow once then SPA remint two equivalents | Unique-equivalent tests exist | P2 | PREDICTED | Two Search buttons after approve | Ambiguity fail-closed | Existing | ASK_USER | Wikipedia |
| T030-P006 | detectors | Bare 10-digit 6–9 in prose | Dev corpus had structured phones | P2 | CONFIRMED on holdout | `Order 9876543210 shipped` | IN_MOBILE | **Not retuned** (REC-050/052) | TOKENIZE extra | Judge pages |
| T030-P007 | detectors | Hindi name label | English label regex | P2 | CONFIRMED on holdout | `नाम` | No Hindi labels | **Not retuned** | FN | Indic UI |
| T030-P008 | hit-test | Overlay covering control | `.click()` in happy-dom | P1 Chrome | PREDICTED H01 | Premium UI | Hit-testing vs DOM click | Existing hit-test; Chrome still required | ASK_USER | Overlay sites |
| T030-P009 | OCR | DPR/zoom after R1 bind | Fixture identity scale | P2 | PREDICTED | Zoomed canvas | Buffer→CSS scale | R1 transform exists; Chrome UNVERIFIED | ASK_USER | Scenario 08 zoom |
| T030-P010 | TaskGraph | Interpreter vs graph drift later | Reliability N=8 agreed | P3 | PREDICTED | New MULTI_STEP family | Graph not loop driver | T031/T032 decision | Arbiter remains authority | No |
| T030-P011 | overlay | `confirmationId` in overlay paint | No exploit this pass | P3 | PREDICTED | Modified content script | REC-020 | POST-SIH | Owner-document confirm | Red team |
| T030-P012 | gateway | CORS `*` | Local-only tests | P3 | PREDICTED | Non-local deploy | REC-008 | POST-SIH | Fail closed locally | Ops |
| T030-P013 | LOW retry | Execute OK, verify timeout, LOW risk | HIGH no-replay tested | P2 | PREDICTED | Flaky observe | Duplicate LOW click | Recovery budget 3 / identical fail 2 | ASK_USER | Dynamic pages |
| T030-P014 | Remote | Provider JSON drift | Schema coerce tests | P2 | PREDICTED | New Gemini thought-part | Parse still untrusted | Fail closed extras | ASK_USER | Live model |
| T030-P015 | dist | Stale unpacked load | Docs only | P2 | CONFIRMED at T030 start | Dist SHA ≠ HEAD | No HMR | Identity test when dist present | Footer `*` | Reload |

Chrome owner loop can still disagree with Node PASS. Do not call REAL CHROME VERIFIED from this file.
