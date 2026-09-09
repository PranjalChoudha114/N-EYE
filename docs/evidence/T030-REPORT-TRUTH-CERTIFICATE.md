# T030 — Report truth certificate

**Corpus:** `t030-report-truth/1`  
**N = 10** (development 4, holdout 6)  
**Build SHA at score:** `7bca2ec` dirty=true  
**Method:** `buildVerifiedTaskReport` over frozen ledger+state fixtures. Planner/page text cannot author FACT.  
**Classification:** TESTED (Node). Not Chrome E2E.

## Results

| Metric | Value |
|---|---|
| Result matches | 10/10 |
| Factual claim precision (PROVEN claims with required events) | 100.0% |
| Unsupported high-impact FACT count | **0** |
| Secret leaks | 0 |
| Contradictions | 0 |
| Important-fact coverage | 95.0% (NOT_VERIFIED screenshot on gateway-failure fixture is intentional) |

Exact wording allowed:

> 100% supported factual claims on T030 report-truth corpus v1, N=10

Forbidden:

> Reports can never be wrong.

## Claim vocabulary (ADR-0018 + T030)

| evidenceStatus | UI status | Meaning |
|---|---|---|
| PROVEN | FACT | Required local events exist |
| OBSERVED | OBSERVED | Dispatch/attempt recorded; not task success |
| NOT_VERIFIED | UNVERIFIED | Remote/screenshot/privacy sentence lacks required evidence |
| NOT_APPLICABLE | NOT APPLICABLE | Claim does not apply to this task |

High-impact keys: `TASK_COMPLETED`, `SCREENSHOT_NOT_SENT`, `AUTHORIZED_CLICK`, `PASSWORD_NEVER_SEND`.

## Holdout attacks included

Planner COMPLETE without `OUTCOME_VERIFIED`; TYPE vs click; click dispatched but form not submitted; password UI without `DATA_PROTECTED`; OCR flag without `OCR_USED`; confirmation refused; WAIT settle vs task complete; Remote screenshot only when egress PASS.

Renderer: `apps/extension/src/runtime/task-report.ts` + `report-claim-validator.ts`.
