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
| REC-009 | Split Side Panel orchestration | **Adopted** | Extension UI | Trust-loop orchestration lives in `runtime/trust-loop.ts`. Product UI is a view/control surface (ADR-0010). |
| REC-010 | TYPE_TOKEN verifier value check | **Adopted** (T017/T018) | Verification | After TYPE_TOKEN, re-read the live control (without sending the value over the network) instead of treating event dispatch as success. |
| REC-011 | Implement SELECT / SCROLL executor | **Adopted** (T017/T018) | Execution | Native `<select>` + bounded SCROLL. Custom widgets ASK_USER. No planner JS/selectors. |
| REC-012 | PageEpoch characterData | **Adopted** (ADR-0009) | Observation | Classified `characterData` on interactive/label nodes advances epoch; non-interactive clocks do not. |
| REC-013 | Remove unused `clientCapabilities` Any hole | **Proposed** | Planner API | `PlanRequest.clientCapabilities: Dict[str, Any]` is unused. Prefer deletion or a strict schema before any client sends it. |
| REC-014 | ADR-0006 wording | **Proposed** | Docs | Replace “cryptographic guarantees” language with byte-level canary / regex scanning. Canary tests are not a crypto proof. |
| REC-015 | Automatic Chrome extension reload | **Rejected for prototype** | DX | MV3 unpacked extensions do not HMR. A custom Chrome-automation reloader is extra moving parts. Documented Reload click is the supported loop. |
| REC-016 | Third-Party Network Privacy Guard | **Proposed** | Website privacy (not SIH core) | Future capability to evaluate third-party requests, trackers, analytics, cookies/storage, fingerprinting, with allowlists and site compatibility. **Not** the current SIH protection boundary (N-Eye AI planner egress). Do not implement as uBlock/Privacy Badger in this prototype. |
| REC-017 | Replace Tesseract if UI-font CER is weak | **Proposed** (not justified at T009/T010) | Perception | Keep the `OcrEngine` seam. T009/T010 held-out high-contrast fixtures did not justify ONNX/WebGPU. Re-open only if realistic UI-font CER fails materially. |
| REC-019 | Confirmation capability (not boolean) | **Adopted** (ADR-0011) | Authority | T015/T016: single-use grant bound to action/context; post-approval revalidation. |
| REC-020 | Do not put confirmationId in overlay ProductState | **Proposed** | Overlay / Zone 1 | Overlay paint currently includes `confirmationId`. Page world cannot use it. A modified content script could. Prefer owner-document-only confirm if a later hardening pass is opened. |
| REC-021 | Local completion arbiter | **Adopted** (T017/T018 repair) | Trust loop | Planner COMPLETE is advice. Product Completed requires verified local evidence or already-satisfied live field proof. |
| REC-022 | Unicode-aware email local-parts | **Proposed** | Privacy detectors | ASCII email regex can match a suffix of `café-bench@example.com`. Full Unicode local-parts are not first-class. |
| REC-023 | ASK_USER candidate picker | **Deferred** | Product UX | T019 uses rewrite+Continue. Local opaque candidate choice with fresh re-observation was not built. Do not let page HTML define options. |
| REC-024 | Chrome E2E SIH measurement | **Proposed** (T021/T022) | Evaluation | T019 latency/resource is Node/happy-dom RESULT plus OCR on fixtures. Formal Chrome RSS/CPU and live HTTP canary remain UNVERIFIED. |
| REC-025 | Mock-dialect arbiter coverage | **Proposed** | Completion | `arbitratePlannerComplete` uses `parseMockGoal`. Goals outside that dialect can COMPLETE after any verified actionable type. Expanding the dialect is a product change, not a silent forensic patch. |
| REC-026 | Stale unpacked identity | **Documented** (T019 forensic) | DX | Chrome MV3 has no HMR. Accept screenshots only when HEAD / `dist/build-identity.txt` / Side Panel footer match. |
| REC-027 | Unique Mock click targets | **Adopted** (T021) | Mock planner | First-match CLICK on duplicate labels is a guess. `pickUniqueClickTarget` abstains. Not a site-specific patch. |
| REC-028 | OCR-labeled visual surfaces are click-capable | **Adopted** | Mock planner / visual action | Canvas/img already registered as local nodes. Mock `isClickCapable` had required button/link, so fused OCR labels never became CLICK. Unlabeled visual surfaces still ASK_USER. Not site-specific; not planner coordinates. |
| REC-029 | Self-host Orbitron (OFL) | **Proposed** | Product UI | Display stack currently uses Orbitron only if already installed; otherwise geometric system fallbacks. Bundling OFL Orbitron would need a license-file decision. No CDN. |
| REC-030 | Compact-card trust-rail glance | **Proposed** | Product UI | Overlay has no Look…Prove rail today. A tiny 7-dot glance on the card would be presentation-only if it bound to existing `pipeline` visuals. Not built. |
| REC-032 | Enter key as search submit | **Proposed** | Execution | Some pages submit search only via Enter in the field. Architecture has no PRESS_ENTER action. Unique search/submit CLICK is the supported path; otherwise ASK_USER. Do not add a new action type until explicitly gated. |
| REC-033 | Map `HTMLButtonElement.type` into fingerprint inputType | **Proposed** | Observation / identity | `inputTypeOf` returns null for `<button type="submit">`; form-submit HIGH risk uses `formSubmitting` instead. Not the post-confirm remint bug. Changing this would alter semantic keys; do not mix into identity repair. |

## 2. REC-016 — Third-Party Network Privacy Guard (not implemented)

N-Eye's current SIH protection boundary is the **remote AI planner egress** (SafeContext → Egress Guard → gateway). Website privacy features that inspect third-party requests, trackers, analytics beacons, cookies/storage, fingerprinting, or that block network requests are a **separate product class**.

A future Third-Party Network Privacy Guard could evaluate those signals with site allowlists and compatibility controls. That is **not** the T007/008 or SIH core path. Do **not** turn N-Eye into uBlock Origin / Privacy Badger during this prototype.

