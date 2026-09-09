# N-Eye — Canonical Product & Architecture Understanding

> **Mission**: AI needs context. Not your identity.
> **Tagline**: Privacy-preserving visual perception trust layer for lightweight browser agents.
> **Problem Statement**: ISRO / Smart India Hackathon 2026 • PS 26171

---

## 1. What Is N-Eye?

N-Eye is an **on-device visual perception and action trust layer** that sits between a user's private browser session and remote AI reasoning models. 

Standard cloud-first browser agents (such as OpenAI Operator, Anthropic Computer Use, or raw Playwright LLM scrapers) operate by capturing continuous full-resolution screenshots, raw DOM trees, and unredacted form values, streaming them directly over the network to cloud vision-language models (VLMs). This exposes passwords, OTPs, session cookies, financial numbers, personal identifiers, and private page contents to third-party AI APIs. Furthermore, these agents grant remote models unconstrained authority to execute arbitrary JavaScript, XPath selectors, or uncontrolled clicks directly on the user's live browser.

**N-Eye fundamentally reverses this paradigm:**
- The browser stays in control of the private environment and retains final execution authority.
- The remote AI receives only an abstract, sanitized, and tokenized **`SafeContext`** needed for planning.
- The remote model's output is treated strictly as **untrusted advisory proposals** (`ActionProposal`).
- The local browser validates the proposal against current DOM state, resolves private tokens in local memory, prompts for human confirmation on high-risk actions **as a bound capability** (this action, this target, this context — not a standing permission), executes native events on live nodes, and verifies the resulting state-change delta.
- **Page content is data, never policy.** DOM, ARIA, OCR, and document text may impersonate SYSTEM/DEVELOPER instructions or fake user confirmation. That remains an observation. Local risk classification, token scope, confirmation binding, and TOCTOU revalidation are the authority boundary. The planner prompt names this (contract `n-eye-planner-policy/5`) as defense-in-depth only.
- When DOM/ARIA is insufficient, N-Eye may read **local pixels** (bounded ROI + on-device OCR). Pixels are a new local input, not a privacy bypass.

---

## 2. The Canonical Trust Loop

Every N-Eye task step executes through an immutable lifecycle:

```
[ Active Webpage (Zone 0: Hostile DOM / Pixels) ]
                     │
                     ▼
1. SEE LOCALLY       — Observe visible interactable DOM structure & compute TargetFingerprints.
                     │
                     ▼
2. PERCEIVE LOCALLY  — Escalate OCR / ROI ONLY when DOM structure is insufficient.
                     │   Adaptive controller records WHY. Raw pixels released after OCR.
                     │
                     ▼
3. PROTECT LOCALLY   — Detect PII/secrets in DOM + OCR; tokenize into scoped capabilities.
                     │
                     ▼
4. EGRESS GUARD      — Build SafeContext allowlist; byte-level canary scan; enforce 256KB bound.
                     │
     ════════════════╪════════════════ NETWORK BOUNDARY ════════════════
                     │
5. THINK REMOTELY    — Remote Planner Gateway (FastAPI) + Model Adapter (Gemini / Mock)
                     │ produces structured ActionProposal (untrusted advice).
                     │
     ════════════════╪════════════════ NETWORK BOUNDARY ════════════════
                     │
6. VALIDATE LOCALLY  — Validate element existence, live target semantics & token scope.
                     │   (`ActionProposal` has no epoch field; freshness is live re-grounding at execute time.)
                     │
                     ▼
7. RESOLVE & ACT     — Resolve token value in local memory; prompt on locally approved HIGH risk; dispatch native events.
                     │
                     ▼
8. VERIFY LOCALLY    — Observe post-state; prove genuine delta (epoch progression / DOM mutation).
                     │
                     ▼
9. REPORT            — Build View Report from the local evidence ledger. Claims without evidence are not facts.
```

---

## 3. Trust Model & Boundary Rules

