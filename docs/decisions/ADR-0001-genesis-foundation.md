# Architecture Decision Record (ADR) 0001: Genesis Foundation

## Status
**ACCEPTED**

## Context
N-Eye is a privacy-preserving visual perception trust layer for browser agents developed for ISRO SIH 2026 (Problem Statement 26171). We need a deterministic, reproducible repository foundation, transparent Chrome MV3 runtime, explicit protocol typing, and an immutable engineering constitution.

## Decisions

1. **Repository Layout**:
   - Monorepo using `pnpm` workspace.
   - Core contracts isolated in `packages/protocol`.
   - Browser client in `apps/extension`.
   - Controlled evaluation in `apps/test-portal`.

2. **Toolchain & Runtime**:
   - TypeScript 5.8+ in strict mode with branded identifier types.
   - Transparent Chrome Manifest V3 extension structure bundled via Vite.
   - Vitest for unit/contract tests.
   - Vanilla HTML/TS for initial side-panel shell to keep Genesis minimal; React deferred to subsequent UI iteration.

3. **Trust & Data Boundaries**:
   - Raw DOM and secrets restricted to local zones.
   - `SafeContext` is the only normal outbound contract.
   - `ActionProposal` is untrusted advice.
   - In-memory ephemeral Token Vault for private data.

## Consequences
- **Positive**: Clean separation of concerns, compile-time and runtime validation of network boundaries, rapid iteration without heavy external framework bloat.
- **Negative**: Requires rigorous message typing between content script, service worker, and side panel.
