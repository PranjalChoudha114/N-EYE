# T019/T020 — Manual Chrome checklist

Rebuild `apps/extension/dist/` then Reload the unpacked extension. True hot reload: **NO**.

**Identity gate (required before treating a screenshot as current source):**

1. `git rev-parse --short HEAD`
2. `cat apps/extension/dist/build-identity.txt`
3. Side Panel / overlay footer (`DEV • <sha>`)

These three must match. If the footer is older than HEAD (example: source `333631f` vs UI `8024af6*`), the screenshot is a **stale build**. Rebuild, Reload, refresh the page, reopen the Side Panel. Do not file a source bug from that capture.

Cursor IDE browser cannot load this MV3 extension. These steps are for a human Chrome profile.

## ASK_USER recovery (not confirmation)

1. Open a GitHub page (or test-portal). Side Panel → Mock.
2. Goal similar to: `Open UPESSEM1 Repositories`
3. Expect: headline **I need your help**, hint to rewrite, **Continue** (not Allow once), **Cancel** visible, Confirm box hidden.
4. Rewrite to a supported Mock goal (e.g. type in a search box if present) → Continue starts a **fresh** observation. It must not execute a stale proposal.
5. Cancel returns to Ready without minting approval.

## Human-first copy

1. Compact overlay/Side Panel should answer: what N-Eye is doing, whether a screenshot was sent, whether it needs you.
2. Compact view should not require knowing SafeContext, OCR, PageEpoch, or EgressGuard.
3. Evidence tab / View technical details still shows technical terms.

## Completion truth (8024af6 must not regress)

1. Repeat YouTube with a **current** identity. Preferred Mock phrasing: `Type OpenAI in the YouTube search box` (type-only) or `Search for OpenAI` (type + submit).
2. Naturalistic `Search For OpenAi In Youtube Search Bar` is a **search-submit** goal: Completed requires a verified type **and** a verified search click. Type-only is ASK_USER (partial), not green Completed.
3. Must not show Completed while VALIDATE/ACT/VERIFY are pending.
4. If the search box looks empty while the panel says Completed, first confirm identity and screenshot timing (YouTube may navigate). Do not assume a source regression.

## Privacy receipt

1. After a protected plan: “What N-Eye protected” / “What the AI received” first; technical details behind disclosure.

Classification after a human pass: **VERIFIED IN REAL RUNTIME**. Until then: **UNVERIFIED**.
