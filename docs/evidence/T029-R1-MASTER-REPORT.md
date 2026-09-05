# T029-R1 — Master report

**Verdict: CONDITIONAL PASS**

Automated gates: PASS. No confirmed P0. Supported-path P1s repaired in source and **TESTED** in Node/happy-dom. Scenario 08 / Wikipedia composite / GitHub dynamic / live Remote remain **HUMAN REQUIRED** or **ENVIRONMENT BLOCKED**. T030 **not** started. SIH freeze **not** declared.

## 1. Repository identity before repair

| Item | Value |
|---|---|
| HEAD | `64638ad42da2fa401fa2f471d4f39e116770380f` |
| Branch | `main` tracking `origin/main` |
| Remote | `https://github.com/PranjalChoudha114/N-EYE.git` |
| Tree | dirty — T025–FR1 + T029 + R1 (uncommitted) |
| Dist (T029) | `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z (uncommitted source)` |
| Dist (after R1 rebuild) | `DEV • 64638ad*` · `Built 2026-09-05T07:02:05.247Z (uncommitted source)` |

## 2. Human findings ingested

H01–H04 PASS preserve. H05 SAFE ABSTENTION + ranking. H06 PASS. H07 SEARCH_COMMIT gap / safe abstention. H08 Mock privacy PASS. H09 Scenario 08 P1.

## 3. Root cause — Scenario 08

OCR **did** run. The earliest wrong transition was **`groundAndFuse` refusing to bind a contained word box to the unique canvas** because IoU/center-distance failed. Downstream ASK_USER was correct given an unlabeled canvas.

## 4. Scenario 08 repair

Files: `perception/grounding.ts`, `perception/orchestrator.ts`, `content/observer.ts`, `planner/mock-grammar.ts`, `planner/deterministic-planner.ts`.

Old: IoU or near-center only. New: confidence-aware VisualBindingScore + uniqueness margin + ROI owner + CSS↔buffer scale. Generalized to any painted canvas/img. Safe: unlabeled / two-equivalent / occluded / stale epoch still abstain. No CONTINUE / scenario-08 / coordinates.

## 5. Semantic affordance

Wikipedia: exact AccName uniqueness; else ASK_USER. GitHub-class: popup Search option is SEARCH_COMMIT. Site names absent.

## 6. Privacy / Report / F010

Empty password = control, not value. Phone: structured/context; ISBN/10-digit IDs not US phones; IN_MOBILE independent. Report: ASK_USER must not show naked task VERIFIED_SUCCESS. Task arbiter refuses search/open complete when destination hay omits the query/resource.

## 7. Unknown defects

See `T029-R1-FORENSIC-LEDGER.md`. Second pass **did** find issues (F001–F009, shadow ownerDocument). Not “none”.

## 8. Automated results

See `T029-R1-POST-REPAIR-EVALUATION.md`: 27 / **545** / 47; bench 123/123; original holdout JSON preserved.

## 9. Real Chrome

`T029-R1-REAL-CHROME-CHECKLIST.md` RC01–RC15. **HUMAN REQUIRED.**

## 10. Live Remote

UNVERIFIED / ENVIRONMENT BLOCKED (`ECONNREFUSED :8000`). Mock is not a substitute.

## 11. Stop

Do not start T030 until the human returns RC08 (and material RC06/RC07) evidence.
