# Architecture Decision Record (ADR) 0012: Runtime recovery without authority expansion

## Status
**ACCEPTED**

## Context
T017/T018 is the runtime-resilience campaign. T015/T016 already made confirmation a capability and rejected hostile proposal shape. Remaining operational risk was brittleness:

1. Unpaired UTF-16 surrogates from page-derived JS strings crashed Python/UTF-8 Gemini serialization (`surrogates not allowed`) and returned 502.
2. Planner HTTP failures used a single uncancellable 5xx retry, mixed gateway vs provider health, and could echo unsafe error bodies.
3. Service-worker / Side Panel lifetime is ephemeral. Reconstructing confirmation, vault values, or a running task from UI snapshot would manufacture authority.
4. OCR/capture failure must not become a screenshot or DOM-dump fallback.
5. Protocol already named `SELECT` / `SCROLL`; the executor had no branch.
6. `TYPE_TOKEN` verification treated event dispatch as success.
7. HIGH-risk verification ambiguity could continue the step loop (replay risk).

## Decisions
1. **Unicode scalar sanitization at transport boundaries.** Unpaired surrogates become U+FFFD. Valid Unicode (emoji, Devanagari, CJK, combining marks, supplementary-plane characters) is preserved. Applied on SafeContext before EgressGuard serialize, and again in the planner gateway before provider UTF-8 encode. Encoding failure does not retry with a broader/raw payload.
2. **Classified planner transport.** Bounded attempts (3). 429 retries once, honoring Retry-After capped at 5s. 404 is misconfiguration and is not retried. 503/transient 5xx/timeout/network may retry with exponential backoff (500ms × 2^(n-1), cap 5s). Malformed/empty/schema-invalid responses are not retried. Cancellation aborts in-flight fetch and backoff. Every retry uses the identical protected body.
3. **Gateway reachable ≠ provider healthy.** UI phases distinguish `GATEWAY_UNREACHABLE`, `RATE_LIMITED`, and `PROVIDER_UNAVAILABLE`. Mock remains an explicit user-selected mode. Remote mode does not silently fall back to Mock.
4. **Ephemeral authority stays ephemeral.** Vault and confirmation live in the owner document. Hydrate of a running or awaiting-confirmation snapshot marks the session interrupted and strips `confirmation`. Service-worker restart cannot mint a grant from UI state. Tab/origin change invalidates pending confirmation and bumps task generation so late provider responses cannot execute.
5. **Perception failure is local.** Capture/OCR errors never send rasters. If visual evidence was required and structure is insufficient, the loop stops in `OCR_UNAVAILABLE`.
6. **SELECT / SCROLL are constrained executors.** Native `<select>` only; option from local `textValue`. SCROLL amounts are schema-bounded (2000px reject) and execute-clamped (800px). No planner selectors or JavaScript.
7. **Resulting-state verification.** TYPE_TOKEN/TYPE_TEXT succeed only when the live control holds the intended value (`fieldState === MATCHED`). Raw values never enter evidence. HIGH + not `VERIFIED_SUCCESS` → `ASK_USER`, no automatic replay.

## Consequences
- **Positive:** YouTube-class surrogate pages no longer crash local UTF-8 serialization. Provider outages are truthful. Cancellation races and HIGH ambiguity fail closed. SELECT/SCROLL are real, locally authorized actions.
- **Negative:** Native-select-only SELECT; custom widgets ask the user. TYPE_TOKEN cannot re-read after an asynchronous app overwrite that happens after the executor returns.
- **Residual:** True Chrome MV3 service-worker termination is not proven by jsdom. Live Gemini task success remains quota-dependent.
- **Out of scope:** formal SIH P/R/F1, resource benches, final red-team, packaging.
