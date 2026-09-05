# T029-R1 — Post-repair evaluation

## ORIGINAL T029 HOLDOUT (frozen, unchanged)

| Item | Value |
|---|---|
| Corpus | `t029-judge-kill/1` |
| Manifest | `docs/evidence/T029-FROZEN-HOLDOUT-MANIFEST.md` (frozen 2026-09-05T04:56:00Z) |
| First score JSON | `bench/judge-kill/t029-judge-kill.json` |
| measuredAt | **2026-09-05T05:18:10.995Z** |
| Holdout | 32 / 32 pass |
| Dev | 91 / 91 pass |
| Classification | TESTED (Node/happy-dom), **not** Chrome E2E |

Do not overwrite that JSON’s first-score identity. Narrative: `docs/evidence/T029-HOLDOUT-RESULTS.md`.

## T029-R1 POST-REPAIR RE-EVALUATION

Same frozen IDs and corpus version string. Production was not retuned to holdout strings.

| Item | Value |
|---|---|
| JSON | `bench/judge-kill/t029-r1-judge-kill.json` |
| measuredAt | 2026-09-05T07:02:06.045Z |
| Holdout | 32 / 32 pass |
| Dev | 91 / 91 pass |
| falseCompletionFails | 0 |
| Classification | TESTED (Node/happy-dom) |

Scenario 09 is the visual held-out/generalization check in the **human** checklist (RC09). It was not hard-coded.

## Fresh automated gate (this R1 run)

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`real-gemini-integration.test.ts` console) |
| protocol tests | 27 passed |
| extension tests | **545** passed (92 files) |
| planner-api pytest | 47 passed |
| `pnpm build:extension` | PASS · `DEV • 64638ad*` · `Built 2026-09-05T07:02:05.247Z (uncommitted source)` |
| `pnpm bench:t029` | PASS · 123/123 · written to `t029-r1-judge-kill.json`; original JSON restored |
| Observer 100-el (this run) | MEASURED median 4.57 ms, p95 8.63 ms (development; not SIH formal). T029 prior p95 12.09 ms — no material regression. |
| Live Remote | ENVIRONMENT BLOCKED (`ECONNREFUSED :8000`) |
| Scenario 08 Chrome | **UNVERIFIED** / HUMAN REQUIRED |

Do not copy old 27 / 523 / 47 as this-run counts. Protocol stayed 27; extension is **545**; pytest stayed 47.
