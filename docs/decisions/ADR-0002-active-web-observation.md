# Architecture Decision Record (ADR) 0002: Active-Web Observation & Target Identity

## Status
**ACCEPTED**

## Context
In Task 002, N-Eye transitioned from static test-portal evaluation to dynamic observation on the user's active webpage. We needed:
1. Deterministic target identification that remains opaque (`e1`, `e2`) and decoupled from private values or XPath selectors.
2. A lightweight freshness signal (`PageEpoch`) to prevent stale actions after DOM mutations without causing excessive epoch churn.
3. A structural signature (`TargetFingerprint`) to support future live action re-grounding without leaking raw input values.
4. Programmatic fallback injection to handle pre-existing browser tabs seamlessly.

## Decisions
1. **ElementRegistry**:
   - In-memory `Map<string, RegistryEntry>` held strictly in the content script (Zone 1).
   - Generates sequential opaque IDs (`e1`, `e2`, ...).
   - Validates live node attachment via `.isConnected` and purges detached nodes via `cleanupDetached()`.
2. **Debounced PageEpoch**:
   - `PageEpochManager` attaches a `MutationObserver` to `document.documentElement` with a 60ms debounce window.
   - Reacts to `childList` additions/removals and interactive attribute modifications (`hidden`, `aria-hidden`, `disabled`, `class`, `style`).
3. **TargetFingerprint**:
   - Computes a deterministic djb2 digest from `role`, `tagName`, `inputType`, `normalizedLabelCandidate`, and relative bounding box percentages.
   - Strictly excludes input `.value`, passwords, or raw user secrets.
4. **Programmatic Injection Fallback**:
   - Added Chrome `"scripting"` permission and removed unused `"storage"` permission.
   - When a tab lacks a running content script, the extension programmatically injects `content.js` before executing observation.

## Consequences
- **Positive**: Seamless connection across live web pages; zero generic value leakage; reliable re-grounding signals.
- **Negative**: Broad class/style mutations can cause benign epoch invalidation on hover-heavy websites (handled fail-closed).
