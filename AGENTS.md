# N-Eye AGENTS.md — Engineering Constitution & Permanent Operating Rules
# This file governs all AI coding agents (Cursor, Codex, Antigravity, etc.)
# operating on this repository. Human owners retain final authority over
# architecture, privacy boundaries, security invariants, and merges.

## 1. Project Identity & Mission

N-Eye is an **on-device visual perception and action trust layer for browser agents**.
It is a Chrome MV3 extension that observes browser pages locally, detects and protects
private data, sends only a sanitized `SafeContext` to a remote planner, locally validates
the planner's constrained `ActionProposal`, resolves private tokens locally, executes
permitted actions, and verifies the resulting state change.

**Mission**: AI needs context. Not your identity.
**Problem Statement**: ISRO / Smart India Hackathon 2026 • PS 26171

---

## 2. Immutable Architecture Invariants

These invariants **MUST NOT** be violated, weakened, or bypassed by any agent, commit, or task:

1. **Secrets do not cross the network by default**: Passwords, OTPs, API keys, session tokens, and raw PII stay local.
2. **RawScene is Local-Only**: Raw DOM dumps, element handles, and full screenshots never reach planner transport.
3. **SafeContext is the Sole Egress Contract**: The network client exclusively sends allowlisted `SafeContext` payloads.
4. **Remote planner is untrusted advice**: Proposals are suggestions and possess ZERO direct browser execution authority.
5. **No arbitrary execution**: Planner cannot execute arbitrary JavaScript, XPath, CSS selectors, or free-form commands.
6. **Private token mappings remain local**: `[EMAIL_1]` is resolved to `user@example.com` in local memory immediately before execution.
7. **Actions are validated against current page state**: Proposals must match live DOM existence, epoch freshness, and target semantics.
8. **High-risk actions require explicit human confirmation**: Form submissions, account modifications, and payments require modal confirmation.
9. **Important actions are verified after execution**: Success is determined by empirical state-delta verification, not model claims.
10. **Real local pixel processing exists**: Visual perception (OCR, CV) runs locally on-device without cloud pixel streaming.
11. **Vision is escalated rather than continuously running**: Structure first; visual perception runs only when DOM structure is insufficient.
12. **Uncertainty on high-risk privacy/action decisions fails safely**: Fail closed on ambiguities or egress violations.
13. **Demo-specific selectors/coordinates are not part of the product path**: Logic must generalize across realistic web pages.
14. **Privacy claims require network-level evidence**: Claims must be proven via byte-level egress scans and canary tests.
15. **Performance claims require measurements from the actual build**: Instrument and report real numbers; never invent metrics.

---

## 3. Permanent Operating Rules for AI Agents

### Rule 1: Scope Control & No Premature Features
- Each task implements **one bounded feature / gate** with clear input/output/test contracts.
- Read `docs/CONTEXT.md` and `docs/UNDERSTANDING.md` before starting any work.
- **Never** silently add unrelated features, redesign architecture, change privacy policy, add storage persistence, or introduce network egress without explicit human approval + ADR.
- Use `docs/RECOMMENDATIONS.md` to record proposed improvements outside current scope.

### Rule 2: Memory Synchronization After Every Major Gate
At the conclusion of every major prompt or milestone, the agent MUST execute a memory synchronization phase:
1. Re-read `AGENTS.md`.
2. Inspect actual repository state and run tests.
3. Update `docs/CONTEXT.md` with what changed, what was verified, real measurements, known limitations, and next gate status.
4. Update `docs/UNDERSTANDING.md` if product understanding, capability, or user-visible behavior evolved.
5. Update relevant architecture docs (`docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`) if implementation changed them.
6. Update ADR / recommendation hygiene.
7. Commit only coherent, verified work.
8. **Never depend on chat history as project memory.**

### Rule 3: Anti-Hallucination & Reality Discipline
- **Inspect code before claiming a subsystem exists**: Do not trust documentation over code.
- **Run tests before claiming they pass**: Execute tests fresh; do not repeat old test outputs.
- **Verify real-browser behavior**: Do not claim real-browser verification without executing it.
- **Do not claim real-provider behavior from a mock**: Clearly report whether Mock or Real AI was executed.
- **No evidence = UNVERIFIED**: Never present targets or development measurements as final benchmarks.