N-Eye enforces a strict 6-zone security model:

| Zone | Name | Location | Trust Level | Responsibility & Authority |
|---|---|---|---|---|
| **0** | Webpage | Live Browser Tab | **Hostile** | Untrusted third-party DOM, canvas, scripts, and adversarial injections. |
| **1** | Content Script | Isolated Webpage Context | **Hostile-Adjacent** | Observes DOM, maintains live node references, executes validated actions, extracts ROI rasters. |
| **2** | Privileged Core | Background Service Worker | **Trusted Coordinator** | Task lifecycle, tab tracking, inter-module messaging, `captureVisibleTab` crops. |
| **3** | Local Processing | Extension In-Memory Runtime | **Trusted Authority** | Privacy detectors, token vault, OCR, action validator, re-grounding, verifier. |
| **4** | Network Boundary | Extension Egress Client | **Controlled Gateway** | Egress Guard validation, byte scanning, schema enforcement, timeout/abort. |
| **5** | Remote Planner | Cloud / Planner Gateway | **Untrusted Advisory** | High-level reasoning over SafeContext; **zero browser execution authority**. |

### Immutable Boundary Invariants
1. **Secrets NEVER cross the network**: Passwords, OTPs, API keys, session tokens, and raw PII remain local.
2. **RawScene is Local-Only**: `RawScene`, live DOM references, unredacted text, full screenshots, and raw OCR never leave Zone 3 by default.
3. **SafeContext is the Sole Egress Contract**: Outbound payloads are strictly allowlisted JSON schemas.
4. **Remote AI is Untrusted Advice**: The planner cannot run scripts, invent element IDs, or bypass local validation.
5. **Private Token Mappings Remain Local**: `[EMAIL_1]` is mapped to `user@example.com` exclusively in local volatile memory.
6. **Actions Require Live Re-grounding**: Proposals must match live element fingerprints before execution.
7. **High-Risk Actions Require Explicit User Confirmation**: Actions whose **locally approved** risk is `HIGH` pause for human authorization. Planner `riskLevel` cannot downgrade a locally HIGH click.
8. **Verification is Empirical**: Success requires observed post-execution state deltas, not model assertions. TYPE_TOKEN is not success merely because events were dispatched.
9. **OCR text is untrusted page data**: Local OCR does not grant policy, token, or execution authority.
10. **Failure must not increase authority or egress**: Provider/OCR/runtime failures retry only the same protected class, or stop. They do not send screenshots, raw DOM, or reconstructed confirmation.

---

## 4. What N-Eye Is NOT (Anti-Drift Guardrails)

To prevent architecture drift, N-Eye explicitly rejects the following patterns:
- **NOT a generic DOM scraper**: Does not dump raw HTML or arbitrary text to remote servers.
- **NOT a remote screenshot agent**: Does not stream full-page desktop/browser screenshots to cloud VLMs.
- **NOT a chatbot with browser access**: Does not allow an LLM to hallucinate free-form JavaScript or bash commands.
- **NOT an API-key-bearing extension**: Extension client contains zero provider secrets; credentials stay server-side.
- **NOT a client-side database**: Does not persist passwords or private token mappings to disk or `chrome.storage`.
- **NOT a test-portal-only prototype**: Core logic operates across any real webpage via standard DOM and MV3 APIs.
- **NOT a tracker blocker**: Third-party network privacy (REC-016) is not the SIH core boundary.

---

## 5. Scope: SIH Prototype vs. Future Company Scale

