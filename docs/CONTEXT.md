# N-Eye — Operational Context

> This file is the project's operational memory. Read it before starting any task.
> Update it after completing significant work.

## Current State

**Phase**: Gate 005/006 Real Remote AI Planner Integration Complete (SafeContext-Only Boundary + FastAPI Gateway + Gemini/Mock Adapters + Local Authority Preservation + Network Proof UI)
**Last updated**: 2026-08-28
**Build status**: Clean build across monorepo. 73 Automated Tests passing (9 in `@n-eye/protocol`, 48 in `@n-eye/extension`, 16 in `apps/planner-api`). Zero lint warnings, zero type errors. Clean Git working tree.

## What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Repository foundation | ✅ Done | git, pnpm monorepo, TypeScript strict, ESLint, Vitest, Python venv, pytest |
| Engineering constitution | ✅ Done | AGENTS.md, architecture docs, ADR-0001 through ADR-0006 |
| Protocol package | ✅ Done | Branded identifiers, RawScene, Privacy taxonomy, SafeContext, ActionProposal, ValidatedAction, VerificationResult, TargetFingerprint, Messages, Errors |
| Chrome MV3 runtime | ✅ Done | Service worker (active-tab tracking + programmatic injection fallback), Content Script (Observer + Registry + Epoch + Executor), Product Side Panel UI V2.5 |
| Page Observer | ✅ Done | Expanded selectors (textboxes, comboboxes, switches, contenteditable, shadow DOM), strict visibility check, label precedence & normalization, 0 generic value collection |
| Element Registry | ✅ Done | Opaque IDs (`e1`, `e2`), live node resolution, detached cleanup |
| PageEpoch Manager | ✅ Done | Debounced MutationObserver tracking meaningful interactive DOM mutations (ADR-0002) |
| Target Fingerprinting | ✅ Done | Role, tag, type, relative bbox, normalized label candidate, deterministic djb2 digest |
| Privacy Engine | ✅ Done | Deterministic detectors (passwords, OTPs, emails, phones, API keys, JWTs), goal sanitization, explicit policy decisions (ADR-0003) |
| Private Token Vault | ✅ Done | In-memory only, task & origin scoped, 10-minute TTL, target semantic enforcement (ADR-0003) |
| SafeContext Builder | ✅ Done | Field-by-field allowlist construction, goal sanitization, zero RawScene leakage (ADR-0004) |
| Egress Guard | ✅ Done | Byte-level canary credential scanner, 256KB size bound, fail-closed enforcement (ADR-0004) |
| Real Planner Gateway | ✅ Done | FastAPI service (`apps/planner-api`), server-side secret isolation, schema validation, safe operational logging (ADR-0006) |
| Provider Adapters | ✅ Done | Google Gemini (`GeminiProviderAdapter` with structured `responseSchema`), OpenAI-compatible, and deterministic `MockProviderAdapter` (ADR-0006) |
| Remote Planner Client | ✅ Done | `RemotePlanner` with mandatory egress guard call, timeout, cancellation, bounded retry, and stale response rejection (ADR-0006) |
| Planner Manager | ✅ Done | Runtime switching between `MOCK` (offline) and `REMOTE` (real AI), gateway health checking, transparent fallback |
| Multi-Step Closed Loop | ✅ Done | Up to 8 steps, cycle detection loop safety, priorOutcome feedback, re-grounding, local token resolution |
| Local Validator & Authority | ✅ Done | Validates proposals against live scene, target existence, and token scope; high-risk confirmation gate (ADR-0005) |
| Executor & Live Re-grounding | ✅ Done | Content script executes validated actions on live nodes with full event dispatching (ADR-0005) |
| Action Verifier | ✅ Done | Pre-state vs post-state delta analysis (`PageEpoch`, navigation, target consumption) (ADR-0005) |
| Product Side Panel V2.5 | ✅ Done | Aperture animation, Planner Mode switcher, Network Proof Drawer, truthful latency breakdown, cancellation button |
| Controlled Test Portal | ✅ Done | Scenarios 01 to 06 (Visibility, Dynamic DOM, Adversarial injections, Privacy taxonomy, Closed trust loop) |
| OCR worker | 🔲 Future Gate | Tesseract.js baseline for visual text extraction |
| Visual grounding | 🔲 Future Gate | Visual perception trust layer |

## Key Decisions Made

1. **Active Tab Self-Healing Handshake**: Added `"scripting"` permission and removed unused `"storage"` permission. Content script is programmatically injected into pre-existing tabs on demand.
2. **Deterministic Privacy Detection**: Regex and semantic heuristics detect PII (`PII_EMAIL`, `PII_PHONE`), auth secrets (`SECRET_PASSWORD`, `SECRET_OTP`, `SECRET_API_KEY`, `SECRET_AUTH_TOKEN`), and goal secrets before any network transport.
3. **In-Memory Scoped Token Vault**: Replaces PII with scoped token symbols (`[EMAIL_1]`). Enforces origin, task, and semantic target constraints.
4. **SafeContext Allowlist & Byte-Level Egress Guard**: Payload is reconstructed field-by-field and scanned for canary strings; fails closed upon any violation.
5. **Local Action Authority & Risk Model**: Untrusted planner proposals are validated against the live DOM and require user confirmation for high-risk actions.
6. **State-Delta Verification**: Actions are only deemed successful if genuine state changes (DOM epoch progression, URL transition, or target consumption) are observed.
7. **Server-Side Secret Isolation & SafeContext-Only Transport**: Remote LLM credentials stay in `apps/planner-api/.env`; extension contains zero API keys; model receives reasoning context only with zero execution authority.

## Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
                                                                                ↓
                                                                          apps/extension
                                                                                ↓
                                                                         network (egress)
                                                                                ↓
                                                                         apps/planner-api
```

Privacy/vault MUST NEVER import from planner/network packages.
