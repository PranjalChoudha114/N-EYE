# T029 — Real Chrome acceptance checklist

Cursor IDE browser **cannot** load this MV3 extension. Human or dedicated Chrome profile required.

**Identity before any PASS:**

1. `git rev-parse HEAD` → `64638ad42da2fa401fa2f471d4f39e116770380f` or a later **commit** if you commit.
2. `cat apps/extension/dist/build-identity.txt` → `DEV • 64638ad*` and timestamp **`Built 2026-09-05T05:17:41.318Z (uncommitted source)`** (or newer rebuild).
3. Side Panel footer matches that identity.
4. Reload unpacked `apps/extension/dist/` after every rebuild. True hot reload: **NO**.

Official FR1/Selenium/YouTube/Scenario 08 rows remain in `docs/evidence/T027-T028-MANUAL-CHECKLIST.md`. Those PASS/FAIL cells are **empty**. **HUMAN EVIDENCE REQUIRED.** Do not copy Node Judge-Kill 123/123 into those cells.

## Compact T029 add-on (all HUMAN REQUIRED until filled)

For every row: record page truth, N-Eye status, View Report result. If they disagree: FAIL.

| # | Flow | Must prove | PASS | FAIL |
|---|---|---|---|---|
| T029-C1 | Overlay **Run** on test-portal | User gesture starts Mock loop; no crash | | |
| T029-C2 | **More** → Side Panel | Panel opens; same task; footer identity | | |
| T029-C3 | Selenium-like form TYPE only | Field filled; **not** whole-form complete | | |
| T029-C4 | TYPE → SUBMIT | Type then submit; Complete only if both verified | | |
| T029-C5 | TYPE → **CLICK Continue** | Continue actually clicked; type-only is PARTIAL | | |
| T029-C6 | SELECT → continue | Option selected then Continue; select-only not complete | | |
| T029-C7 | Dynamic id remint | Click still unique or ASK_USER; no false complete | | |
| T029-C8 | HIGH confirmation | Allow once / Don't allow / dismiss; mutation invalidates | | |
| T029-C9 | ASK_USER → Continue | Fresh loop; not Allow once | | |
| T029-C10 | Visual-only Scenario 08 | Local OCR; no hardcoded coordinates | | |
| T029-C11 | Empty password / OTP field | Report: control ≠ leaked value | | |
| T029-C12 | Privacy vs Report | DETECTED/PROTECTED/SENT agree with Technical details | | |
| T029-C13 | View Report vs page | Success / partial / blocked / failed / cancelled | | |
| T029-C14 | Unknown site (Wikipedia or GitHub) | Unique or ASK_USER; no site selector | | |
| T029-C15 | Side Panel close/reopen mid-task | Fail closed or honest resume; no stale HIGH execute | | |

Mode: Mock first. Repeat a protected task in Remote only if planner-api is up; then capture that the outbound body has no planted canaries.

## What this gate did **not** observe

No human filled the FR1 checklist during T029. No Chrome Side Panel E2E was executed by this agent. Overlay pointer-events / z-index were inspected in source and existing overlay tests (**TESTED** in happy-dom), not in Chrome.