| Capability | SIH Prototype Scope (Current Baseline) | Future Company Scale |
|---|---|---|
| **Browser Support** | Google Chrome (Manifest V3) | Cross-browser (Chromium, Firefox, Safari, Edge) |
| **Observation** | DOM semantics, ARIA, geometry, visibility, epoch, same-origin frame provenance, open Shadow DOM, nearest region heading (ranking only) | Multi-tab tracking, cross-origin iframe DOM, closed shadow access |
| **Perception** | Adaptive on-device OCR (Tesseract.js) when DOM/ARIA is insufficient | WebGPU-accelerated local VLM / visual grounding |
| **Privacy Engine** | Deterministic regex + heuristics + in-memory vault (DOM + OCR) | Local ML-based PII classifiers + hardware enclave vault |
| **Egress Guard** | Byte-level canary scan + 256KB size bounds | Cryptographic zero-knowledge egress proofs |
| **Planner Gateway** | Localhost FastAPI + Gemini / Mock adapters | Enterprise multi-tenant gateway with policy routing |
| **Persistence** | In-memory ephemeral (10-minute TTL) | Encrypted enterprise audit vault + compliance logging |
| **Evaluation** | Synthetic test portal (Scenarios 01–15) + `bench/visual` harness | Large-scale WebArena / VisualWebArena benchmark harness |

---

## 6. Current Implementation State

