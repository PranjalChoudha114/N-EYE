# N-Eye Architecture Overview

## 1. System Identity
N-Eye is a privacy-preserving visual perception trust layer for browser agents. It operates as a Chrome Manifest V3 (MV3) extension, serving as an immutable trust boundary between the user's private browser session and remote AI reasoning engines.

Observation is **structure-first**. Local OCR / ROI capture / adaptive visual perception exist in `apps/extension/src/perception/` and run only when the adaptive controller records a reason. Raw screenshots are not sent to Gemini.

**Content script packaging (ADR-0008):** `content.js` must be a self-contained IIFE. Product UI pages and the service worker may use ES modules. A Vite ES `import` graph in the content script does not execute in the page and produces CONTENT SCRIPT DISCONNECTED.

## 2. Core Execution Loop
```
[ Webpage (DOM / Visual Pixels) ]
             │
             ▼ (Zone 0 -> Zone 1)
[ Browser Observer & Content Script ]
             │
             ▼ (Zone 1 -> Zone 3)
[ Adaptive Perception (ROI + local OCR when DOM/ARIA insufficient) ]
             │
             ▼
[ Local Sensitive Processing (Privacy Detection + Vault Tokenization) ]
             │
             ▼ (Zone 3 -> Zone 4)
[ Egress Guard: Strict SafeContext Construction & Byte-Level Canary Scan ]
             │
             ▼ (Zone 4 -> Zone 5 - Untrusted Network Boundary)
[ Remote Planner Gateway (FastAPI) -> Provider Adapter (Gemini / Mock) ]
             │
             ▼ (Zone 5 -> Zone 4 -> Zone 3)
[ Local Action Validator (schema + target + token scope + local risk; live re-ground at execute) ]
             │
             ▼ (Zone 3 -> Zone 1)
[ Local Action Executor (Content Script Live Reference Execution) ]
             │
             ▼ (Zone 1 -> Zone 3)
[ Local Verification Engine (State-Change Delta Confirmation) ]
```

## 3. Runtime Component Placement

| Component | Context | Primary Responsibility | Constraints / Trust |
|-----------|---------|------------------------|----------------------|
| **Content Script** | Isolated Webpage Context | Observes visible interactable DOM elements, visual-region geometry, ROI rasters, executes validated actions | Hostile-adjacent; no secrets or planner API keys |
| **Service Worker** | Chrome MV3 Background | Task lifecycle coordinator, message router, `captureVisibleTab` crop (RGBA only) | No DOM access; never logs data URLs |
| **Product UI** | Privileged Side Panel (owner) + isolated page overlay (view) | Compact glass card, Trust Center, OCR host (Tesseract WASM), Privacy Receipt, theme | Overlay has no vault; Side Panel observes state, does not store secrets |
| **Perception module** | Owner product-document JS | Adaptive decision, OCR, grounding/fusion, pixel release | Local-only rasters; OCR text still untrusted |
| **Planner Gateway** | Backend Service (`apps/planner-api`) | Validates SafeContext, holds provider API keys, formats structured prompt, returns ActionProposal | Server-side only; zero browser execution authority |
| **Provider Adapters** | Gateway Subsystem | Translates SafeContext into LLM structured generation (Gemini, OpenAI, Mock) | Vendor-isolated; output treated as untrusted data |
| **Remote Planner Client** | Extension Client (`apps/extension`) | Dispatches egress-guarded SafeContext via HTTP POST with timeout, cancellation, and retry | Strictly calls Egress Guard before transport |

## 4. Architectural Invariants
1. Raw DOM dumps, full screenshots, form values, and credentials never cross the network by default.
2. `SafeContext` is the sole allowed schema for outbound network planner requests.
3. `ActionProposal` returned by planners is untrusted advice and must be locally validated before execution. Extra keys and self-granted confirmation claims are rejected (ADR-0011).
4. HIGH-risk execution requires a local confirmation capability, then live revalidation.
4. Private token mapping (`[EMAIL_1]` -> `user@example.com`) is held purely in local memory and resolved at the moment of authorized execution.
5. All critical actions require post-execution verification against live page deltas.
6. Remote AI reasoning engines receive intelligence context only; they receive NO direct browser execution authority.
7. OCR-derived text uses the same privacy engine as DOM text (`source: 'ocr'`). Local OCR is not a bypass.
8. Visual evidence is bound to `PageEpoch` and frame identity. Stale evidence fail-closes rather than executing against a changed page or a different frame.
9. Frame provenance is local authority metadata. Same-origin frames may be observed from the top document. Cross-origin frames fail closed. `all_frames` is not enabled.
