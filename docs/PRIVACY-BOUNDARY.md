# N-Eye Privacy Boundary & SafeContext Contract

## 1. The Golden Privacy Invariant
> **Secrets do not cross the network by default.**
> Raw page text, DOM trees, canvas/screenshot bitmaps, and user secrets remain local.

## 2. Privacy Class Taxonomy & Default Actions

| Privacy Class | Examples | Default Policy Action | Network Representation |
|---------------|----------|-----------------------|------------------------|
| **SECRET_PASSWORD** | Password, passcode | `NEVER_SEND` | Omitted |
| **SECRET_OTP** | 2FA / SMS OTP | `NEVER_SEND` | Omitted |
| **SECRET_API_KEY** / **SECRET_AUTH_TOKEN** / **SECRET_SESSION** | API keys, bearer/JWT, session cookies | `NEVER_SEND` | Omitted |
| **PII_EMAIL** / **PII_PHONE** | Email, phone | `TOKENIZE` when a real `textSpan` exists | `[EMAIL_1]`, `[PHONE_1]` capabilities only |
| **PII_NAME** / **PII_ADDRESS** / **PII_ACCOUNT_ID** | Name, address, account id | `MINIMIZE` / `MASK` | Generalized role or masked string |
| **PUBLIC_UI** | Button labels, navigation | `ALLOW` | Raw label (length-bounded) |

## 3. SafeContext Invariants
1. `SafeContext` is an immutable, strictly allowlisted data structure.
2. Only elements essential to the current task step are included.
3. Every element identifier is a transient opaque identifier (e.g., `e17`), not a CSS selector or XPath.
4. Input values of type `password` or sensitive classes are omitted from `SafeContext`.
5. Private tokens (`[EMAIL_X]`) carry only class and role metadata, never original values.

## 4. Provenance
Sensitive values may originate from DOM, ARIA, placeholder, task goal, OCR, visual labels, or document/image text. There is no OCR bypass. The same policy table applies.

## 5. Visual / OCR path
Pixels → local OCR → raw OCR text (local) → privacy detection → policy → tokenize/remove → SafeContext.

Raw screenshots and raw OCR are not outbound. `visualHints` carry sanitized descriptions and geometry only. Remote privacy-safe crop transmission is deferred (T007/008 outbound screenshot bytes = 0).

