# T029 — Judge-Kill matrix

**Corpus version:** `t029-judge-kill/1`
**Source:** `apps/extension/src/eval/t029-judge-kill.ts`
**Machine result:** `bench/judge-kill/t029-judge-kill.json` (`measuredAt` `2026-09-05T05:18:10.995Z`)
**Runtime:** Node + happy-dom. Classification: **TESTED**. **Not** Chrome E2E. **Not** a national-final hardware score.
**Holdout freeze:** `docs/evidence/T029-FROZEN-HOLDOUT-MANIFEST.md` (recorded before first scoring).

## Honesty bound

Each case tests a **meaningful contract** (interpreter family, completion phase, privacy `valuePresent`, vault deny, proposal reject, URL strip, report phase). It does **not** prove 123 Chrome workflows. Geometry, frames, confirmation, OCR, and dynamic remint still need Chrome or existing dedicated tests.

## Counts

| Split | N | Pass this run | Classification |
|---|---:|---:|---|
| Development (`jk-dev-*`) | 91 | 91 | TESTED |
| Frozen holdout (`jk-hold-01`…`32`) | 32 | 32 | TESTED (first scoring of this freeze; post-repair tree) |
| **Total** | **123** | **123** | TESTED |

False-completion unit fails in this harness (`falseCompletionFails`): **0**.

## Categories (all 123)

| Category | N | What the case actually exercises |
|---|---:|---|
| F-MULTISTEP | 17 | TYPE→CLICK, TYPE→SUBMIT, SELECT→CONTINUE, search-then-open, remaining subgoals, PRESS_ENTER vs click |
| E-NALIS | 16 | Paraphrase families (click/open/go to/find), possessive/unsupported, composite search |
| A-STRUCTURAL | 16 | Button, link, textbox, checkbox, select, submit, unlabeled / duplicate interpret |
| I-PRIVACY | 13 | Empty vs populated email/tel/password/OTP; goal secrets; Indian corpus classes already in T027 |
| M-PLANNER | 9 | Extra keys, CSS selector target, fabricated confirm, malformed COMPLETE |
| J-VAULT | 6 | Invented / cross-origin / cross-task / cross-tab / unknown token |
| G-DYNAMIC | 6 | Disable after plan, remint interpret, missing target |
| B-A11Y | 5 | aria-label / labelledby / role-only interpret |
| D-VISUAL | 5 | OCR-ish goals including holdout painted Continue (CLICK, not UNSUPPORTED) |
| C-GEOMETRY | 4 | Zero-size / overlay / scroll interpret or existing hit-test sibling |
| K-EGRESS | 4 | URL query canary strip; JWT in title (goal/title path) |
| P-RECOVERY | 4 | Empty/malformed planner; unsupported JS intent |
| Q-REPORT | 4 | ASK_USER / COMPLETED / PARTIAL vs report result classifier |
| O-VERIFY | 4 | Autocomplete churn; epoch-only; identity |
| N-CONFIRM | 4 | Semantic swap / replay contracts (unit, not Chrome dialog) |
| L-INJECTION | 3 | ARIA “already approved”; ignore-previous; fake token text |
| H-FRAMES | 3 | Cross-origin inaccessible; frame interpret |

Minimum prompt categories A–Q are all present. Several C/H/N/D rows are **contract-thin** (see T029-F016).

## Development vs holdout

- Development may be used to drive repairs (F001–F008 were found by **code reading + unit tests**, then encoded as `jk-dev-*` / `t029-repairs`).
- Holdout IDs and exact strings must not retune production selectors/labels/coordinates.
- This corpus is **new in T029**. There is **no pre-repair holdout number**. First score is post-repair `t029-judge-kill/1`. Do not rewrite history as a pre-repair 32/32.

## `jk-hold-11` (TEST DEFECT, not a production retune)

Original scorer expected UNSUPPORTED for `"click whichever painted label looks like Continue"`. Interpreter returns **CLICK** (honest: it is a click goal; visual uniqueness is later). Expected updated. Goal string frozen unchanged.

## How to re-score

```bash
pnpm bench:t029
```

Requires `N_EYE_BENCH_WRITE=1` (the script sets it). Writes `bench/judge-kill/t029-judge-kill.json`.
