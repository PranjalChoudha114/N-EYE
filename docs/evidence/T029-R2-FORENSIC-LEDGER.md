# T029-R2 — Forensic ledger (Scenario 05 privacy submit)

**Date:** 2026-09-08
**Parent HEAD:** `cdddfefea9f58eca2ebf4754ab5f9883704567d3`
**T030:** not started.

## Human observation

Goal: `Enter john.doe@company.org in the Direct PII Email Address field and submit the form` on `apps/test-portal/scenario-05-privacy.html`.

Privacy detection, email protection, NEVER_SEND for password/OTP/API key, CLICK on “Submit Test Context”, local CLICK execution, and honest COULD NOT COMPLETE all held. Verifier: no navigation, target consumption, or action-correlated state change.

## First incorrect transition

`apps/test-portal/scenario-05-privacy.html` form `onsubmit="event.preventDefault();"` — no result region, no control disable/relabel, no navigation. Email field already contained `john.doe@company.org`.

## Classification

**FIXTURE DEFECT.** Production `verifyActionExecution` and executor identity/semantic-shift proofs were correct. Click firing is not success.

## Repair

Fixture now behaves like sibling lab forms (scenario-06, scenario-12, index): same-document submit reveals a status region and disables/relabels the submit control. Production verifier unchanged.

## Sibling notes (not repaired)

| Case | Disposition |
|---|---|
| TYPE→SUBMIT with navigation | Existing verifier URL/origin path preserved |
| TYPE→SUBMIT without navigation + result/disabled control | Covered by fixture + R2-F002/F007 |
| CLICK with no state change | R2-F001 → `VERIFIED_FAILURE` |
| Unrelated DOM churn | R2-F001b → not `VERIFIED_SUCCESS` |
| Planner COMPLETE without postcondition | R2-F003 |
| Already-satisfied TYPE → remaining SUBMIT | R2-F004 |
| Privacy-tokenized TYPE→SUBMIT egress | R2-F005 |
| Scenario 13 preventDefault-only form | Resilience bench; not this demo path |

## Chrome

Scenario 05 submit retest HUMAN REQUIRED after reload of unpacked `apps/extension/dist/`. HIGH submit still needs Allow once.
