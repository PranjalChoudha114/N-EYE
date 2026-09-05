# T029 — Frozen holdout results

**Corpus:** `t029-judge-kill/1`
**Manifest freeze time:** 2026-09-05T04:56:00Z (`docs/evidence/T029-FROZEN-HOLDOUT-MANIFEST.md`)
**First scoring:** 2026-09-05T05:18:10.995Z (`bench/judge-kill/t029-judge-kill.json`)
**Build:** HEAD `64638ad42da2fa401fa2f471d4f39e116770380f` + dirty tree · dist `DEV • 64638ad*` · `Built 2026-09-05T05:17:41.318Z (uncommitted source)`
**Runtime:** Node / happy-dom · **TESTED** · not Chrome E2E

## Original holdout (this freeze)

This corpus did not exist before T029. **There is no pre-repair holdout score.**

Development P1s (TYPE→CLICK, SELECT→CONTINUE, PRESS_ENTER click-complete, verifier churn, URL query, empty OTP values, vault tabId) were found by forensic reading and repaired **before** the first holdout scoring run. The first holdout number is therefore **post-repair**.

| Version | Holdout N | Pass | Fail | Notes |
|---|---:|---:|---:|---|
| `t029-judge-kill/1` first score | 32 | 32 | 0 | Post-repair working tree. Not a pre-repair baseline. |

Do not present 32/32 as “holdout before any T029 fix.”

## Post-repair re-evaluation

Not applicable as a second version: no holdout failure was used to retune production to individual holdout strings. `jk-hold-11` changed **expected family** only (TEST DEFECT). Production was not given a painted-Continue special case.

If a later gate retunes production after a holdout fail, record:

1. original fail IDs and this 32/32 first-score table (frozen);
2. new corpus version `t029-judge-kill/1-post-repair` (or `/2`);
3. do not overwrite this file’s first-score table.

## Contamination check (this tree)

Holdout strings `Ada Lovelace` and `CANARY_SESSION_T029` appear in eval/tests only (`t029-judge-kill.ts`, `t029-repairs.test.ts`), not in production planners or observers.

## T029-R1 note (does not replace the table above)

Original first-score JSON remains `bench/judge-kill/t029-judge-kill.json` (`measuredAt` 2026-09-05T05:18:10.995Z). T029-R1 re-scored the **same frozen IDs** into `bench/judge-kill/t029-r1-judge-kill.json` (32/32). See `docs/evidence/T029-R1-POST-REPAIR-EVALUATION.md`. Do not treat the R1 file as the original freeze.
