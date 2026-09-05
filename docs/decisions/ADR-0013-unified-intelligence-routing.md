# Architecture Decision Record (ADR) 0013: Unified intelligence routing without extra authority

## Status
**ACCEPTED**

## Context
T025 needs natural-goal understanding and a single downstream authority path for deterministic Mock, optional future local models, and Remote. UI planner mode is MOCK | REMOTE (exclusive). ADR-0012 forbids presenting Mock output as Remote success. Capability-based routing (deterministic-first, then Remote) is useful but must not silently change a judge-visible Remote demo.

## Decisions
1. **Zone-3 interpreter is a deterministic semantic parser, not a local LLM.** `interpretGoal` emits intent family, entity, subgoals, and postcondition. Unknown goals abstain.
2. **All reasoning sources emit untrusted `ActionProposal` only.** Local validator, confirmation, re-grounding, executor, and verifier remain the authority path.
3. **Default UI routing stays exclusive.** MOCK → `DETERMINISTIC_LOCAL`. REMOTE → gateway only. Provenance is recorded as `reasoningProvenance`.
4. **Capability routing is opt-in** (`PlannerManager.setRoutingPolicy('capability')`). Ambiguous targets fail closed and do not escalate disclosure. Failure never widens SafeContext.
5. **LOCAL_MODEL provenance exists in the type union** so a later admitted engine can plug in. T025 does not load a neural model (see ADR-0015).

## Consequences
- **Positive:** GitHub-class paraphrases share one interpreter; Remote demos remain honest; the same validator consumes every source.
- **Negative:** Exclusive Remote still pays network cost when deterministic could have acted. Capability routing is not the Side Panel default.
- **Residual:** Interpreter coverage is a bounded grammar, not open-world NLU.
