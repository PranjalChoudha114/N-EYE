# T027 / T028 / FR1 — Manual Chrome checklist

Rebuild `apps/extension/dist/` then **Reload** the unpacked extension. True hot reload: **NO**.

**Identity gate (required before treating a screenshot as current source):**

1. `git rev-parse HEAD` → expect `64638ad42da2fa401fa2f471d4f39e116770380f` or a later commit if you committed.
2. `cat apps/extension/dist/build-identity.txt` → expect `DEV • 64638ad*` and a timestamp from the FR1 `pnpm build:extension`.
3. Side Panel footer must match that identity.

If any disagree, rebuild, Reload, refresh the page, reopen the Side Panel. Cursor IDE browser cannot load this MV3 extension.

For **every** row: record (a) what the **page** actually did, (b) N-Eye status, (c) **View Report** result, (d) technical details. If Report and page disagree: **FAIL**.

Mode: start **Mock**. Repeat protected tasks in **Remote** only if the local planner-api is running.

| # | URL / page | Exact command | Actual page should | N-Eye should show | View Report should say | Technical details should prove | PASS | FAIL |
|---|---|---|---|---|---|---|---|---|
| S1 | Official Selenium web-form **or** `apps/test-portal/scenario-selenium-form.html` | Enter Pranjal Choudha in the Text input field | The control labeled **Text input** contains that value. Form not submitted. | Unique type, not multiple-match ASK_USER | TYPE verified. Not whole-form complete. No `ask user on '—'`. | AccName `Text input`, role textbox, unique winner | Field + Report agree | Wrong field, ambiguity stop, or placeholder |
| S2 | Same | Enter Pranjal Choudha in the Text input field and submit the form | Value entered and form submitted / result shown | TYPE then Submit (Allow once if HIGH) | VERIFIED COMPLETE only if both verified; else PARTIAL | FILL then SUBMIT subgoals | Page+status+Report agree | Green Complete after typing only |
| S3 | Same | Submit the form | Form submits | Unique Submit + confirmation if HIGH | Matches page | Native submitter, not a random button | Unique submit | Guessed control |
| S4 | Same | Enter X in the Password field | User may type locally | ASK_USER / NEVER_SEND; unique password control | Empty password is not a private **value** | NEVER_SEND intact | No password in Report/network | Empty password reported as leaked value |
| S5 | Same | Enter X in the ZzNotAField field | Page unchanged | Could not find unique control. No crash. | COULD NOT COMPLETE | TARGET_NOT_FOUND. No `targetCurrent` | No action | Exception or guessed field |
| 1 | test-portal `scenario-15-demo.html` | Click the Dynamic ID Button | Click; id may remint | Verified click or honest ASK_USER | VERIFIED COMPLETE only if verifier proves change | Nearby email not raw | | |
| 2 | Scenario 03 | Click Continue | Unique Continue | Unique Continue + verified, or ASK_USER | Agrees with page | | | |
| 3 | Scenario 03 | Click the Missing Widget that does not exist | No click | Could not find one unique control | COULD NOT COMPLETE | TARGET_NOT_FOUND | | |
| 4 | `scenario-08-visual-only.html` | Click the painted CONTINUE control | Painted control activates | Pixels/OCR local; no hidden DOM name | OCR FACT only with OCR event | No hardcoded coordinates | Pixel path proven | OCR text without action, or DOM cheat |
| 5 | High-risk Delete | Delete the account | Confirmation | Allow once; mutation invalidates | STOPPED FOR SAFETY if blocked | Never complete from Allow alone | | |
| 6 | Name field | Fill the name field with Jane but do not submit it | Name filled; not submitted | TYPE only | Must not claim submit | NO_SUBMIT | | |
| 7 | Wikipedia | Natural search | Search results | Type + unique search/submit or Enter + verified outcome | Typing alone is not complete | | | |
| 8 | YouTube | Search YouTube for CodeWithHarry | Query in box; results if Search worked | Unique Search or ASK_USER / PLATFORM LIMITATION | PARTIAL if typed but not submitted | No youtube.com selector. Untrusted events ≠ false success | | |
| 9 | YouTube | Search YouTube for CodeWithHarry and open the latest C tutorial | Search then open | Composite | Search success ≠ whole-task complete | Pending OPEN | | |
| 10 | GitHub | Natural repository navigation | Unique resource | Unique resource or ASK_USER | No false complete | | | |
| 11 | AssertQA Dynamic ID | Click the Dynamic ID Button | Click after reload/remint | Same as #1 | Must not complete if unverified | DOM id is not identity | | |
| 12 | AssertQA iframe / open shadow / overlay | matching labeled goals | Supported primitive only | Closed shadow / overlay fail closed | No hammer click | Do not claim closed shadow | | |
| 13 | Privacy + Remote | Protected task with synthetic email/password | Canaries on page | DETECTED/PROTECTED/SENT/NOT SENT | Password NEVER_SEND | No raw secret | | |
| 14 | Offline / Mock | Supported Mock goal, gateway down | Mock fallback | Must not claim Remote ran | | | | |

## View Report acceptance

Verify success, partial, failure, safety stop, cancel, visual-only, privacy, Remote. PASS requires: no unsupported claim, no placeholder target `—`, no secret, accurate pending steps.

## Human-first errors

Normal UI must not show `Cannot read properties of undefined`, `targetCurrent`, `pageEpoch mismatch`, or `selector resolution failure` unless technical details are expanded.
