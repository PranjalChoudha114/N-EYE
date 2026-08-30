# T019/T020 — Privacy / PII measurement

Build SHA: `333631f1460188e29bc7eaaf38cb88f60b67c363`
Dataset: t019-pii-corpus.v1 (hash 765fbc9eb89fde53)
N (samples): 55

Classification: **RESULT** (this build, labeled synthetic corpus, current detectors).

Unsupported taxonomy classes `PII_NAME`, `PII_ADDRESS`, `PII_ACCOUNT_ID` are **not scored as detections**; they have policy mappings only.

| class | N_pos | TP | FP | FN | TN | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PII_EMAIL | 10 | 10 | 0 | 0 | 45 | 100.0% | 100.0% | 100.0% |
| PII_PHONE | 6 | 6 | 0 | 0 | 49 | 100.0% | 100.0% | 100.0% |
| SECRET_PASSWORD | 7 | 7 | 0 | 0 | 48 | 100.0% | 100.0% | 100.0% |
| SECRET_OTP | 5 | 5 | 0 | 0 | 50 | 100.0% | 100.0% | 100.0% |
| SECRET_API_KEY | 6 | 6 | 0 | 0 | 49 | 100.0% | 100.0% | 100.0% |
| SECRET_AUTH_TOKEN | 2 | 2 | 0 | 0 | 53 | 100.0% | 100.0% | 100.0% |
| SECRET_SESSION | 4 | 4 | 0 | 0 | 51 | 100.0% | 100.0% | 100.0% |

Micro (label instances): TP=40 FP=0 FN=0 P=100.0% R=100.0% F1=100.0%

## False positives
None on this corpus.

## False negatives
None on this corpus.

## Auth-secret NEVER_SEND
- N=24; policy correct 24/24; residual canary/raw in SafeContext 0

## Sanitization
- transformations scored: 41; correct 41; miss 0; wrong 0; over-redaction 0; residual leak samples 0; utility-preserved samples 54/55

## Caveats
- `PII_NAME` / `PII_ADDRESS` / `PII_ACCOUNT_ID` have no detectors; corpus labels them expected-empty.
- `unicode-email` may match an ASCII suffix rather than the full Unicode local-part.
- CANARY_ strings are always stripped from SafeContext labels; a public-looking sample that contains `CANARY_` can fail the utility check without being a PII miss.
