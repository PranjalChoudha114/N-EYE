# N-Eye Architecture Recommendations Log

## 1. Recommendations Overview
This log tracks architecture proposals, trade-offs, and decisions made during the evolution of N-Eye.

| ID | Title | Status | Impact Area | Summary |
|----|-------|--------|-------------|---------|
| REC-001 | Use Branded Types for Identifiers | **Adopted** | Protocol | Use opaque branded nominal types for `TaskId`, `ElementId`, `TokenId` to prevent domain mix-ups. |
| REC-002 | Strict Outbound Schema Allowlist | **Adopted** | Network / Egress | Eliminate generic dictionary/JSON serialization for outbound network requests; allow only strict `SafeContext`. |
| REC-003 | Defer React for Genesis Extension Shell | **Adopted** | Extension UI | Use Vanilla HTML/TS for Phase 1 MV3 shell; introduce React in subsequent UI-focused task to minimize initial moving parts. |
| REC-004 | In-Memory Token Vault for Prototype | **Adopted** | Vault / Privacy | Avoid persistent storage (IndexedDB/chrome.storage) for token mappings to prevent leakages across browser restarts. |
| REC-005 | Debounced Mutation Tracking for PageEpoch | **Adopted** | Observer / DOM | Debounce DOM mutations by 60ms and filter for interactive attributes (`hidden`, `disabled`, `style`, `class`) to prevent epoch churn. |
| REC-006 | Bounded Label Candidates | **Adopted** | Observer / Security | Enforce a strict 120-character limit on extracted label candidates to prevent prompt-injection bloat and memory attacks. |
| REC-007 | Structural Target Fingerprinting | **Adopted** | Grounding / Security | Generate deterministic djb2 digest from role, tag, inputType, normalized label, and relative geometry to enable robust re-grounding without exposing secrets. |
| REC-008 | Tighten gateway CORS | **Proposed** | Network | Replace `allow_origins=["*"]` + credentials with an explicit chrome-extension + localhost allowlist. Wire `config.allowed_origins`. ADR if origin policy becomes product-facing. |
| REC-009 | Split Side Panel orchestration | **Proposed** | Extension UI | Extract trust-loop orchestration from `sidepanel.ts` into a dedicated coordinator. Not a product feature. |
| REC-010 | TYPE_TOKEN verifier value check | **Proposed** | Verification | After TYPE_TOKEN, re-read the live control (without sending the value over the network) instead of treating event dispatch as success. |
| REC-011 | Implement SELECT / SCROLL executor | **Proposed** | Execution | Protocol types exist; executor has no branch. Implement only when a gate needs them. |
| REC-012 | PageEpoch characterData | **Adopted** (ADR-0009) | Observation | Classified `characterData` on interactive/label nodes advances epoch; non-interactive clocks do not. |
| REC-013 | Remove unused `clientCapabilities` Any hole | **Proposed** | Planner API | `PlanRequest.clientCapabilities: Dict[str, Any]` is unused. Prefer deletion or a strict schema before any client sends it. |
| REC-014 | ADR-0006 wording | **Proposed** | Docs | Replace “cryptographic guarantees” language with byte-level canary / regex scanning. Canary tests are not a crypto proof. |
| REC-015 | Automatic Chrome extension reload | **Rejected for prototype** | DX | MV3 unpacked extensions do not HMR. A custom Chrome-automation reloader is extra moving parts. Documented Reload click is the supported loop. |
| REC-016 | Third-Party Network Privacy Guard | **Proposed** | Website privacy (not SIH core) | Future capability to evaluate third-party requests, trackers, analytics, cookies/storage, fingerprinting, with allowlists and site compatibility. **Not** the current SIH protection boundary (N-Eye AI planner egress). Do not implement as uBlock/Privacy Badger in this prototype. |
| REC-017 | Replace Tesseract if UI-font CER is weak | **Proposed** (not justified at T009/T010) | Perception | Keep the `OcrEngine` seam. T009/T010 held-out high-contrast fixtures did not justify ONNX/WebGPU. Re-open only if realistic UI-font CER fails materially. |
| REC-018 | Bundle MV3 content.js as IIFE | **Adopted** | Extension runtime | Chrome content_scripts cannot execute Vite ES `import` graphs. T009/T010 IIFE + handshake. ADR-0008. |

## 2. REC-016 — Third-Party Network Privacy Guard (not implemented)

N-Eye's current SIH protection boundary is the **remote AI planner egress** (SafeContext → Egress Guard → gateway). Website privacy features that inspect third-party requests, trackers, analytics beacons, cookies/storage, fingerprinting, or that block network requests are a **separate product class**.

A future Third-Party Network Privacy Guard could evaluate those signals with site allowlists and compatibility controls. That is **not** the T007/008 or SIH core path. Do **not** turn N-Eye into uBlock Origin / Privacy Badger during this prototype.

