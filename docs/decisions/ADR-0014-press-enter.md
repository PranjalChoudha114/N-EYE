# Architecture Decision Record (ADR) 0014: Constrained PRESS_ENTER

## Status
**ACCEPTED**

## Context
Some search/forms submit on Enter in a field rather than a unique visible button (historical YouTube Continue / REC-032). Completing SEARCH after typing otherwise required a unique search/submit CLICK or ASK_USER. Unrestricted keyboard injection from planner text is forbidden.

## Decisions
1. **`PRESS_ENTER` is the only keyboard action in the vocabulary.** Schema rejects `textValue`, `tokenId`, `scrollDelta`, and extra keys (`hotkey`, `keyName`, `keys`, `keyboard`).
2. **Target must be a typeable field.** Password and file controls are forbidden. Local risk is always HIGH. Confirmation is required in the product loop.
3. **Execution prefers `HTMLFormElement.requestSubmit()`** when the field owns a form. Otherwise it dispatches Enter keydown/keypress/keyup only. No other keys. No `chrome.debugger`.
4. **Completion still requires a verified search/navigation outcome.** PRESS_ENTER is not product COMPLETE. Ambiguous duplicate submit controls still ASK_USER (no Enter-guess).
5. **Prompt contract `n-eye-planner-policy/4`** names PRESS_ENTER as defense-in-depth. Local schema remains the boundary.

## Consequences
- **Positive:** Generic implicit submit exists without site selectors.
- **Negative:** Synthetic KeyboardEvents are not `isTrusted`. Sites that ignore untrusted Enter will not submit; verification then ASK_USER. That is fail-closed, not a YouTube patch.
- **Residual:** Real-Chrome YouTube Enter remains HUMAN REQUIRED.
