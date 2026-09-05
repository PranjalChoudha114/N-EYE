# T027 privacy / PII / redaction

Dataset: t027-pii-corpus.v1 hash 63a35cd3f367227c N=69
SHA: `64638ad42da2fa401fa2f471d4f39e116770380f` dirty=true

| Class | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| PII_EMAIL | 11 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PII_PHONE | 8 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_PASSWORD | 7 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_OTP | 5 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_API_KEY | 6 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_AUTH_TOKEN | 2 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| SECRET_SESSION | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PII_NAME | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PII_ADDRESS | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| PII_ACCOUNT_ID | 8 | 0 | 0 | 100.0% | 100.0% | 100.0% |

Micro P/R/F1: 100.0% / 100.0% / 100.0%
Sanitization correct: 53/53; residual leak 0; utility 68/69
Auth NEVER_SEND policy: 24/24; residual leak 0

Weak / honest gaps: PII_NAME and PII_ADDRESS only fire on labeled fields, not free-text names/addresses. Holdout PAN row is included and was not used to retune regexes after reveal.
