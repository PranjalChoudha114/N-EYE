# T017/T018 — Runtime resilience + failure/recovery + execution completion

**Gate:** Combined T017/T018  
**Date:** 2026-08-30  
**Starting HEAD:** `ea96f046cc6f45428d83a7a36c79bb2de07bde7f` (`feat(authority): bind confirmation and reject hostile planner claims`)  
**Architecture:** ADR-0012 (recovery) + ADR-0011 (confirmation; unchanged)

Evidence vocabulary: `IMPLEMENTED` | `TESTED` | `VERIFIED IN REAL RUNTIME` | `MEASURED` | `TARGET` | `UNVERIFIED` | `NOT_IMPLEMENTED`.

---

## 1. Starting SHA / ending SHA

- Starting: `ea96f04` (full `ea96f046cc6f45428d83a7a36c79bb2de07bde7f`)
- Ending: recorded in `docs/CONTEXT.md` §61 after commit
- Pushed: **NO** unless a later human instruction says otherwise

## 2. Incoming baseline (fresh, pre-implementation)

Recorded before source edits on this gate:

- `@n-eye/protocol`: 16 passed
- `@n-eye/extension`: 222 passed (live Gemini skipped: gateway offline)
- `apps/planner-api`: 26 passed (live Gemini ran on that machine that day)
- lint/typecheck/build: used as the incoming green bar

263 historical tests were **not** reused as this gate’s result.

## 3. Failure-surface audit (summary)

| Boundary | Previous | Defect | Action |
|---|---|---|---|
| Unicode / provider JSON | Page strings reached Python `json=` UTF-8 | Lone surrogates crashed Gemini serialize | Sanitize U+FFFD at egress + gateway |
| Planner HTTP | 1× 5xx retry, 500ms | No 429 Retry-After; 404 retried as generic; error bodies | Classified transport, bounded retry |
| Cancellation | AbortController on fetch | Late success / backoff races | Generation bump + abortable backoff + post-propose check |
| SW / hydrate | Snapshot restore | UI could look like an in-flight confirm | Hydrate strips confirmation; interrupted |
| OCR/capture | Fallback flags | Visual-required + fail still planned | `OCR_UNAVAILABLE` stop; screenshot 0 B |
| SELECT/SCROLL | Protocol only | No executor | Native select + bounded scroll |
| TYPE_TOKEN verify | Dispatch = success | App overwrite still SUCCESS | `fieldState === MATCHED` required |
| HIGH verify | Loop continued | Replay risk | ASK_USER, no automatic replay |
| Execute port | `success: false` dropped data | ASK_USER outcome lost | Transport success ≠ action success |

## 4. Unicode root cause

YouTube (and any page with malformed UTF-16 in titles/labels) can produce a lone high surrogate such as U+D83D in a JavaScript string. JSON may carry `\ud83d`. Python’s UTF-8 encoder rejects it (`surrogates not allowed`). Privacy/SafeContext were not the bug: the protected payload was still unsafe as a Unicode scalar sequence.

## 5. Unicode repair

- TS: `sanitizeUnicodeScalars` / `sanitizeUnicodeDeep` (`packages/protocol/src/unicode.ts`)
- Python: `sanitize_unicode` / `sanitize_json_value` / `encode_json_utf8` (`apps/planner-api/src/security/unicode.py`)
- Boundaries: EgressGuard stringify; gateway before adapter; Gemini/OpenAI `content=` UTF-8 bytes (not `json=` of unsanitized objects)
- Valid scalars unchanged. Invalid surrogates → U+FFFD. Deterministic. Not ASCII-only. Not emoji-stripping.
- Tests: `packages/protocol/src/__tests__/unicode.test.ts`, `apps/extension/src/__tests__/unicode-transport.test.ts`, `apps/planner-api/tests/test_unicode.py`

## 6. Provider taxonomy

| Class | Detect | Retry? | Terminal UI |
|---|---|---|---|
| 429 RATE_LIMITED | HTTP 429 | 1 extra, Retry-After cap 5s (default 1s) | `RATE_LIMITED` |
| 404 MISCONFIGURED | HTTP 404 | No | `PROVIDER_UNAVAILABLE` |
| 503 / other 5xx UNAVAILABLE | HTTP 503/5xx | Up to 3 attempts, backoff | `PROVIDER_UNAVAILABLE` |
| 504 / abort timeout | 504 or timed abort | Retryable within 3 | `PROVIDER_UNAVAILABLE` |
| Network | fetch throw | Retryable within 3 | `GATEWAY_UNREACHABLE` |
| Malformed / empty / schema | 200 body | No | `ERROR` |
| Cancelled | AbortSignal | No further request | `CANCELLED` |

Gateway `/v1/health` remaining up does not imply provider health.

## 7. Retry / backoff / idempotency

From implementation (not invented targets):

- `PLANNER_MAX_ATTEMPTS = 3`
- Base backoff 500ms, exponential, cap 5000ms
- 429 extra attempts: 1
- Identical `bodyStr` on every attempt
- HIGH + not `VERIFIED_SUCCESS` → no automatic action replay (`shouldStopAfterUnverifiedHighRisk`)
- Planner HTTP retry ≠ browser action replay

## 8. Cancellation

