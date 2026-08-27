# N-EYE TASK 002 — Pre-Implementation Report

## 1. Genesis Audit & Gap Analysis

| Requirement Area | Genesis Status | Task 002 Target | Action |
|---|---|---|---|
| **Active Web Connection** | `PARTIAL` | Automatic connect on sidepanel open/tab switch, graceful handling of unsupported `chrome://` URLs | Implement auto-connect, tab change listener, and unsupported page state handling |
| **Page Observer** | `PARTIAL` | Robust visibility checking, explicit `<input type="hidden">` exclusion, strict label sanitization & length bounding, 0 generic value collection | Harden `isElementVisible`, precedence in `getSanitizedLabelCandidate`, and value exclusion |
| **Element Registry** | `PARTIAL` | Dedicated `ElementRegistry` module managing `RegistryEntry`, live node mappings, lookup by `ElementId`, and detached cleanup | Create `ElementRegistry` with lifecycle methods and opaque ID generation |
| **PageEpoch** | `PARTIAL` | Batched/debounced mutation tracking to avoid churn; clear epoch invalidation semantics | Implement debounced MutationObserver with meaningful interactive target detection |
| **Target Fingerprinting** | `MISSING` | Structural fingerprint (`role`, `tagName`, `inputType`, `sanitizedLabel`, relative geometry, digest) | Add `TargetFingerprint` to `@n-eye/protocol` and generator in content script |
| **Side Panel UI** | `PARTIAL` | Premium, minimal, highly legible UI with active page status, 6-stage trust loop indicators, and collapsible evidence mode | Complete redesign using modern native CSS & robust state machine |
| **Controlled Test Portal** | `PARTIAL` | Scenarios 01 (Form), 02 (Visibility), 03 (Dynamic Rerender), 04 (Adversarial Semantics) | Add Scenarios 02, 03, 04 with canary test elements |
| **Automated Tests** | `PARTIAL` (5 tests) | Deep unit test suite covering observer, value exclusion, registry, epoch, fingerprints, and protocol | Add extensive Vitest unit tests |

---

## 2. Permission Audit

| Permission | Genesis Justification | Task 002 Status | Downstream Requirement |
|---|---|---|---|
| `sidePanel` | Chrome MV3 side panel display | **RETAINED** | Required to display trusted extension UI |
| `activeTab` | Temporary active tab access on user invocation | **RETAINED** | Core privacy model: only inspect tab when user activates N-Eye |
| `storage` | Local non-secret preferences | **RETAINED** | For UI settings (e.g. dev mode toggle) |
| `tabs` | Tab querying and tab event tracking | **AUDITED / RETAINED** | Required to track `tabs.onActivated` and `tabs.onUpdated` so sidepanel automatically reflects current active tab |
| Host `<all_urls>` | Content script injection | **RETAINED** | Required for observing user-navigated web pages and test portal |

---

## 3. File Plan

### Files to Create:
- `packages/protocol/src/fingerprint.ts`: `TargetFingerprint` schema and builder.
- `apps/extension/src/content/observer.ts`: Core page observation engine with strict value exclusion and label precedence.
- `apps/extension/src/content/registry.ts`: `ElementRegistry` managing live node mappings, opaque IDs, and stale reference cleanup.
- `apps/extension/src/content/epoch.ts`: `PageEpochManager` with debounced mutation handling.
- `packages/protocol/src/__tests__/fingerprint.test.ts`: Vitest tests for fingerprint generation.
- `apps/extension/src/__tests__/observer.test.ts`: Vitest unit tests for observer & value exclusion with JSDOM.
- `apps/extension/src/__tests__/registry.test.ts`: Vitest unit tests for element registry.
- `apps/extension/src/__tests__/epoch.test.ts`: Vitest unit tests for epoch manager.
- `apps/test-portal/scenario-02-visibility.html`: Controlled scenario for visibility checks.
- `apps/test-portal/scenario-03-dynamic.html`: Controlled scenario for dynamic rerender & stale target detection.
- `apps/test-portal/scenario-04-adversarial.html`: Controlled scenario for adversarial labels and injections.

### Files to Modify:
- `packages/protocol/src/raw-scene.ts`: Add `fingerprint` to `RawElement`.
- `packages/protocol/src/index.ts`: Export fingerprint types.
- `packages/protocol/src/messages.ts`: Add `TAB_CHANGED`, `UNSUPPORTED_PAGE`, and active-tab state messages.
- `apps/extension/src/content/content-script.ts`: Modularize using `observer.ts`, `registry.ts`, and `epoch.ts`.
- `apps/extension/src/background/service-worker.ts`: Add active-tab tracking (`tabs.onActivated`, `tabs.onUpdated`).
- `apps/extension/src/sidepanel/index.html`: Complete UI redesign.
- `apps/extension/src/sidepanel/sidepanel.css`: Modern, accessible, dark-themed styling.
- `apps/extension/src/sidepanel/sidepanel.ts`: State machine, auto-connection, evidence drawer.
- `docs/CONTEXT.md`: Update operational memory.

---

## 4. Privacy & Security Impact
- **Zero generic value collection**: Input `.value`, textarea text, password strings, and hidden form inputs are strictly excluded from `RawElement`.
- **Label length bounding**: Maximum 120 characters to prevent prompt-injection bloat and memory attacks.
- **Opaque IDs**: Format `e1`, `e2`, ... - strictly decoupled from selectors, DOM paths, or private values.
- **No remote calls**: All observation and fingerprinting occur entirely in the local browser tab (Zone 1).
