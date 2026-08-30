# T017/T018 — Manual Chrome runtime checklist

Load unpacked `apps/extension/dist/` after rebuild. Refresh target pages. Reopen Side Panel if it was open.

**Status of this file:** checklist for a human. Items below are **UNVERIFIED** until ticked in a real Chrome session. Automated tests do **not** convert this file to VERIFIED IN REAL RUNTIME.

Do not replay the automated suite by hand. These checks cover browser/runtime properties jsdom cannot prove.

## A. Normal HTTPS regression
1. Open a normal HTTPS page.
2. Toolbar toggles the overlay card.
3. More opens the Side Panel Trust Center.
4. Mock mode: a labeled-button task such as “click Continue” still runs when a unique Continue control exists. A Continue goal on a page without that control must ASK_USER, not Completed.

## B. Unicode / Scenario 13
1. Open `apps/test-portal/scenario-13-resilience.html`.
2. Confirm overlay/Side Panel show emoji + हिन्दी + 中文 in the page, not as an error.
3. Remote mode: a short goal such as “Select India” must not fail with a local UTF-8 surrogate crash (`surrogates not allowed` / 502 from encoding).
4. If Remote returns 429, record rate-limiting truthfully. That still counts as Unicode-transport proof if the request reached the gateway.

## C. YouTube real-world (optional; quota-dependent)
1. Remote mode on youtube.com with a harmless goal.
2. Old failure was gateway 502 from unpaired `\ud83d` in serialization.
3. Pass if that encoding crash is gone.
4. If Gemini returns 429: record `UNICODE FIX` separately from live-task success. Do not claim Gemini planned successfully.

## D. Provider failure presentation
1. Remote mode with gateway down → Side Panel/overlay show gateway unreachable (not “Gemini healthy”, not fake COMPLETE).
2. If 429 is controllable, UI shows planner rate limited.
3. Mock vs Remote labels stay honest. No silent Mock result while the control says Remote.

## E. SELECT
1. Scenario 13 native Country select.
2. After a permitted SELECT, the visible option is India (or the chosen option), not merely that an event fired.

## F. SCROLL
1. Scenario 13 scroll container / page.
2. Bounded scroll moves content or reports a boundary truthfully.
3. The next step uses a fresh observation (do not reuse a pre-scroll target blindly).

## G. TYPE_TOKEN
1. Fill the Scenario 13 email via Mock/Remote as the product allows.
2. Evidence must not show the raw email or password/OTP/API canary values.
3. Arm “overwrite on input” then retry: verifier must not claim success if the field was cleared.

## H. Cancellation
1. Start a Remote task (or a delayed Mock path).
2. Cancel while planning/retrying.
3. A late completion must not click/type/select after Cancelled.

## I. Privacy
1. Evidence “Screenshot outbound” stays `0 B` on the tested path.
2. Password `CANARY_PASSWORD_T017` and OTP `CANARY_OTP_T017` absent from Evidence SafeContext JSON.

## J. UI regression
1. Overlay layout/branding unchanged except new truthful phases (retrying, rate limited, provider unavailable, OCR unavailable, ask user).
2. Side Panel structure unchanged (Activity / Privacy / Action / Evidence).
3. Dark / light / system still work.
4. ASK_USER must not show Confirm. Confirm appears only with a pending confirmation capability.

## K. Service-worker sleep (optional; do not fake)
1. If Chrome DevTools can terminate the service worker without dangerous assumptions: pending HIGH confirmation must not survive as a bare approval after restart.
2. If this cannot be done reliably, leave **UNVERIFIED**. jsdom hydrate tests are not this check.

## L. TYPE_TEXT / false completion (this repair)
1. Rebuild `pnpm build:extension`. Confirm Side Panel identity matches the repair SHA (dirty `*` is OK if uncommitted at build time).
2. Scenario 14 (`apps/test-portal/scenario-14-text-input.html`), Mock: “Type OpenAI in the search box” on the **native search** field. OpenAI must appear. VALIDATE/ACT/VERIFY must not stay pending if Overall is Completed.
3. Overwrite-on-input field: must **not** show Completed.
4. Duplicate search boxes: ASK_USER / ambiguous, not a guessed field.
5. YouTube Mock: “Type OpenAI in the YouTube search box” — either OpenAI is visible in search **or** N-Eye says ASK_USER / failed. **Never** Completed with an empty box.
6. Unrelated public search field (harmless type only, do not submit): same honesty rule.
7. Goal “Search for OpenAI” on a page with no search button: typing is not overall Completed.
8. Remote, gateway down: Gateway unreachable, not Completed. Screenshot outbound 0 B.

## Pass rule
Tick A–J only from a live unpacked session. K is optional and may remain UNVERIFIED. L is required for this completion-repair seal; do not tick L from jsdom.
