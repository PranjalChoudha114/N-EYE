# Architecture Decision Record (ADR) 0017: NALIS v1 — N-Eye Adaptive Local Intelligence System

## Status
**ACCEPTED** (architecture). Local neural language-model admission remains **REJECT** (ADR-0015 not reversed). Session-only generalized memory is **ACCEPTED**. Disk persistence of learned memory is **NOT** admitted.

## Context
T025/T026/R1 improved semantic-region grounding and bounded exploration, but real-browser work still exposed classes that literal phrase rules cannot finish: composite “search X and open Y” query stuffing, false completion after the first subgoal, icon/affordance meaning, below-fold exploration budgets, and the absence of verification-gated user-specific ranking. A giant local LLM/VLM would threaten the SIH resource/latency dimensions and would still be untrusted advice.

**Human/product name:** N-Eye Intelligence (NI). Historical internal identifier `NALIS` remains in module names this late in the project (no broad rename). NI proposes; local N-Eye authority decides. It does not replace SafeContext, EgressGuard, the vault, confirmation, re-grounding, or verification. Remote/protected centralized reasoning remains available (ADR-0013).

## Decision
1. **NALIS is layered, not an opaque AI.** Goal Intelligence → TaskGraph → (optional) session memory hints → Semantic UI / affordances → bounded exploration → cheapest sufficient reasoner → ActionProposal → local authority → execute → observe → verify → learning eligibility gate → forensic trace.
2. **Evolve existing types.** `InterpretedGoal` / `TaskGoalState` gain TaskGraph, success contracts, `tailEntity`, `forbidSubmit`, and possessive `preferenceHint`. Do not fork a second planner.
3. **Local neural LM stays REJECT until a new measured win.** The NALIS bench (dev vs frozen holdout) compares the deterministic path. No Transformers.js/ONNX/weights download in this gate. Browser built-in `LanguageModel` is feature-detected and treated as UNAVAILABLE/unadmitted. ADR-0015 stands.
4. **Routing cascade.** DETERMINISTIC_FAST → (admitted local model, none today) → local visual escalation → protected Remote if mode allows → ASK_USER. Ambiguous targets never escalate to a guessing model.
5. **Memory is verification-gated and SESSION/in-memory.** Episodes are generalized, sanitized with the existing privacy engine, origin-scoped, bounded (64). Webpage / OCR / Remote / local-model text cannot write trusted preference or safety memory. Personalization may rank resources (“my repo”); it must not skip confirmation, lower risk, or weaken NEVER_SEND. **Not** the PrivateTokenVault. **No** `chrome.storage` / IndexedDB for learning in v1 (trust-boundary: volatile only, same class as the vault’s non-persistence).
6. **Model output, if ever admitted, is schema-constrained advice.** No JS, CSS/XPath selectors, risk/confirmation/vault fields. Local `classifyLocalRisk` / validator remain authority.
7. **Forensic trace + health.** Append-only safe events and subsystem health (READY/DEGRADED/UNAVAILABLE). No hidden chain-of-thought. Evidence tab may show N-Eye Intelligence version, health, memory count, learning on/off (internal field names may still say nalis*).
8. **Rollback.** Disable learning (`LocalUserMemory.setEnabled(false)`); Mock/deterministic planner and ADR-0016 grounding remain. Remove NALIS modules without changing green-zone privacy/authority.

## Alternatives
- Bundle a sub-billion on-device instruct model now: rejected without Chrome resource/latency/privacy evidence.
- Persist long-term memory in `chrome.storage.local`: deferred; would need a follow-up ADR and sanitizer proof at rest.
- Fine-tune a personal adapter: future experiment only (not default).
- Send memory hints to Remote: rejected in v1 to avoid extra disclosure.

## Consequences
- **Positive:** Composite goals no longer collapse into one SEARCH query. False completion after search-only is blocked. Possessive ranking can improve after verified local outcomes. Forensic health is reportable. Offline Mock still works without model download.
- **Negative:** Indirect language beyond the parser still ASK_USER (or Remote if enabled). Memory is lost on extension reload. No icon-CV model (REC-037).
- **Privacy/security:** Learning cannot mutate authority. Canaries and poisoning tests are part of the gate.
- **Performance:** Deterministic parse remains sub-20ms warm in Node tests. No model cold-start on the critical path.
- **Persistence:** SESSION RAM only. Clear/reset implemented.
- **Human approval:** This ADR records the architecture. Disk persistence, admitting a neural model, or sending memory in SafeContext require a new ADR.

## Evidence
See `docs/CONTEXT.md` §73–§74 and `apps/extension/src/intelligence/`. Automated tests in `nalis-*.test.ts`. Human-facing UI uses “N-Eye Intelligence”. Real Chrome remains HUMAN REQUIRED.

## Supercedes
Nothing. Complements ADR-0013 (routing), ADR-0015 (LM reject), ADR-0016 (region/exploration).
