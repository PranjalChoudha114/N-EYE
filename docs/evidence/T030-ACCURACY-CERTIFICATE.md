# T030 Accuracy Certificate

Corpus/build: `7bca2ec4f1946020d11428a38d74a11448039c08` dirty=true
Measured: 2026-09-09T06:57:45.614Z
Harness: t030-accuracy/1

No single “accuracy %” is published. Dimensions are separate.

## PII — development

Corpus t027-pii-corpus.v1 hash 63a35cd3f367227c N=69

| Class | TP | FP | FN | P | R | F1 | N_pos |
|---|---:|---:|---:|---:|---:|---:|---:|
| PII_EMAIL | 11 | 0 | 0 | 100.0% | 100.0% | 100.0% | 11 |
| PII_PHONE | 8 | 0 | 0 | 100.0% | 100.0% | 100.0% | 8 |
| SECRET_PASSWORD | 7 | 0 | 0 | 100.0% | 100.0% | 100.0% | 7 |
| SECRET_OTP | 5 | 0 | 0 | 100.0% | 100.0% | 100.0% | 5 |
| SECRET_API_KEY | 6 | 0 | 0 | 100.0% | 100.0% | 100.0% | 6 |
| SECRET_AUTH_TOKEN | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% | 2 |
| SECRET_SESSION | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% | 4 |
| PII_NAME | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 1 |
| PII_ADDRESS | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 1 |
| PII_ACCOUNT_ID | 8 | 0 | 0 | 100.0% | 100.0% | 100.0% | 8 |

Micro P/R/F1 100.0% / 100.0% / 100.0%
Sanitization residual leak 0; NEVER_SEND leak 0

## PII — frozen holdout (not used to retune)

Corpus t030-pii-holdout/1 hash c8cbd92d2f717e21 N=28

| Class | TP | FP | FN | P | R | F1 | N_pos |
|---|---:|---:|---:|---:|---:|---:|---:|
| PII_EMAIL | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% | 4 |
| PII_PHONE | 2 | 1 | 0 | 66.7% | 100.0% | 80.0% | 2 |
| SECRET_PASSWORD | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% | 2 |
| SECRET_OTP | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% | 2 |
| SECRET_API_KEY | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% | 2 |
| SECRET_AUTH_TOKEN | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 1 |
| SECRET_SESSION | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% | 1 |
| PII_NAME | 1 | 0 | 1 | 100.0% | 50.0% | 66.7% | 2 |
| PII_ADDRESS | 0 | 0 | 0 | 0.0% | 0.0% | 0.0% | 0 |
| PII_ACCOUNT_ID | 5 | 0 | 0 | 100.0% | 100.0% | 100.0% | 5 |

Micro P/R/F1 95.2% / 95.2% / 95.2%
FP review:
- `hold-order-10digit`: PII_PHONE
FN review:
- `hold-hindi-name-label`: expected PII_NAME

## Visual

Cascade 7/7 (Wilson 64.6–100.0%)
Grounding 7/7 false=0 abstain=4 (Wilson 64.6–100.0%)
OCR 7/7 (Wilson 64.6–100.0%) p50=11.55 p95=43.47
Classification: MEASURED (fixtures). Chrome Scenario 08: HUMAN REQUIRED.

## Report truth

Corpus t030-report-truth/1 N=10 (dev 4, holdout 6)
Result matches 10/10
Factual claim precision 100.0%
Unsupported high-impact FACT count 0
Secret leaks 0
No scorer failures.

## Agent reliability (contract, not Chrome)

Corpus t030-reliability/1 N=8
Verified success 1
False-completion caught 5
Wrong action 0
Correct abstention 2
TaskGraph disagreements 0
No scorer failures.

## Method

Development PII is t027-pii-corpus.v1. Holdout is t030-pii-holdout/1 JSON. Holdout labels are desired behavior.
