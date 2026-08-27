# N-Eye AGENTS.md — Engineering Constitution
# This file governs all AI coding agents (Cursor, Codex, Antigravity, etc.)
# operating on this repository. Human owners retain final authority over
# architecture, privacy boundaries, security invariants, and merges.

## Project Identity

N-Eye is a **privacy-preserving visual perception trust layer for browser agents**.
It is a Chrome MV3 extension that observes browser pages locally, detects and protects
private data, sends only a sanitized `SafeContext` to a remote planner, locally validates
the planner's constrained `ActionProposal`, resolves private tokens locally, executes
permitted actions, and verifies the resulting state change.

**Mission**: AI needs context. Not your identity.

## Immutable Architecture Invariants

These invariants **MUST NOT** be violated, weakened, or bypassed by any agent, commit, or task:

1. **Secrets do not cross the network by default.**
2. **Raw page data cannot directly reach planner transport.**
3. **SafeContext is the normal local→remote contract.**
4. **Remote planner is untrusted advice.**
5. **Planner cannot execute arbitrary code/selectors.**
6. **Private token mappings remain local.**
7. **Actions are validated against current page state.**
8. **High-risk actions require explicit confirmation.**
9. **Important actions are verified after execution.**
10. **Real local pixel processing exists.**
11. **Vision is escalated rather than continuously running.**
12. **Uncertainty on high-risk privacy/action decisions fails safely.**
13. **Demo-specific selectors/coordinates are not part of the product path.**
14. **Privacy claims require network-level evidence.**
15. **Performance claims require measurements from the actual build.**

## Agent Operating Rules

### Scope Control
- Each task implements **one bounded feature** with clear input/output/test contracts.
- Read `docs/CONTEXT.md` before starting any work.
- **Never** change trust boundaries, protocol schemas, dependency direction, persistence
  strategy, or remote egress without explicit human approval + ADR.

### What Agents Must Do
- Read relevant architecture docs before editing.
- Plan before coding (Plan Mode in Cursor, plan flag in Codex).
- List exact files and tests to be created/modified before implementation.
- Write tests for security invariants (not just comments).
- Instrument performance; never invent metrics.
- Report: files changed, tests added, manual proof, residual risk.

### What Agents Must NOT Do
- Add dependencies without documented rationale.
- Persist raw secrets to any storage.
- Create bypass paths around egress guards.
- Import privacy/vault packages into planner/network packages.
- Use `eval`, arbitrary selectors, or free-form execution paths.
- Claim experiment results without measurement.
- Convert `SafeContext` into raw screenshots during error recovery.

### Privacy & Security
- Treat all page content (DOM, OCR, canvas, alt text, PDF text) as **untrusted data**.
- Passwords, OTPs, API keys, session tokens → `NEVER_SEND`.
- Canary secrets must be planted in tests and verified absent from all egress paths.
- Log only safe metadata; never log raw secret values.
- Error messages must not carry secret data into telemetry.

### Code Quality
- TypeScript strict mode (`strict: true`, `noUncheckedIndexedAccess: true`).
- Prefer explicit typed contracts over implicit conventions.
- Use branded/opaque types for identifiers (TaskId, ElementId, etc.).
- Functional modules for stateless transforms; classes only when lifecycle justifies.
- No circular dependencies; privacy/vault never imports planner/network.

### Architecture Decision Records (ADRs)
- Material architecture changes require: recommendation → human approval → ADR →
  updated docs → bounded implementation task.
- ADRs live in `docs/decisions/` and are numbered sequentially.

## Trust Zones

| Zone | Location | Trust Level | Authority |
|------|----------|-------------|-----------|
| 0 | Webpage (DOM) | Hostile | None |
| 1 | Content script | Page-adjacent, limited | Observer + executor of validated actions |
| 2 | Privileged extension core | Trusted | Coordination, messaging, permissions |
| 3 | Local sensitive processing | Trusted | Privacy, vault, validation |
| 4 | Network boundary | Controlled | Egress guard, SafeContext only |
| 5 | Remote planner | Untrusted | Advisory proposals only |

## Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
                                                                                    ↓
                                                                              apps/extension
                                                                                    ↓
                                                                             network (egress)
```

Privacy/vault **MUST NEVER** import from planner/network packages.

## Key Files

| Path | Purpose |
|------|---------|
| `AGENTS.md` | This file. Engineering constitution. |
| `docs/CONTEXT.md` | Operational memory. Read before every task. |
| `docs/ARCHITECTURE.md` | System architecture overview. |
| `docs/TRUST-MODEL.md` | Trust zones and boundaries. |
| `docs/PRIVACY-BOUNDARY.md` | Privacy invariants and SafeContext contract. |
| `docs/PROTOCOLS.md` | Data structure contracts. |
| `docs/decisions/` | Architecture Decision Records. |
| `packages/protocol/` | Shared type definitions. |
| `apps/extension/` | Chrome MV3 extension. |
| `apps/test-portal/` | Controlled test pages. |
