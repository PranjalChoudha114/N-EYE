# N-Eye — Operational Context

> This file is the project's operational memory. Read it before starting any task.
> Update it after completing significant work.

## Current State

**Phase**: Genesis complete
**Last updated**: 2026-08-28
**Build status**: Repository bootstrapped, protocol types defined, MV3 shell created

## What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Repository foundation | ✅ Done | git, pnpm monorepo, TypeScript strict, ESLint, Vitest |
| Engineering constitution | ✅ Done | AGENTS.md, architecture docs, ADR-0001 |
| Protocol package | ✅ Done | Branded identifiers, RawScene, SafeContext, ActionProposal, Messages, Errors |
| Chrome MV3 shell | ✅ Done | Service worker, content script, side panel, typed messaging |
| Test portal | ✅ Done | Basic form with synthetic canary data |
| Observer | 🔲 Not started | Safe visible-element collector |
| Privacy engine | 🔲 Not started | Detection, classification, sanitization |
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

1. **Node 26** used (available on system, ahead of recommended Node 24 LTS)
2. **Transparent Chrome MV3** — no WXT framework
3. **Vite** for extension build
4. **React deferred** — side panel uses vanilla HTML/TS for Genesis
5. **pnpm monorepo** with workspace references

## Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
```

Privacy/vault MUST NEVER import from planner/network packages.

## Next Tasks (Day 02 per masterbook)

1. **Visible-element observer** — Collect visible/interactable controls with opaque IDs
2. **Page epoch** — Track meaningful page mutations
3. **MutationObserver** — Invalidate on significant DOM changes
4. Safe observation boundary tests

## Source Material

| Authority | File |
|-----------|------|
| Tier 0 (Primary) | N-EYE.pdf (95-page masterbook) |
| Tier 0 (Secondary) | N-Eye-SoftWareENG.pdf (HLD/LLD) |
| Tier 2 (Supporting) | N-Eye(AtoZ).pdf, N-Eye(Imp).pdf, N-EyeDeep.pdf, N-Eye_Prototype_Blueprint_FINAL.pdf |
