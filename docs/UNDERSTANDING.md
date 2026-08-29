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
- The local browser validates the proposal against current DOM state, resolves private tokens in local memory, prompts for human confirmation on high-risk actions, executes native events on live nodes, and verifies the resulting state-change delta.
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
8. **Verification is Empirical**: Success requires observed post-execution state deltas, not model assertions.
9. **OCR text is untrusted page data**: Local OCR does not grant policy, token, or execution authority.

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
| **Observation** | DOM semantics, ARIA, geometry, visibility, epoch, same-origin frame provenance | Multi-tab tracking, cross-origin iframe DOM, deep shadow DOM |
| **Perception** | Adaptive on-device OCR (Tesseract.js) when DOM/ARIA is insufficient | WebGPU-accelerated local VLM / visual grounding |
| **Privacy Engine** | Deterministic regex + heuristics + in-memory vault (DOM + OCR) | Local ML-based PII classifiers + hardware enclave vault |
| **Egress Guard** | Byte-level canary scan + 256KB size bounds | Cryptographic zero-knowledge egress proofs |
| **Planner Gateway** | Localhost FastAPI + Gemini / Mock adapters | Enterprise multi-tenant gateway with policy routing |
| **Persistence** | In-memory ephemeral (10-minute TTL) | Encrypted enterprise audit vault + compliance logging |
| **Evaluation** | Synthetic test portal (Scenarios 01–09) + `bench/visual` harness | Large-scale WebArena / VisualWebArena benchmark harness |

---

## 6. Current Implementation State (Gate T013/T014)

- **Protocol Layer (`packages/protocol`)**: Branded types plus `FrameId`, `FrameProvenance`, semantic fingerprint helpers, optional SafeElement `frameId`, perception/assurance contracts, and content-script handshake (`CONTENT_SCRIPT_PROTOCOL`).
- **Chrome MV3 Shell (`apps/extension`)**: Content script remains a self-contained IIFE (top frame only). Observer walks same-origin `iframe.contentDocument`. PageEpoch uses classified mutations (ADR-0009). Bounded PING → inject-once → handshake recovery.
- **Product UI**: Two surfaces (ADR-0010). Toolbar click toggles a closed Shadow DOM glass card over the current webpage. More / Details opens the Chrome Side Panel Trust Center (Activity / Privacy / Action / Evidence). Canonical eye+N mark. Dark / light / system theme via Side Panel `localStorage` only. Overlay never writes page `localStorage`. Overlay is view/control; Side Panel owns vault/OCR/loop.
- **Perception (`apps/extension/src/perception`)**: Adaptive controller, CSS↔bitmap coordinate maps, ROI bounds, PixelBuffer lifecycle, Tesseract.js, grounding/fusion with epoch+frame staleness. OCR runs in the owner product document.
- **Privacy Engine (`apps/extension/src/privacy`)**: Detectors, token vault, SafeContext builder (opaque `frameId` only), Egress Guard.
- **Local Action Authority**: Stale-action contract, unique-candidate re-grounding, TOCTOU check immediately before native dispatch, empirical verifier (`AMBIGUOUS` for epoch-only click deltas).
- **Chrome overlay + Side Panel E2E**: **UNVERIFIED** (manual load of `apps/extension/dist/`). See `docs/evidence/T013-T014-MANUAL-CHECKLIST.md`.
- **Local visual model / WebGPU / ONNX**: **NOT_IMPLEMENTED** by decision. MODEL_ADMISSION = REJECTED. See ADR-0008.
- **Next Eligible Milestone**: Gate 015/016 — previously planned T013/T014 security campaign (prompt-injection hardening, formal privacy P/R/F1, formal performance). Do not start until explicitly approved.
