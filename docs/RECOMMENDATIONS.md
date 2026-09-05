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
| REC-032 | Enter key as search submit | **Adopted** (ADR-0014, T025) | Execution | Constrained `PRESS_ENTER` only. Unique search/submit CLICK still preferred. Ambiguous submits ASK_USER. Synthetic Enter is untrusted; Chrome YouTube remains HUMAN REQUIRED. |
| REC-033 | Map `HTMLButtonElement.type` into fingerprint inputType | **Adopted** (T025) | Observation / identity | Observer and live re-ground share `inputTypeOf`. HIGH risk stays form-associated (`formSubmitting`) or file — a standalone default button is not HIGH merely because HTML `type` is submit. |
| REC-034 | Capability routing as default UI | **Proposed** | Planner | Exclusive MOCK/REMOTE remains default (ADR-0012/0013). Capability routing is implemented but opt-in. |
| REC-035 | Trusted-event Enter | **Proposed** | Execution | Sites that ignore untrusted KeyboardEvents will not submit on PRESS_ENTER without a form. Do not add `chrome.debugger` without a new ADR. |
| REC-036 | Closed-shadow / custom-element hosts | **Proposed** | Observation | Open shadow is walked. Closed shadow and custom hosts without `role=button` remain unobserved. Visual escalation is the honest fallback; do not fake closed-root access. |
| REC-037 | Learned icon morphology | **Deferred** | Perception | Generic magnifying-glass CV is not in this repair. Structural/ARIA/SVG title/adjacent-search scoring is the baseline. Re-open only if those remain insufficient after measurement. |
| REC-038 | Personal intelligence settings UI | **Proposed** | Product UX | NALIS v1 exposes enable/clear/inspect APIs and Evidence rows (count, learning on/off, health). A dedicated settings dashboard was not built so the intelligence repair would not derail. |
| REC-039 | Long-term generalized memory persistence | **Deferred** | Memory / privacy | SESSION in-memory only (ADR-0017). `chrome.storage` of sanitized episodes would be a new trust-boundary ADR. Not the vault. |
| REC-040 | Chrome built-in on-device LanguageModel | **Proposed** | Intelligence | Feature-detected UNAVAILABLE in this environment. Re-open NALIS admission only with license + Chrome resource/latency/privacy evidence. Do not bundle Transformers.js to “have an LLM.” |
| REC-041 | Patent / novelty candidates (UNVERIFIED) | **Record only** | Legal | Possible future invention/prior-art review topics: verification-gated personalization; privacy-tiered learning memory; generalized affordance memory; evidence-driven perception escalation; personalization structurally unable to modify authority; auditable learning provenance. **Patent novelty is UNVERIFIED pending formal prior-art/legal review.** Do not describe N-Eye Intelligence as patented, patent pending, or world’s first. |
| REC-042 | Verified Task Report | **Adopted** (ADR-0018, T027) | Product UX / evidence | View Report after every terminal task. Facts from local ledger only. Partial and failure reports are first-class. |
| REC-043 | Chrome E2E SIH measurement | **Proposed** | Evaluation | T027/T028 Node/happy-dom RESULT plus Tesseract fixtures. Formal Chrome RSS/CPU, live HTTP canary, and page↔report agreement remain HUMAN REQUIRED (extends REC-024). |
| REC-044 | Rename internal NALIS identifiers to NI | **Deferred** | Hygiene | Human-facing copy uses N-Eye Intelligence. Broad internal rename is late-project risk. |
| REC-045 | Canonical control / AccName / typed egress | **Adopted** (ADR-0019, T027/T028-FR1) | Grounding / Report | One logical control; AccName order; TYPE haystack excludes inputType; TYPE→SUBMIT TaskGraph; empty password is a control not a value; `egressAudit` not string PASS. |
| REC-046 | MV3 session persistence of TaskGraph | **Proposed** | Lifecycle | In-flight task/confirmation state is process memory. Worker kill fails closed (no stale execute) but loses progress. `chrome.storage.session` without secrets is a later gate. |
| REC-047 | Full W3C AccName (shadow/slot/hidden) | **Proposed** | Observation | FR1 implements the HTML subset used by Selenium-like forms. Do not claim full AccName parity. |
| REC-048 | T029 residual (Chrome / Remote / destination proof) | **Proposed** | T030 | Human Chrome FR1 + T029-R1 RC08 still empty. Live `/v1/plan` body UNVERIFIED. Action-level verifier still treats any URL/origin change as success; **task-level** SEARCH/NAVIGATE now require query/resource mention in outcome hay (T029-R1-F007). Do not add site selectors or `chrome.debugger`. |
| REC-049 | One-step OPEN_SEARCH_SURFACE | **Deferred** (POST-SIH) | Intelligence | Do not wander. A single reversible click on a unique search opener when no SEARCH_INPUT is exposed was not wired. H07 FIT was SEARCH_COMMIT representation, not missing opener click. |
| REC-050 | Indian-mobile 10-digit prose FP | **Proposed** | Privacy | `IN_MOBILE` can still TOKENIZE a 10-digit run starting 6–9 in unrelated page text. Do not disable globally. Improve only with field/source/task context + regressions. |

## 2. REC-016 — Third-Party Network Privacy Guard (not implemented)

N-Eye's current SIH protection boundary is the **remote AI planner egress** (SafeContext → Egress Guard → gateway). Website privacy features that inspect third-party requests, trackers, analytics beacons, cookies/storage, fingerprinting, or that block network requests are a **separate product class**.

A future Third-Party Network Privacy Guard could evaluate those signals with site allowlists and compatibility controls. That is **not** the T007/008 or SIH core path. Do **not** turn N-Eye into uBlock Origin / Privacy Badger during this prototype.

