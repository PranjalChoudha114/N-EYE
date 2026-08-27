# N-Eye — Operational Context

> This file is the project's operational memory. Read it before starting any task.
> Update it after completing significant work.

## Current State

**Phase**: Task 002 Complete (Active-Web Foundation + Observation Hardening + Target Identity + Product Side Panel)
**Last updated**: 2026-08-28
**Build status**: Repository bootstrapped, Protocol package with TargetFingerprint, MV3 runtime connected to active tabs, Element Registry, Debounced PageEpoch, Value Exclusion, Product Side Panel, 4 Controlled Scenarios, 29 Automated Tests passing.

## What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Repository foundation | ✅ Done | git, pnpm monorepo, TypeScript strict, ESLint, Vitest |
| Engineering constitution | ✅ Done | AGENTS.md, architecture docs, ADR-0001 |
| Protocol package | ✅ Done | Branded identifiers, RawScene, SafeContext, ActionProposal, TargetFingerprint, Messages, Errors |
| Chrome MV3 runtime | ✅ Done | Service worker (active-tab tracking), Content Script (Observer + Registry + Epoch), Product Side Panel UI |
| Page Observer | ✅ Done | Strict visibility check, label precedence & sanitization, 0 generic value collection |
| Element Registry | ✅ Done | Opaque IDs (`e1`, `e2`), live node resolution, detached cleanup |
| PageEpoch Manager | ✅ Done | Debounced MutationObserver tracking meaningful interactive DOM mutations |
| Target Fingerprinting | ✅ Done | Role, tag, type, relative bbox, sanitized label, deterministic djb2 digest |
| Product Side Panel | ✅ Done | Dark theme, active-tab auto connect, trust loop status, forensic evidence drawer |
| Controlled Test Portal | ✅ Done | Scenarios 01 (Form Canaries), 02 (Visibility), 03 (Dynamic Rerender), 04 (Adversarial) |
| Privacy engine | 🔲 Next Gate | Detection taxonomy, classification rules, tokenization |
| Token vault | 🔲 Not started | Memory-local private token capability |
| SafeContext builder | 🔲 Not started | RawScene → SafeContext transformation |
| Egress guard | 🔲 Not started | Network boundary enforcement |
| Mock planner | 🔲 Not started | Deterministic ActionProposal responses |
| Real planner API | 🔲 Not started | FastAPI + provider adapter |
| Local validator | 🔲 Not started | Proposal validation pipeline |
| Executor | 🔲 Not started | ValidatedAction → DOM action |
| Verifier | 🔲 Not started | Post-action state verification |
| OCR worker | 🔲 Not started | Tesseract.js baseline |
| Visual grounding | 🔲 Not started | EXPERIMENT REQUIRED |

## Key Decisions Made

1. **Active Tab Discovery via Service Worker**: `tabs.onActivated` and `tabs.onUpdated` automatically broadcast `TAB_CHANGED` to side panel.
2. **Strict Value Exclusion**: Form input `.value`, `textarea.value`, and hidden inputs are strictly excluded from `RawElement`.
3. **Deterministic Label Precedence**: Associated label > aria-label > aria-labelledby > innerText > placeholder > title, bounded to max 120 chars.
4. **TargetFingerprint**: Structural signature based on role, tag, inputType, sanitizedLabel, relative geometry, and djb2 digest.
5. **Debounced PageEpoch**: MutationObserver uses 60ms debounce and filters for meaningful interactive mutations (`hidden`, `disabled`, `childList`, `class`, `style`).

## Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
```

Privacy/vault MUST NEVER import from planner/network packages.

## Source Material

| Authority | File |
|-----------|------|
| Tier 0 (Primary) | N-EYE.pdf (95-page masterbook) |
| Tier 0 (Secondary) | N-Eye-SoftWareENG.pdf (HLD/LLD) |
| Tier 2 (Supporting) | N-Eye(AtoZ).pdf, N-Eye(Imp).pdf, N-EyeDeep.pdf, N-Eye_Prototype_Blueprint_FINAL.pdf |
