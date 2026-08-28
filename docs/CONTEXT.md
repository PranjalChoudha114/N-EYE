# N-Eye — Operational Context & Permanent Execution Memory

> **Operational Memory**: Read before every task; update after every completed gate.
> **Architecture Baseline**: v1.0 (Smart India Hackathon 2026 • Problem Statement 26171)
> **Last Updated**: 2026-08-28

---

## 1. System Identity & Overview

- **Project Name**: N-Eye
- **Tagline**: AI needs context. Not your identity.
- **Mission**: Privacy-preserving on-device visual perception and action trust layer for browser agents.
- **Form Factor**: Chrome MV3 Extension (`apps/extension`) + Local Planner Gateway (`apps/planner-api`) + Shared Protocol Package (`packages/protocol`) + Synthetic Test Portal (`apps/test-portal`).

---

## 2. Current Engineering State

| Attribute | Current Reality |
|---|---|
| **Architecture Version** | v1.0 Frozen Baseline |
| **Current Git Commit** | `9b6c65a` (Verified clean working tree) |
| **Monorepo Build** | Clean Vite build in 87ms (`apps/extension/dist`) |
| **Typecheck Status** | `tsc --noEmit` PASS (0 errors across all packages) |
| **Lint Status** | ESLint PASS (0 errors, 0 warnings across all packages) |
| **Automated Tests** | **75 / 75 PASS (100%)** |
| **Test Distribution** | `@n-eye/protocol`: 9 tests \| `@n-eye/extension`: 49 tests \| `apps/planner-api`: 17 tests |
| **Active AI Provider** | Google Gemini (`gemini-2.5-flash` via server-side REST API) |
| **Fallback AI Provider** | Deterministic Offline Mock (`mock-deterministic-v1`) |
| **Network Security** | `SafeContext`-only egress with byte-level canary scan & 256KB bound |
| **Credential Security** | Server-side `.env` ignored by Git; **zero API keys in extension client** |

---

## 3. Subsystem Implementation Map

| Subsystem | Location | Trust Zone | Status | Implemented Capabilities & Invariants |
|---|---|---|---|---|
| **Protocol** | `packages/protocol/` | Zone 2/3 | **COMPLETE** | Branded IDs (`TaskId`, `ElementId`, `TokenId`), `RawScene`, `SafeContext`, `ActionProposal`, `ValidatedAction`, `VerificationResult`, `TargetFingerprint`, typed errors. |
| **Content Observer** | `apps/extension/src/content/` | Zone 1 | **COMPLETE** | Live DOM traversal, interactable candidates, visibility check, label precedence, `TargetFingerprint` computation, `_isLocalOnly: true` enforcement. |
| **Element Registry** | `apps/extension/src/content/` | Zone 1 | **COMPLETE** | Opaque IDs (`e1`, `e2`), live DOM node resolution, detached element cleanup. |
| **PageEpoch Manager** | `apps/extension/src/content/` | Zone 1 | **COMPLETE** | Debounced `MutationObserver` tracking interactive DOM mutations, incrementing `PageEpoch`. |
| **Privacy Detectors** | `apps/extension/src/privacy/` | Zone 3 | **COMPLETE** | Deterministic regex and heuristics detecting emails, phones, API keys, passwords, OTPs, JWTs, and goal secrets. |
| **Private Token Vault** | `apps/extension/src/privacy/` | Zone 3 | **COMPLETE** | Ephemeral in-memory vault, task/origin scoping, 10-minute TTL, target semantic enforcement (`['email', 'text']`). |
| **SafeContext Builder** | `apps/extension/src/privacy/` | Zone 3 | **COMPLETE** | Field-by-field allowlist construction, token capability mapping, zero `RawScene` leaks. |
| **Egress Guard** | `apps/extension/src/privacy/` | Zone 4 | **COMPLETE** | Byte-level canary regex scanning, 256KB payload limit, fail-closed enforcement before `fetch()`. |
| **Planner Gateway** | `apps/planner-api/` | Zone 5 | **COMPLETE** | FastAPI service, server-side credential isolation, Pydantic schema validation (`extra="forbid"`), safe telemetry logging. |
| **Provider Adapters** | `apps/planner-api/src/adapters/` | Zone 5 | **COMPLETE** | Google Gemini adapter with structured JSON schema (`responseSchema`), Mock adapter, OpenAI-compatible adapter. |
| **Remote Planner Client** | `apps/extension/src/planner/` | Zone 4 | **COMPLETE** | Egress guard checkpoint, 15s timeout, caller cancellation (`AbortSignal`), bounded retry (1x on 5xx; 0x on 4xx), task ID binding. |
| **Planner Manager** | `apps/extension/src/planner/` | Zone 2 | **COMPLETE** | Runtime switching between `MOCK` and `REMOTE` modes, health probe (`/v1/health`), transparent fallback. |
| **Local Action Validator** | `apps/extension/src/authority/` | Zone 3 | **COMPLETE** | Target existence, epoch freshness, interactive status, token capability scope, risk classification (`LOW`, `MEDIUM`, `HIGH`, `BLOCKED`). |
| **Live Re-grounding** | `apps/extension/src/content/` | Zone 3 | **COMPLETE** | Target fingerprint matching across epoch changes before action execution. |
| **Token Resolution** | `apps/extension/src/privacy/` | Zone 3 | **COMPLETE** | In-memory token dereferencing immediately prior to native event dispatch. |
| **Action Executor** | `apps/extension/src/execution/` | Zone 1 | **COMPLETE** | Native DOM event dispatching (`focus`, `input`, `change`, `click`, `scroll`) on live element nodes. |
| **Action Verifier** | `apps/extension/src/verification/` | Zone 3 | **COMPLETE** | Empirical state-delta verification comparing pre-scene vs post-scene (`PageEpoch` progression, URL change, target consumption). |
| **Side Panel UI** | `apps/extension/src/sidepanel/` | Zone 2 | **COMPLETE** | Aperture animation, Mode toggle, Gateway status pill, multi-step progress (up to 8 steps), in-flight Cancel button, Network Proof drawer, stage latency timeline. |
| **Controlled Test Portal** | `apps/test-portal/` | Zone 0 | **COMPLETE** | Scenarios 01–06 covering visibility, dynamic DOM, adversarial prompt injection, privacy taxonomy, and closed trust loop. |
| **On-Device OCR** | Future Subsystem | Zone 3 | **NOT STARTED** | Tesseract.js / WebAssembly baseline for visual text extraction (Scheduled for Gate 007/008). |
| **Visual Grounding** | Future Subsystem | Zone 3 | **NOT STARTED** | Visual perception trust layer for canvas/image UI elements (Scheduled for Gate 007/008). |
| **Adaptive Perception** | Future Subsystem | Zone 3 | **NOT STARTED** | Controller escalating from DOM structure to OCR/ROI only when needed (Scheduled for Gate 007/008). |

