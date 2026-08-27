# N-Eye Privacy Boundary & SafeContext Contract

## 1. The Golden Privacy Invariant
> **Secrets do not cross the network by default.**
> Raw page text, DOM trees, canvas/screenshot bitmaps, and user secrets remain local.

## 2. Privacy Class Taxonomy & Default Actions

| Privacy Class | Examples | Default Policy Action | Network Representation |
|---------------|----------|-----------------------|------------------------|
| **SECRET_AUTH** | Password, Passcode, Master PIN | `NEVER_SEND` | Redacted / Omitted completely |
| **SECRET_OTP** | 2FA code, SMS OTP, Email verification pin | `NEVER_SEND` | Redacted / Omitted completely |
| **SECRET_TOKEN** | Bearer token, JWT, API Key, Session Cookie | `NEVER_SEND` | Redacted / Omitted completely |
| **PII_DIRECT** | Email address, Phone number, Credit Card number | `TOKENIZE` (if task-relevant) | `[EMAIL_1]`, `[PHONE_1]` |
| **PII_CONTEXT** | Personal Name, Street Address, Account ID | `MINIMIZE` / `MASK` | Generalized role or masked string |
| **PUBLIC_UI** | Button labels, Navigation links, Form headings | `KEEP` / `ALLOW` | Raw label string (sanitized) |

## 3. SafeContext Invariants
1. `SafeContext` is an immutable, strictly allowlisted data structure.
2. Only elements essential to the current task step are included.
3. Every element identifier is a transient opaque identifier (e.g., `e17`), not a CSS selector or XPath.
4. Input values of type `password` or sensitive classes are omitted from `SafeContext`.
5. Private tokens (`[EMAIL_X]`) carry only class and role metadata, never original values.
