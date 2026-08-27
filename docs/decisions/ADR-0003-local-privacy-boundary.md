# Architecture Decision Record (ADR) 0003: Local Privacy Boundary & Token Vault

## Status
**ACCEPTED**

## Context
N-Eye requires a strict boundary ensuring that raw digital secrets (passwords, OTPs, session cookies, API keys) never leave the user's browser, while still allowing an AI planner to understand page layout and propose contextual actions.

## Decisions
1. **Privacy Taxonomy**:
   - `SECRET_PASSWORD`, `SECRET_OTP`, `SECRET_API_KEY`, `SECRET_AUTH_TOKEN`, `SECRET_SESSION` -> mapped to `NEVER_SEND`.
   - `PII_EMAIL`, `PII_PHONE`, `PII_ACCOUNT_ID` -> mapped to `TOKENIZE` (`[EMAIL_1]`, `[PHONE_1]`).
   - `PII_NAME`, `PII_ADDRESS` -> mapped to `MINIMIZE` / `MASK`.
   - `PUBLIC_UI`, `CONTEXTUAL` -> mapped to `ALLOW`.
2. **Private Token Vault**:
   - In-memory only; strictly prohibited from persisting raw values to `chrome.storage`, `localStorage`, or disk.
   - Bound to `taskId`, `tabId`, and `origin` with 10-minute TTL.
   - Validates target element semantics before resolution (denies injecting email tokens into password fields).
   - Sanitized capability export returns only token symbols without raw values.

## Consequences
- **Positive**: Zero raw secrets leave the local machine; deterministic tokenization preserves semantic utility for planning.
- **Negative**: Dynamic PII outside regex/semantic patterns requires user confirmation or future local neural classifiers.
