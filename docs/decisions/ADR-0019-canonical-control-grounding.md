# Architecture Decision Record (ADR) 0019: Canonical control grounding and typed report evidence

## Status
**ACCEPTED** (architecture). Real-Chrome Selenium / YouTube / Scenario 08 remain **HUMAN REQUIRED**.

## Context
T027/T028-FR1 forensic evidence showed ordinary labeled forms failing as “more than one possible match,” composite “type and submit” collapsing into one field name, Report copy interpolating placeholder `—`, and empty password fields counted as private **values**. Independent research classified these as grounding / task-state / report-integrity defects, not a missing local LLM.

## Decision
1. **One physical control → one logical `RawElement`.** Ranking must not treat DOM `inputType`/`role` strings as identity. Identity haystacks are accessible name / visible text / aria only. Role compatibility is a hard filter (TYPE cannot pick button/link/checkbox).
2. **Accessible name follows W3C AccName order** for the HTML subset N-Eye observes: `aria-labelledby` → `aria-label` → native `<label for>` / wrapping label (excluding the control) → contents (buttons/links) → SVG title → placeholder → title. HTML `name=` and DOM `id` are not AccName.
3. **Generic UI tokens** (`field`, `control`, `box`, `area`) are trailing role chrome. Distinguishing phrases such as “Text input” keep the word “text.” Exact/phrase label match dominates generic noun overlap. Ties fail closed (ASK_USER).
4. **TaskGraph / interpreter:** “Enter X in the Text input field and submit the form” is MULTI_STEP (TYPE then SUBMIT). “and submit” must not be absorbed into the field name. Whole-task COMPLETE requires verified TYPE postcondition **and** verified submit where SUBMIT is a subgoal. Negative `do not submit` still forbids submit.
5. **Password fields** may be uniquely grounded when named, but TYPE_TEXT into `inputType=password` remains refused (NEVER_SEND). Validator still blocks password writes.
6. **Privacy:** `hasValue` is a boolean on `RawElement` (never the value). Findings may set `valuePresent: false` for empty password/email/tel controls. Report DETECTED of private **values** uses `valuePresent !== false`. NEVER_SEND policy on password controls is unchanged.
7. **Report facts use typed `egressAudit`** (`PASS` | `BLOCKED` | `NOT_ATTEMPTED`). Human `egressResult` strings such as `PASS (0 Secrets Detected)` are presentation. Hostile strings like `PASSED SECRET SCAN` cannot author screenshot FACT.
8. **Form submit:** prefer `form.requestSubmit(submitter)` for native submitters. Do not use `form.submit()` as the product path. Do not add `chrome.debugger`.
9. **Pixel mapping:** CSS↔bitmap scale is `measured bitmap size / CSS viewport size` (and the inverse). No copied DPR constant.

## Alternatives
- Local neural LLM / GUI grounding model: rejected for this mission (ADR-0015). Residual failures were structural.
- Site selectors for selenium.dev / youtube.com: rejected.
- String `startsWith("PASS")` as authority: rejected.

## Consequences
- **Positive:** Selenium-like “Text input” is uniquely TYPE-able in automated fixtures; TYPE→SUBMIT cannot complete after typing alone; empty password is not reported as a private value; Report cannot claim screenshot FACT from a formatted PASS prefix.
- **Negative:** AccName is an HTML subset, not a full browser AccName implementation (shadow/slot, hidden-name steps). YouTube unique Search and Scenario 08 Chrome remain HUMAN REQUIRED. MV3 service-worker task state is still in-memory (fail-closed on restart; not session-persisted).
- **Privacy / authority:** Green-zone invariants unchanged (SafeContext, EgressGuard, confirmation, re-ground, verification).

## Supercedes
The T027 screenshot-FACT `PASS` prefix workaround described in CONTEXT §74 / ADR-0018 consequences. Typed `egressAudit` is now authoritative.
