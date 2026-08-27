# Architecture Decision Record (ADR) 0005: Local Action Authority & Verification

## Status
**ACCEPTED**

## Context
Remote planner responses (`ActionProposal`) are untrusted advice. Browser agents must never execute arbitrary script strings, remote XPath selectors, or uncontrolled DOM clicks.

## Decisions
1. **Local Action Validator**:
   - Re-evaluates proposals against the live `RawScene`, verifying element existence, enabled state, and semantic appropriateness.
   - For `TYPE_TOKEN`, securely resolves token values inside local memory immediately before execution.
2. **Action Risk & Human Confirmation**:
   - Categorizes risk (`LOW`, `MEDIUM`, `HIGH`, `BLOCKED`).
   - High-risk actions (e.g. form submission, account deletion) require explicit user authorization via an accessible modal dialog.
3. **Execution & State-Change Verification**:
   - `executeValidatedAction()` triggers native DOM events on live nodes.
   - `verifyActionExecution()` compares pre-state vs post-state deltas (`PageEpoch` progression, URL transitions, target consumption) to produce a truthful `VerificationResult` (`VERIFIED_SUCCESS` / `VERIFIED_FAILURE`).

## Consequences
- **Positive**: Complete defense against rogue planner instructions, prompt injections, and stale actions.
- **Negative**: High-risk actions pause execution until user confirmation is granted.
