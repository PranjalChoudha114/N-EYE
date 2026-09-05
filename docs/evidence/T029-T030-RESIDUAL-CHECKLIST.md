# T029 → T030 residual checklist

Input to T030. T029 did **not** start freeze, tag, or release.

**Build this residue applies to:** T029-R1 after the coherent T025–T029+R1 commit. Dist identity: `apps/extension/dist/build-identity.txt`. Scenario 08 Chrome is still HUMAN REQUIRED (`T029-R1-REAL-CHROME-CHECKLIST.md` RC08).

| ID | Item | Status |
|---|---|---|
| **A** | BLOCKING P0 | **DONE** (none confirmed this audit). Re-open if Chrome/Remote proof finds a boundary break. |
| **B** | BLOCKING P1 (product path) | **OPEN** for Chrome-unproven P1 class (false complete / wrong field on live pages). Automated P1s F001–F008 **DONE** (TESTED Node). |
| **C** | HUMAN CHROME PROOF | **HUMAN REQUIRED** — FR1 + T029-C1…C15 empty. |
| **D** | LIVE REMOTE PROOF | **ENVIRONMENT BLOCKED** — gateway `ECONNREFUSED :8000`. |
| **E** | MULTI-MACHINE / CLEAN-PROFILE PROOF | **OPEN** / HUMAN REQUIRED. |
| **F** | CLAIM AUDIT | **OPEN** — T030 must strip any remaining “production ready / zero leak / 100%” language. T029 docs use evidence vocabulary. |
| **G** | SECRET SCAN | **OPEN** — `.env` / keys / canaries in dist. Not run as a release scan this gate. |
| **H** | REPRODUCIBLE FRESH CLONE | **OPEN** — dirty tree; clone of HEAD alone **does not** include T025–T029. |
| **I** | CLEAN GIT / RELEASE ARTIFACT | **OPEN** — uncommitted by design. No tag. |
| **J** | FINAL EVIDENCE PACK | **OPEN** — T029 pack exists; T030 must bind a **committed** identity. |
| **K** | PRIMARY 90-SECOND DEMO | **OPEN** / HUMAN REQUIRED (rehearsal). |
| **L** | BACKUP DEMO | **OPEN** / HUMAN REQUIRED. |
| **M** | JUDGE Q&A | **OPEN**. |
| **N** | TEAM REHEARSAL | **OPEN**. |
| **O** | KNOWN LIMITATIONS | **DONE** for T029 recording (wrong-destination URL, TaskGraph not loop driver, untrusted Enter, closed shadow, CORS `*`, AccName subset, Chrome UNVERIFIED). T030 must not over-claim. |
| **P** | RELEASE FREEZE | **NOT APPLICABLE** this gate. Do not freeze until A–J (and C, D or documented skip) are honest. |

## Exact remaining work (only)

1. Human Chrome: fill `docs/evidence/T029-R1-REAL-CHROME-CHECKLIST.md` (RC01–RC15; **RC08 is blocking**) on the matching dist identity. Page ↔ product ↔ Report. Keep FR1 / original T029 templates as history.
2. Start planner-api + real provider; capture `/v1/plan` body; plant canaries; record LIVE REMOTE or keep ENVIRONMENT BLOCKED with a written skip.
3. Secret scan; fresh-clone / clean-profile load; decide commit of T025–T029.
4. Demo scripts + Judge Q&A from known limitations (honest abstention, YouTube Enter, visual-only, confirmation).
5. T030 freeze/tag **only after** the above. Do not start T030 implementation in this residue file.
