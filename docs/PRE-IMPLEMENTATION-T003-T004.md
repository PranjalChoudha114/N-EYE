# N-EYE TASK 003/004 — Pre-Implementation Report

## 1. Executive Summary & Root Cause Analysis

### Real-Web Failure Reproduction & Root Cause
On live websites (MyUPES login portal, ChatGPT, modern SPAs):
1. **Window Focus & Tab Query**: `chrome.tabs.query({ active: true, currentWindow: true })` inside the service worker can resolve to `undefined` or a window where `tab.url` is empty when the side panel is focused or during initial mount.
2. **Missing Scripting Permission & Fallback Injection**: If the user opened the tab before installing/reloading the extension, `content.js` is not running. Without `"scripting"` permission and programmatic injection fallback (`chrome.scripting.executeScript`), `chrome.tabs.sendMessage` returned `Could not establish connection` and failed permanently.
3. **SPA Element Query Selectors**: Rich web applications (like ChatGPT or custom enterprise portals) often use `[role="textbox"]`, `[role="searchbox"]`, `[role="combobox"]`, `[contenteditable="true"]`, and open shadow roots (`element.shadowRoot`), which were not included in the basic `querySelectorAll` string.
4. **UI State Ambiguity**: When observation failed, the UI static placeholder remained `"No sensitive inputs detected"`, violating the security invariant that `FAILED` must never look like `SAFE`.

---

## 2. Active-Web Repair Plan
1. **Service Worker Tab Resolution**: Query with `{ active: true, lastFocusedWindow: true }` and fallback to `{ active: true }` in normal window type.
2. **Add `"scripting"` Permission**: Enable programmatic content-script injection on active supported tabs.
3. **Content Script Handshake & Self-Healing**: Side panel checks for connection; if `lastError` indicates content script missing, it invokes `chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })` and retries handshake before giving up.
4. **Expanded Interactive Selector Matrix**:
   `button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="radio"], [role="menuitem"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="switch"], [role="option"], [contenteditable="true"], [contenteditable=""]`
   and recursive open Shadow DOM traversal.
5. **State-Driven UI Safety**: When status is `FAILED` or `UNSUPPORTED`, privacy card explicitly displays `"Observation inactive — Page not protected"` in warning red/amber.

---

## 3. Architecture & Privacy Pipeline Design

```
[ Active Webpage DOM ]
         │
         ▼ (Zone 1)
[ Local Page Observer (observer.ts) ]
         │ RawScene (_isLocalOnly: true)
         ▼ (Zone 3)
[ Deterministic Privacy Detector (detectors.ts) ]
         │ PrivacyFinding[] (Classification: PII_EMAIL, SECRET_AUTH, etc.)
         ▼ (Zone 3)
[ Privacy Policy Engine (policy.ts) ]
         │ PrivacyDecision[] (TOKENIZE, NEVER_SEND, MASK, ALLOW)
         ▼ (Zone 3)
[ Private Token Vault (vault.ts) ] ── (In-memory, session-scoped, expiring)
         │ TokenBindings ([EMAIL_1] -> realValue)
         ▼ (Zone 3)
[ SafeContext Builder (safe-context-builder.ts) ]
         │ SafeContext (Strict allowlist schema, sanitized goal, opaque IDs)
         ▼ (Zone 4)
[ Egress Guard (egress-guard.ts) ]
         │ Canary Byte-Scanner & Schema Enforcement
         ▼ (Zone 5 - Untrusted Network Boundary)
[ Deterministic / Mock Planner (deterministic-planner.ts) ]
         │ ActionProposal (CLICK, TYPE_TOKEN, WAIT, COMPLETE)
         ▼ (Zone 3)
[ Local Action Validator (validator.ts) & Live Re-Grounding (regrounding.ts) ]
         │ ValidatedAction (Risk: LOW/MEDIUM/HIGH/BLOCKED)
         ▼ (Zone 1)
[ Action Executor (executor.ts) & Vault Token Resolution ]
         │ Content Script DOM Event Execution
         ▼ (Zone 3)
[ Action Verifier (verifier.ts) ]
         │ VerificationResult (VERIFIED_SUCCESS, VERIFIED_FAILURE, AMBIGUOUS)
```

---

## 4. Privacy Taxonomy & Policy Matrix

| Privacy Class | Examples | Default Policy Decision | Network Representation |
|---|---|---|---|
| `SECRET_PASSWORD` | Password inputs, auth phrases | `NEVER_SEND` | Redacted completely (0 bytes) |
| `SECRET_OTP` | 2FA codes, SMS OTPs | `NEVER_SEND` | Redacted completely (0 bytes) |
| `SECRET_API_KEY` | Bearer tokens, JWTs, `sk_live_...` | `NEVER_SEND` | Redacted completely (0 bytes) |
| `SECRET_AUTH_TOKEN` | Session cookies, tokens | `NEVER_SEND` | Redacted completely (0 bytes) |
| `PII_EMAIL` | Email addresses | `TOKENIZE` | `[EMAIL_1]` (Scoped token) |
| `PII_PHONE` | Phone numbers | `TOKENIZE` | `[PHONE_1]` (Scoped token) |
| `PII_NAME` | Full names | `MINIMIZE` / `MASK` | `[NAME_1]` / Generic role |
| `PII_ADDRESS` | Physical addresses | `MASK` | Masked region |
| `PII_ACCOUNT_ID` | Account numbers | `TOKENIZE` | `[ACCOUNT_1]` |
| `PUBLIC_UI` | Button labels, public text | `ALLOW` | Raw sanitized text |
| `SENSITIVE_UNKNOWN` | Ambiguous sensitive data | `FAIL_SAFE` (`NEVER_SEND`) | Redacted completely |

---

## 5. Token Vault Invariants
- **In-Memory Only**: Zero writes to `chrome.storage`, `localStorage`, `sessionStorage`, or `IndexedDB`.
- **Session & Task Scoped**: Bound strictly to `taskId`, `tabId`, and `origin`.
- **Target Semantic Validation**: An email token (`[EMAIL_1]`) can only resolve into an input with semantic role `textbox`/`email`; attempting to resolve an email token into a password or search field is rejected (`DENIED_WRONG_TARGET`).
- **TTL & Expiry**: Expired tokens immediately fail resolution.
- **Wipe on Teardown**: Task cancellation or completion wipes all bindings.

---

## 6. Product UI V2 Experience
- **N-Eye Trust Core**: Dynamic SVG aperture visualization pulsating with real-time system state (`IDLE`, `SEE`, `PROTECT`, `SAFE_CONTEXT`, `PLAN`, `VALIDATE`, `ACT`, `VERIFY`, `BLOCKED`, `ERROR`).
- **SafeContext Visualizer**: Three-column transformation flow: `Local Page Data` → `N-Eye Trust Core` → `Protected SafeContext`.
- **Stage Latency Timeline**: Real-time monotonic duration tracking for each step (`SEE`, `PROTECT`, `PLAN (MOCK)`, `VALIDATE`, `ACT`, `VERIFY`).
- **High-Risk Confirmation Modal**: Accessible dialog requiring user approval before executing high-risk actions (e.g. form submission).