---

## 4. Empirical Development Measurements

*(Recorded from actual test and runtime execution on Apple M5 / Chrome MV3 baseline)*

| Pipeline Stage | Measurement | Context / Conditions |
|---|---|---|
| **SEE (Local Observer)** | Median: `0.86 ms` \| P95: `5.04 ms` | 100 iterations on 100-element synthetic DOM fixture |
| **PROTECT (Privacy Engine)** | `~0.5 ms` | Regex scanning, policy evaluation, and vault tokenization |
| **PLAN (Deterministic Mock)** | `0.02 ms` | In-memory rule-based proposal generation |
| **PLAN (Real Google Gemini)** | `~2,400 – 3,200 ms` | Network roundtrip to Gemini 2.5 Flash with structured JSON schema |
| **VALIDATE (Local Authority)** | `~0.2 ms` | Scene existence check, epoch validation, and token capability matching |
| **ACT (Content Executor)** | `~1.0 ms` | Native DOM event dispatching and value assignment |
| **VERIFY (State-Delta Verifier)** | `~0.5 ms` | Pre/post scene delta comparison and epoch progression |
| **Total SafeContext Size** | `~1,048 bytes` | Well within the 262,144 byte (256 KB) safety bound |
| **Canary Egress Scan** | `0 leaks detected` | 100% of synthetic passwords, OTPs, API keys, and emails blocked |

---

## 5. Accepted Architecture Decision Records (ADRs)

- **ADR-0001**: Genesis Foundation & Engineering Constitution (`AGENTS.md`, pnpm monorepo, strict TypeScript).
- **ADR-0002**: Active Web Observation, Element Registry & Epoch Management (Opaque IDs, `TargetFingerprint`, `PageEpoch`).
- **ADR-0003**: Local Privacy Boundary, Policy Decisions & Private Token Vault (Deterministic detectors, in-memory vault, `[EMAIL_1]` tokens).
- **ADR-0004**: SafeContext Egress Guard & Byte-Level Canary Scan (Strict allowlist schema, 256KB size bounds, fail-closed enforcement).
- **ADR-0005**: Local Action Authority, Risk Policy, Live Re-Grounding & Delta Verification (Untrusted proposals, user confirmation modal, state verification).
- **ADR-0006**: Remote Planner Reasoning Boundary & Server Secret Isolation (FastAPI gateway, provider adapters, Gemini structured outputs).

---

## 6. Known Limitations & Scope Boundaries

1. **OCR / Canvas Support Not Yet Implemented**:
   - Currently, N-Eye observes standard DOM and ARIA elements. Text embedded inside `<canvas>`, images, or custom SVG widgets is not yet parsed (Scheduled for Gate 007/008).
2. **Single-Tab Scope in SIH Prototype**:
   - N-Eye currently observes and acts on the single active browser tab. Multi-tab orchestration is reserved for future company scale.
3. **In-Memory Vault Lifetime**:
   - Vault tokens expire after 10 minutes or upon tab navigation. There is deliberately zero disk persistence (`chrome.storage` is not used).

---

## 7. Roadmap & Next Eligible Gate

- **Completed**:
  - Gate 001/002: Repository Genesis & Active Web Observation
  - Gate 003/004: Privacy Boundary, Scoped Token Vault & Egress Guard
  - Gate 005/006: Remote Planner Gateway, Provider Adapters & Real Gemini Activation
- **Next Eligible Major Milestone**:
  - **Gate 007/008**: **Local Visual Perception, On-Device OCR & Adaptive Perception Controller** (Tesseract.js WASM baseline, ROI screenshot manager, visual target grounding, and adaptive escalation controller).