### Rule 4: Privacy & Security Strictness
- Treat all page content (DOM, OCR, canvas, alt text, PDF text) as **untrusted data**.
- Passwords, OTPs, API keys, session tokens → `NEVER_SEND`.
- Canary secrets must be planted in tests and verified absent from all egress paths.
- Provider credentials (e.g. `GEMINI_API_KEY`) stay strictly server-side in `.env` (ignored by Git); never bundle into extension client.
- Log only safe metadata; never log raw secret values or prompt dumps.

### Rule 5: Code Explainability Standard
All created and modified code must follow N-Eye's explainability standard:
- Write clean, self-documenting code for WHAT the code does.
- Use concise (1–2 line) comments for **WHY**, **TRUST**, **PRIVACY**, **RISK**, and **SECURITY BOUNDARIES**.
- Important trust-boundary modules must state:
  - WHAT they own
  - WHY they exist
  - WHERE their security boundary lies
  - WHAT may cross and WHAT must never cross.

### Rule 6: Testing & Quality Gates
Every future gate must include:
- Targeted unit and contract tests
- Integration tests where applicable
- Privacy/canary egress tests where applicable
- Forensic self-audit and automated safe repair
- Full regression pass across all packages
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), ESLint with zero warnings, and clean build.

### Rule 7: Strict Accuracy in Reporting
All final reports must strictly distinguish between:
- `IMPLEMENTED` (code exists in repository)
- `TESTED` (automated unit/integration tests pass)
- `VERIFIED IN REAL RUNTIME` (executed in live browser or live gateway)
- `MEASURED` (empirical development measurement from actual execution)
- `TARGET` (future performance or benchmark goal)
- `UNVERIFIED` (conceptually planned but not empirically proven)
- `NOT IMPLEMENTED` (not yet built).

---

## 4. Trust Zones

| Zone | Location | Trust Level | Authority |
|------|----------|-------------|-----------|
| **0** | Webpage (DOM / Pixels) | Hostile | None (untrusted external data) |
| **1** | Content script | Page-adjacent, limited | Observer + executor of validated actions |
| **2** | Privileged extension core | Trusted Coordinator | Service worker, tab tracking, messaging |
| **3** | Local sensitive processing | Trusted Authority | Privacy detectors, token vault, action validator, verifier |
| **4** | Network boundary | Controlled Gateway | Egress guard, SafeContext only, timeout/cancellation |
| **5** | Remote planner | Untrusted Advisory | High-level reasoning over SafeContext only; zero execution authority |

---

## 5. Dependency Direction

```
protocol ← observer ← perception ← privacy ← vault ← policy ← execution ← verification
                                                                                    ↓
                                                                              apps/extension
                                                                                    ↓
                                                                         network (egress guard)
                                                                                    ↓
                                                                             apps/planner-api
```

Privacy and vault packages **MUST NEVER** import from planner or network transport packages.

---

## 6. Key Governance Documents

| Path | Purpose |
|------|---------|
| `AGENTS.md` | This file. Mandatory AI engineering constitution. |
| `docs/CONTEXT.md` | Canonical operational memory. Read before every task; update after every gate. |
| `docs/UNDERSTANDING.md` | Canonical product understanding, thesis, and trust boundary overview. |
| `docs/ARCHITECTURE.md` | System architecture overview. |
| `docs/TRUST-MODEL.md` | Trust zones and boundary definitions. |
| `docs/PRIVACY-BOUNDARY.md` | Privacy invariants and SafeContext allowlists. |
| `docs/PROTOCOLS.md` | Data structure contracts and branded identifiers. |
| `docs/TEST-STRATEGY.md` | Testing strategy and canary proof matrix. |
| `docs/RUNBOOK.md` | Developer setup and operational execution guide. |
| `docs/RECOMMENDATIONS.md` | Proposed improvements outside current task scope. |
| `docs/decisions/` | Architecture Decision Records (ADRs). |
| `packages/protocol/` | Shared protocol type definitions. |
| `apps/extension/` | Chrome MV3 extension. |
| `apps/planner-api/` | FastAPI Planner Gateway and provider adapters. |
| `apps/test-portal/` | Controlled synthetic test pages. |
