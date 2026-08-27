# N-Eye — Operational Context

> This file is the project's operational memory. Read it before starting any task.
> Update it after completing significant work.

## Current State

**Phase**: Task 003/004 Complete (Active-Web Hardening + Complete Local Privacy Boundary + SafeContext + Egress Guard + Deterministic Planning + Local Action Authority + Verified Execution + Product UI V2)
**Last updated**: 2026-08-28
**Build status**: Protocol package with complete Privacy taxonomy, SafeContext and Action contracts; MV3 extension with active tab self-healing injection, Deterministic Privacy Detectors, Policy Engine, In-Memory Token Vault, SafeContext Builder, Egress Guard, Deterministic Planner, Local Action Validator, Action Executor, State Verifier, and Product UI V2 with animated Trust Core and Transformation Visualizer. 43 Automated Tests passing.

## What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Repository foundation | ✅ Done | git, pnpm monorepo, TypeScript strict, ESLint, Vitest |
| Engineering constitution | ✅ Done | AGENTS.md, architecture docs, ADR-0001 |
| Protocol package | ✅ Done | Branded identifiers, RawScene, Privacy taxonomy, SafeContext, ActionProposal, ValidatedAction, VerificationResult, TargetFingerprint, Messages, Errors |
| Chrome MV3 runtime | ✅ Done | Service worker (active-tab tracking + programmatic injection fallback), Content Script (Observer + Registry + Epoch + Executor), Product Side Panel UI V2 |
| Page Observer | ✅ Done | Expanded selectors (textboxes, comboboxes, switches, contenteditable, shadow DOM), strict visibility check, label precedence & normalization, 0 generic value collection |
| Element Registry | ✅ Done | Opaque IDs (`e1`, `e2`), live node resolution, detached cleanup |
| PageEpoch Manager | ✅ Done | Debounced MutationObserver tracking meaningful interactive DOM mutations (ADR-0002) |
| Target Fingerprinting | ✅ Done | Role, tag, type, relative bbox, normalized label candidate, deterministic djb2 digest |
| Privacy Engine | ✅ Done | Deterministic detectors (passwords, OTPs, emails, phones, API keys, JWTs), goal sanitization, explicit policy decisions (ADR-0003) |
| Private Token Vault | ✅ Done | In-memory only, task & origin scoped, 10-minute TTL, target semantic enforcement (ADR-0003) |
| SafeContext Builder | ✅ Done | Field-by-field allowlist construction, goal sanitization, zero RawScene leakage (ADR-0004) |
| Egress Guard | ✅ Done | Byte-level canary credential scanner, 256KB size bound, fail-closed enforcement (ADR-0004) |
| Deterministic Planner | ✅ Done | Proposes structured ActionProposals (`TYPE_TOKEN`, `CLICK`, `WAIT`, `COMPLETE`) |
| Local Validator & Authority | ✅ Done | Validates proposals against live scene, target existence, and token scope; high-risk confirmation gate (ADR-0005) |
| Executor & Live Re-grounding | ✅ Done | Content script executes validated actions on live nodes with full event dispatching (ADR-0005) |
| Action Verifier | ✅ Done | Pre-state vs post-state delta analysis (`PageEpoch`, navigation, target consumption) (ADR-0005) |
| Product Side Panel V2 | ✅ Done | N-Eye Trust Core aperture animation, SafeContext visualizer, pipeline stage progress track, latency timeline, confirmation dialog, forensic drawer |
| Controlled Test Portal | ✅ Done | Scenarios 01 to 06 (Visibility, Dynamic DOM, Adversarial injections, Privacy taxonomy, Closed trust loop) |
| Real planner API | 🔲 Next Gate | FastAPI + remote LLM provider adapter |
| OCR worker | 🔲 Future Gate | Tesseract.js baseline |
| Visual grounding | 🔲 Future Gate | Visual perception trust layer |

## Key Decisions Made

1. **Active Tab Self-Healing Handshake**: Added `"scripting"` permission and removed unused `"storage"` permission. Content script is programmatically injected into pre-existing tabs on demand.
2. **Deterministic Privacy Detection**: Regex and semantic heuristics detect PII (`PII_EMAIL`, `PII_PHONE`), auth secrets (`SECRET_PASSWORD`, `SECRET_OTP`, `SECRET_API_KEY`, `SECRET_AUTH_TOKEN`), and goal secrets before any network transport.
3. **In-Memory Scoped Token Vault**: Replaces PII with scoped token symbols (`[EMAIL_1]`). Enforces origin, task, and semantic target constraints.
4. **SafeContext Allowlist & Byte-Level Egress Guard**: Payload is reconstructed field-by-field and scanned for canary strings; fails closed upon any violation.
5. **Local Action Authority & Risk Model**: Untrusted planner proposals are validated against the live DOM and require user confirmation for high-risk actions.
6. **State-Delta Verification**: Actions are only deemed successful if genuine state changes (DOM epoch progression, URL transition, or target consumption) are observed.

## Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
                                                                                ↓
                                                                          apps/extension
                                                                                ↓
                                                                         network (egress)
```

Privacy/vault MUST NEVER import from planner/network packages.
