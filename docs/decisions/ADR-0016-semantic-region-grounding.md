# Architecture Decision Record (ADR) 0016: Task-conditioned semantic region grounding and bounded exploration

## Status
**ACCEPTED**

## Context
T025/T026 real-Chrome use showed Wikipedia-class labeled search working, while goals such as “Click the Dynamic ID Button” failed after approval: the live control was a generic “Click me” child of a named region, and opaque IDs were unstable. Icon-only search submit was a separate failure class (accessible name / adjacent unlabeled control / form submit / constrained Enter). A full page knowledge graph and a local LLM were rejected as oversized (ADR-0015).

## Decisions
1. **Region heading is ranking/association evidence, not identity.** Observer attaches a bounded nearest visible heading/legend (`regionHeading`) on `RawElement` / sanitized `SafeElement`. `TargetFingerprint` still uses the control’s own label/role/type. Post-confirm remint remains semantic, not DOM id.
2. **Click grounding is two-pass and fail-closed.** Unique own-label match wins. Otherwise a unique region-heading match with a unique actionable descendant may win. Two descendants or two equally scoring regions → ASK_USER. Chrome nouns (`button`, `link`, …) and 1–2 letter fragments are not used as click hints when a stronger entity exists.
3. **SEARCH_SUBMIT is multi-signal.** Label/ARIA/SVG title, form association, and geometry adjacent to a unique search field. Unlabeled hamburger menus are not implicit search. Duplicate Search controls ASK_USER. Constrained `PRESS_ENTER` remains the fallback (ADR-0014). Untrusted KeyboardEvents may still fail on some sites.
4. **Bounded exploration.** When grounding returns none (not ambiguous), Mock may SCROLL a finite budget. Scrolling is not task completion. Repeated semantic signatures, page boundary, cancellation, or budget exhaustion → ASK_USER.
5. **Hit-testing.** Before CLICK, if `elementFromPoint` shows a persistent overlay that is not the target or its descendant, do not hammer-click; REOBSERVE / ASK_USER.
6. **Open shadow is supported; closed shadow is not claimed.** Observation already walks open `shadowRoot`. Region walk may cross open shadow hosts. Closed roots stay inaccessible. Cross-origin frames stay inaccessible.
7. **No site-specific production selectors.** Wikipedia / YouTube / GitHub / AssertQA are black-box acceptance environments only.
8. **Prompt contract `n-eye-planner-policy/5`** names region heading and exploration-as-not-completion as defense-in-depth. Local scoring remains the Mock authority path.

## Consequences
- **Positive:** “Click the Dynamic ID Button” can ground the unique “Click me” child without persisting a DOM id. Icon search can ground without YouTube CSS.
- **Negative:** Broad page headings shared by many controls fail closed (ASK_USER). Closed shadow and untrusted Enter remain honest limitations.
- **Residual:** Scenario 08 real-Chrome pixels → click remains HUMAN REQUIRED unless separately verified. Exploration does not invent virtualized nodes that were never in the DOM.