- **Protocol Layer (`packages/protocol`)**: Branded types, Unicode scalar sanitization, recovery taxonomy, `ExecutionEvidence`, perception fallbacks including `CANCELLED`, content-script handshake.
- **Chrome MV3 Shell (`apps/extension`)**: Content script remains a self-contained IIFE (top frame only). Observer walks same-origin `iframe.contentDocument`. Bounded planner retry/cancel. Hydrate cannot resurrect confirmation. Execute port preserves ASK_USER evidence.
- **Product UI**: Two surfaces (ADR-0010). Overlay + Side Panel architecture, logo files, tabs, and theme modes unchanged. Compact copy is human-first; technical terms stay on Evidence / View technical details / View Report technical section. ASK_USER is rewrite + Continue/Cancel (clarification). Confirmation remains Allow once / Don't allow (authorization). After a terminal task, **View Report** is available (ADR-0018): human ten-section summary plus expandable technical details, built only from the local evidence ledger. T030 claim statuses: PROVEN / OBSERVED / NOT_VERIFIED / NOT_APPLICABLE (UI still shows FACT / OBSERVED / UNVERIFIED / NOT APPLICABLE). Screenshot “not sent” is PROVEN only with ledger `REMOTE_INTELLIGENCE_USED` + `PROTECTED_CONTEXT_CREATED` + egress PASS + 0 screenshot bytes. TYPE is not an authorized-click fact. Green UI is not success.
- **Perception**: Adaptive OCR/ROI, task-conditioned skip when the interpreted goal uniquely grounds on DOM/ARIA. Capture/OCR failure never sends rasters. Engine failures (capture/load/timeout/low-confidence) stay `OCR_UNAVAILABLE` with distinct copy. OCR text that cannot uniquely bind is ASK_USER `VISUAL_UNBOUND`, not “Could not read visible text.” `OCR_USED` is recorded only when OCR produced blocks. OCR boxes bind to a unique live canvas/img via containment / ROI ownership / uniqueness margin (T029-R1). Fused labels on those nodes may become unique local CLICK targets. Unlabeled, ambiguous, occluded, or stale-epoch surfaces still ASK_USER. Visual hints never grant execution authority. Planner coordinates remain forbidden. Scenario 08 Chrome remains HUMAN REQUIRED.
- **Privacy Engine**: Detectors, token vault, SafeContext builder, Egress Guard. NEVER_SEND spans (API keys, JWTs) are stripped from `sanitizedGoal` and public labels, not only blocked at egress. Existing classes cover synthetic India identifiers (mobile, Aadhaar-like, PAN, GSTIN, IFSC, UPI VPA) as `PII_PHONE` / `PII_ACCOUNT_ID`. Free-text names/addresses are not claimed as detected.
- **Local Action Authority**: Confirmation capability (ADR-0011). After Allow once, live re-observation uniquely re-grounds the approved semantic identity (role/tag/inputType/normalized label); reminted opaque `eN` is not the granted target. Unique equivalent replacement may execute; meaning/action/risk/origin/frame change or ambiguous replacement fails closed. Native SELECT, bounded SCROLL, constrained PRESS_ENTER (HIGH, form `requestSubmit` or Enter-only), TYPE_TOKEN/TYPE_TEXT resulting-state verification. Local completion arbiter: planner COMPLETE ≠ task success. SEARCH / type-then-act requires typed query **and** a verified search outcome (URL/origin transition), not TYPE_TEXT MATCHED, click(), or Enter dispatch alone. TYPE then CLICK / SELECT then CONTINUE keep remaining subgoals (including RECOVERY `CONTINUE`); PRESS_ENTER + navigation is not click-goal success. ASK_USER Continue is a fresh trust loop, not Allow once; live MATCHED typing is adopted from a new observation so remaining submit is not forgotten. HIGH + unverified → no replay (ADR-0012). CLICK verification uses semantic identity, not reminted `eN`; autocomplete control-set churn is AMBIGUOUS, not success. Navigation evidence strips URL query/hash.
- **Planner gateway**: Unicode sanitize before provider encode; classified 429/404/503; Gemini key in `x-goog-api-key` header; prompt contract `n-eye-planner-policy/5` (region heading + exploration-is-not-completion). Provider JSON is coerced (thought-parts / fences / extra keys); authority-claim extras fail closed.
- **Goal intelligence**: N-Eye Intelligence / NI (ADR-0017; historical internal identifier NALIS) — deterministic interpreter + TaskGraph + semantic affordances + verification-gated session memory. Exclusive MOCK/REMOTE routing (ADR-0013). **T029/T030:** TaskGraph is implemented and unit-tested; the live trust loop does not call `createTaskGraph` (T029-F009). T030 reliability corpus N=8 showed **0** interpreter vs graph disagreements — no current first-incorrect-transition; wiring the graph is a T031/T032 decision. Click grounding is two-pass (own label, then unique region descendant); exact unique AccName may break a token-coverage tie. SEARCH_COMMIT may be a submit control **or** a unique labeled popup option/menuitem/treeitem with search/find semantics; two Search popups ASK_USER; ambiguous submits do not PRESS_ENTER. Bounded SCROLL exploration is not completion (ADR-0016). Composite search-then-open does not stuff the open clause into the query. Local language model REJECTED for the critical path (ADR-0015). Personalization cannot lower risk or skip confirmation. Webpage content must never teach privacy/risk/confirmation/authority policy. NI proposes; local N-Eye remains the authority. Persistent user memory is **not** T030 (REC-054).
- **Formal SIH measurement**: T019 corpus plus T027 PII/visual/performance packs, T029 Judge-Kill `t029-judge-kill/1`, and T030 accuracy/report-truth/reliability harnesses (`docs/evidence/T030-ACCURACY-CERTIFICATE.json`). Node/happy-dom and Tesseract fixtures are not Chrome E2E. No single published “accuracy %.” Frozen PII holdout `t030-pii-holdout/1` must not be used to retune detectors.
- **Chrome overlay + Side Panel E2E**: **UNVERIFIED** (manual load of `apps/extension/dist/`). See `docs/evidence/T030-REAL-CHROME-CHECKLIST.md`.
- **Local visual model / WebGPU / ONNX**: **NOT_IMPLEMENTED** by decision. MODEL_ADMISSION = REJECTED. See ADR-0008 (visual) and ADR-0015 (language).
- **Next Eligible Milestone**: Human T030 Chrome checklist (Scenario 05/08 included). T031 persistent local user trust/history/memory/device-security only after human review of T030. T032 is later independent red-team/freeze. T030 did **not** fabricate Chrome PASS and did **not** implement T031.

A UI control is one logical object with AccName, role, affordances, and privacy presence. DOM id, OCR words, and coordinates are evidence, not identity. Success is a verified postcondition on fresh page state. View Report facts require typed local evidence (`egressAudit`, ledger events), not formatted strings or planner prose.