`taskGeneration` increments on `cancel()` and on tab/origin switch while running. After `propose`, execute, verify, WAIT: abort or generation mismatch throws AbortError. `abortableDelay` rejects on abort so backoff does not start the next fetch. Hydrate cannot resume a cancelled task.

## 9. MV3 recovery

- Vault: in-memory owner document only. Not persisted.
- Confirmation: `ConfirmationBroker` invalidated on task end, cancel, tab/origin change. Hydrate clears `confirmation` and marks interrupted if snapshot was running / awaiting confirmation.
- Overlay / Side Panel are views. They cannot mint a grant.
- Content-script missing: existing PING/inject-once path; unsupported pages fail explicitly.
- **Real SW termination:** architecture tests + this checklist. Not claimed as VERIFIED IN REAL RUNTIME.

## 10. OCR / capture

Failure → local fallback flag → if visual required and no fused labels and no labeled structure → `OCR_UNAVAILABLE`, screenshot outbound 0 B, no planner. Worker restart at most once on load failure. Cancellation during OCR recorded as `CANCELLED`.

## 11. SELECT

Implemented. Local `targetId`, native `HTMLSelectElement` only, option via `textValue` (value/text/label). Hidden/disabled/stale/wrong-semantic/wrong-frame rejected by existing validator/re-ground. Custom widgets → ASK_USER. Verifier requires `selectMatched`.

## 12. SCROLL

Implemented. Viewport if no target; container or `scrollIntoView` if targeted. Schema reject `|delta| > 2000`. Execute clamp 800px. No Infinity/NaN/script/selector. Verifier: moved, or truthful boundary, else failure. Fresh observation is the next loop step.

## 13. TYPE_TOKEN / TYPE_TEXT verification

Executor uses the native prototype value setter plus bubbling `input`/`change` (and bounded contenteditable insert). Live control is re-read (`MATCHED` / `EMPTY` / `DIVERGED` / `UNREADABLE`). After a fresh observation, `PROBE_FIELD_REQUEST` re-grounds by fingerprint when the node was replaced. Verifier requires `MATCHED` for success. Missing evidence → AMBIGUOUS. Evidence JSON must not contain the raw value.

Limitation: closed shadow roots and inaccessible iframes remain unobservable. Duplicate equivalent fields → ASK_USER.

## 13b. Local completion

Planner `COMPLETE` is not product success. `completion-arbiter.ts` requires verified local actions or a live already-satisfied field probe. Mock unknown grammar → ASK_USER. Green Completed with pending ACT/VERIFY is rejected unless already-satisfied (ACT skipped).

## 14. Privacy / network proof (automated)

Canaries: `CANARY_PASSWORD_T017`, `CANARY_OTP_T017`, `CANARY_API_T017`, `CANARY_EMAIL_T017@example.com` plus existing T005 patterns.

Proven on the serialized planner body in unit/integration tests: secrets absent; retries identical; no `\ud83d` after sanitize; screenshot outbound 0 in perception-failure and trust-loop evidence updates. Egress violation messages no longer echo the matched canary.

Not claimed: every Chrome network panel on every site.

## 15. Security regression

Existing T015/T016 suites remain in the 263 extension tests: proposal extra keys, token scope, confirmation binding, injection corpus, message-boundary, risk escalate-only.

## 16. Adversarial combinations (automated)

| ID | Result |
|---|---|
| A Unicode + canaries + 503 retry | Same protected body; secrets absent |
| I extra authority fields | Shape gate rejects |
| F SELECT after SPA remove | Execute fail-closed |
| H TYPE_TOKEN overwrite | Not VERIFIED_SUCCESS |
| 429/503 cancel backoff | No further fetch (planner-resilience) |
| Hydrate running/confirm | No resurrected confirmation |
| HIGH ambiguous | Stop helper TESTED; loop uses it |

## 17. Fresh automated counts (this gate, post-repair)

Recorded after the local-completion repair (not the earlier 327 seal):

- `@n-eye/protocol`: 27 passed / 0 failed
- `@n-eye/extension`: 285 passed / 0 failed
- `apps/planner-api`: 40 passed this run (live Gemini included on this machine)
- TOTAL: 352 passed / 0 failed
- lint: 0 errors (pre-existing `no-console` warning in real-gemini integration test)
- typecheck: pass
- `pnpm build:extension`: pass; `dist/content.js` IIFE present; identity `DEV • 3cdd2fd*` before the repair commit

## 18. Real Chrome / YouTube

- Unpacked Chrome checklist: **UNVERIFIED** until the human reloads the rebuilt dist (`T017-T018-MANUAL-CHECKLIST.md`)
- False COMPLETE on YouTube Mock: **root-caused** in source; **must not recur** after rebuild + Reload
- YouTube live Gemini success: **UNVERIFIED** / may be **BLOCKED BY 429**
- Unicode transport: **TESTED** (deterministic). Chrome YouTube: UNVERIFIED until a human runs C and the type-text checklist.

## 19. Known limitations

- Custom SELECT widgets are ASK_USER, not JS automation.
- “Search for X” is not complete after typing if no unique search/submit control exists.
- Closed shadow / inaccessible iframe / custom combobox: ASK_USER or unsupported.
- jsdom ≠ real MV3 service-worker kill.
- Formal SIH P/R/F1 not this gate.
- Live Gemini availability not guaranteed.
