# Architecture Decision Record (ADR) 0006: Remote Planner Reasoning Boundary & Server Secret Isolation

## Status
**ACCEPTED**

## Context
In Gate 005/006, N-Eye introduces its first real remote reasoning boundary, allowing an AI model (Google Gemini, OpenAI-compatible, or mock) to reason over `SafeContext` and return structured `ActionProposal` envelopes without compromising browser security or leaking user private data.

We required:
1. Provider API keys and credentials must NEVER be bundled into the Chrome extension or exposed to browser scripts.
2. The network client must strictly enforce `SafeContext` egress guarding prior to serialization.
3. The remote model receives reasoning context only and possesses ZERO browser authority (no DOM references, no direct execution APIs, no vault access).
4. Planner responses must be structured data and remain untrusted advice subject to mandatory local validation.
5. Deterministic fallback must remain available for offline demos and provider outages.

## Decisions

1. **Planner Gateway Architecture (`apps/planner-api`)**:
   - Lightweight FastAPI backend service hosting vendor-specific provider adapters.
   - Provider credentials (`GEMINI_API_KEY`, etc.) remain strictly server-side in `.env`.
   - Server-side Pydantic models validate incoming `SafeContext` and outgoing `ActionProposal` with strict allowlists (`extra="forbid"`), rejecting any RawScene leakage.

2. **SafeContext-Only Network Transport**:
   - `RemotePlanner` client in the Chrome extension mandatorily runs `validateSafeContextEgress()` before every network dispatch.
   - Enforces explicit timeouts (default 15s), bounded transient retries (max 1 retry for 5xx; 0 for 4xx/validation), cancellation via `AbortController`, and stale response rejection by task ID.

3. **Structured ActionProposal & System Prompt Isolation**:
   - System prompts clearly delimit System Policy, User Task, Page Metadata, Available Tokens, and Visible Safe Elements, neutralizing adversarial prompt injections embedded in web page text.
   - Models return structured JSON conforming to `ActionProposal` schema.

4. **Zero-Authority Untrusted Model Contract**:
   - Model proposals are treated as untrusted suggestions.
   - Local N-Eye re-evaluates target existence, epoch freshness, and semantic token suitability, resolving private tokens locally from in-memory vault immediately before live node dispatch.

5. **Runtime Mode Management & Transparent Fallback**:
   - `PlannerManager` enables instant switching between `MOCK` (offline deterministic) and `REMOTE` (live AI gateway) modes.
   - The UI truthfully reports active provider metadata, payload size, canary scan results, and latency without ever fabricating state.

## Consequences
- **Positive**: First true remote AI trust loop; cryptographic & byte-level protection against secret egress; absolute immunity to model hallucination or rogue execution.
- **Negative**: Adds a backend FastAPI gateway dependency for remote AI mode; network latency (20–200ms depending on provider) added to planning step.
