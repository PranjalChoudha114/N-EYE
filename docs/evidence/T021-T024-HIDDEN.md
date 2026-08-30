# T021 held-out template evaluation

Independence: **HELD-OUT TEMPLATE EVALUATION**. Same engineering agent wrote templates and ran them. This is not a blind independent laboratory.

Corpus id: `n-eye-t021-held-out-templates-v1`  
Hash: `adc39306cd3a447f6bb3c323b7801878363d39fe25da6bcd8fc63a23656c90a2`  
Runtime: happy-dom + public product APIs (observe → privacy → egress → Mock planner → validate → execute → verify)

Production modules do not import the corpus. No YouTube/GitHub/hostname selectors were added.

## First-pass (sealed)

See `bench/hidden/t021-first-pass.json`.

| N | completed | correct abstention | wrong action | false complete | privacy pass |
|---:|---:|---:|---:|---:|---:|
| 20 | 8 | 7 | 2 | 0 | 20/20 |

First-pass P1: Mock `CLICK` used first-match on duplicate labels (`h11-iframe`, `h13-ambiguous`).

## Post-repair (unique click)

General Mock repair: `pickUniqueClickTarget`. Not a fixture-id patch.

| N | completed | correct abstention | wrong action | false complete | privacy pass |
|---:|---:|---:|---:|---:|---:|
| 20 | 8 | 9 | 0 | 0 | 20/20 |

Remaining expectedHit misses (`h10` SPA, `h15` equivalent replace, `h20` injection click) are **AMBIGUOUS** verification after a click that does not change URL/control set. Fail-closed. Not false Completed. Not wrong action.

SPA execute/re-ground remains covered by `spa-dynamic.test.ts` (SAFE_REGROUND / semantic-swap BLOCK).
