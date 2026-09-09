# T030 — Privacy / canary results

## Automated channels (Node)

`runCanaryRedTeam()` + T030 accuracy pack `canaryPass=true`. Development PII residual leak **0**. NEVER_SEND residual leak **0** (dev n=24; holdout secrets also 0 leak).

Report/ledger scrub: `CANARY_PASSWORD` class strings are dropped entirely from `safeEvidence` (not partial-replaced).

## Frozen holdout (not retuned)

| Finding | Sample | Classification |
|---|---|---|
| FP PII_PHONE | `hold-order-10digit` `Order 9876543210 shipped` | CONFIRMED on holdout; IN_MOBILE (REC-050). Not disabled. |
| FN PII_NAME | `hold-hindi-name-label` `नाम` | English label detector only |
| ISBN | `hold-isbn` | TN (bibliographic skip held) |
| Empty password control | `hold-empty-password` | SECRET_PASSWORD TP; `hasValue=false` |

## Live Remote (this machine, 2026-09-09)

Gateway `GET /v1/health` → `provider=gemini`, `model=gemini-2.5-flash`.

`real-gemini-integration.test.ts` **PASS** (7176 ms this final suite; earlier same-day pass 3708 ms). One `POST /v1/plan` returned 503 then retry succeeded (bounded planner retry, same SafeContext class).

- Serialized egress SafeContext **did not contain** `REAL_TEST_PASSWORD_X7K92` or `REAL_TEST_EMAIL_92841@example.com`.
- Contained `[EMAIL_1]`.
- Live proposal `TYPE_TOKEN`; local execute MATCHED; `VERIFIED_SUCCESS`.

`apps/planner-api/tests/test_gemini_real.py` **PASS**: prompt builder lacked raw email/password before Gemini.

This is **VERIFIED IN REAL RUNTIME** for those synthetic canaries on this host’s Gemini path. It is not an OS-wide secrecy proof and not a DevTools HAR archive.

## Scope

N-Eye planner egress ≠ website third-party trackers (REC-016).
