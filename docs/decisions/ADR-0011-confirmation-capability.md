# Architecture Decision Record (ADR) 0011: Confirmation capability + untrusted-proposal shape gate

## Status
**ACCEPTED**

## Context
T015/T016 is the original security/authority campaign (T013/T014 was reassigned to product UI). Audit of HEAD `2d548b9` found:

1. HIGH-risk confirmation was a bare boolean (`confirm(approved)`), bound to neither task, origin, frame, action, target identity, risk, nor proposal. Approving Submit could in principle be confused with a later Delete if the same waiter was reused.
2. After the user clicked Confirm, the trust loop executed the **pre-approval** `ValidatedAction` without re-observing. A page mutation while the dialog was open was a TOCTOU window.
3. Extra JSON keys on `ActionProposal` (`confirmed`, `selector`, `policyOverride`, …) were ignored rather than rejected, so a hostile planner could smuggle authority claims that no local reader examined.
4. Local HIGH risk fired mainly on `CLICK` + `input type=submit` or a small label regex. Upload/file, send/publish, and form-associated submit buttons with a benign visible label could evade confirmation.
5. The planner prompt treated page text as untrusted but did not version the contract or name OCR/ARIA/document channels.

Prompt-injection keyword filters are not the security boundary. Page content is data. Local authority must remain decisive even when the planner follows the page.

## Decisions
1. **Confirmation is a capability.** `ConfirmationBroker` mints a single-use `ConfirmationRequest` bound to `{taskId, actionId, origin, routeKey, frameId, actionType, targetElementId, targetSemanticKey, riskLevel, tokenId}` with a TTL. The user answers that id. Consume is single-use. Replay across task/origin/frame/target/action is `CONFIRMATION_REPLAY` / `CONFIRMATION_STALE`.
2. **Post-approval revalidation.** After a grant is consumed, the loop re-observes, re-validates the **same proposal** against the fresh scene, re-derives the binding, and executes only if it still matches. Semantic swap → block. Failure does not retry with more context.
3. **Proposal shape gate.** `assertProposalShape` allowlists ActionProposal keys, rejects authority-claim fields as `UNTRUSTED_AUTHORITY_CLAIM`, and requires opaque `eN` / `fKeN` target ids and `tok_*` token ids. The gate runs at the network client and again in `validateActionProposal` so mock paths are covered.
4. **Local risk may only keep or escalate.** Classifier uses structure (`input type=submit|file`, `formSubmitting`) plus a broader consequential-label vocabulary. Planner `riskLevel` cannot downgrade.
5. **Prompt contract `n-eye-planner-policy/2`.** Defense-in-depth only. OCR/ARIA/document text, fake SYSTEM/DEVELOPER/user-confirmed strings, and “no extra fields” are named. Local authority remains the boundary.
6. **Message predicates.** Owner port must be an extension-served document. Injection is scoped to the sender’s tab / active bound tab. Tab-adjacent `confirm` without `confirmationId` is dropped.

## Consequences
- **Positive:** Hostile page text and a badly behaved planner cannot mint confirmation, tokens, selectors, or risk downgrades. Approval of one action does not authorize another.
- **Negative:** More clicks are confirmation-gated (any form-submit control). That is fail-safe.
- **Residual:** `confirmationId` is present in `ProductState` painted into the overlay (Zone 1). Page-world JS still cannot call `chrome.runtime.sendMessage`. A modified content script that already runs in isolated world could echo a stolen id; the grant still revalidates live semantics before execute. Not cryptographic.
- **Out of scope:** formal PII P/R/F1, performance benches, Gemini migration, SELECT/SCROLL, recovery campaign.
