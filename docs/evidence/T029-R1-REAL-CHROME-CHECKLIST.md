# T029-R1 — Real Chrome retest checklist

Cursor IDE browser **cannot** load this MV3 extension. Human Chrome required.

Automated T029-R1 completion does **not** make Scenario 08 `VERIFIED IN REAL RUNTIME`.

## Identity (fail the run if mismatch)

1. `git rev-parse HEAD` — the commit created by T029-R1 (see master report).
2. `cat apps/extension/dist/build-identity.txt` — must match Side Panel footer.
   - Expected after this repair build: `DEV • 64638ad*` · `Built 2026-09-05T07:02:05.247Z (uncommitted source)` **or a newer rebuild after the commit**. After commit, rebuild so the footer is not stale.
3. Reload unpacked `apps/extension/dist/`. True hot reload: **NO**.
4. Serve the portal: `python3 -m http.server 5173 --directory apps/test-portal` and also retest Scenario 08 via `file://` only with Chrome “Allow access to file URLs”.

Official FR1 rows in `docs/evidence/T027-T028-MANUAL-CHECKLIST.md` stay **HUMAN REQUIRED** until filled.

For every row: page truth, N-Eye status, View Report. If they disagree: **FAIL**.

| # | Flow | Expected | PASS | FAIL | Notes |
|---|---|---|---|---|---|
| RC01 | Selenium TYPE: Enter name in Text input | PASS | | | Preserve H01 |
| RC02 | Selenium TYPE→SUBMIT | PASS | | | Preserve H02 |
| RC03 | TYPE→CLICK Submit | PASS | | | Preserve H03 |
| RC04 | SELECT→CONTINUE (controlled fixture) | PASS | | | Preserve H04 |
| RC05 | Wikipedia **exposed** search + submit | PASS | | | Preserve H06 |
| RC06 | Wikipedia composite autocomplete / open named article | PASS only if one unique exact resource; else **safe ASK_USER**. Never wrong click. Never false complete. | | | No wikipedia.org expectation of always-click |
| RC07 | GitHub dynamic search (generic composite) | Improved SEARCH_COMMIT if a unique Search popup/control is observed; else safe ASK_USER. **Never** site-specific. Never blindly Enter. | | | No github.com adapter |
| RC08 | Scenario 08: Click the painted control on the canvas | **PASS requires:** local pixels/OCR evidence; unique visual surface grounded; actual click; green fixture success; fresh verify; VERIFIED COMPLETE; screenshot outbound 0 B; Report agrees (must not show naked task VERIFIED_SUCCESS on failure). Test http://localhost:5173 **and** file://. | | | Highest priority. UNVERIFIED until filled |
| RC09 | Scenario 09 held-out visual | Correct generalized action **or** justified ASK_USER per fixture semantics. No Scenario-08 overfit. | | | Do not inspect then hard-code |
| RC10 | Privacy email tokenize (Mock) | Email tokenized locally; screenshot not sent; Report without raw value. Does **not** prove live Remote. | | | Preserve H08 |
| RC11 | Empty password vs value | Sensitive **control** present; `valuePresent=false`; Report must not imply a password value existed. | | | |
| RC12 | Wrong-destination adversarial | Requested resource A, navigation evidence to unrelated B → task must **not** VERIFIED-COMPLETE. | | | |
| RC13 | ASK_USER → Continue | Continue is **not** Allow once / approval. | | | |
| RC14 | HIGH Allow once | Fresh re-grounding required. | | | |
| RC15 | Panel close/reopen / lifecycle | Fail closed or honest resume; no stale HIGH execute. | | | |

Mode: Mock first. Remote `/v1/plan` body capture only if gateway is up; plant synthetic canaries only.

## What this agent did not observe

No human filled RC01–RC15 during T029-R1. Scenario 08 Chrome remains **UNVERIFIED**.
