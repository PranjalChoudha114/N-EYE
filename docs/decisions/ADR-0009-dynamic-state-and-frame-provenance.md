# Architecture Decision Record (ADR) 0009: Dynamic-state authority and frame provenance

## Status
**ACCEPTED**

## Context
T009/T010 left N-Eye able to observe and act on a live top document, but PageEpoch ignored `characterData` and `aria-label` / `role` changes, re-grounding required the original live node to remain connected, and content scripts ran only in the top frame with no frame provenance on targets. A planner `ElementId` could therefore become stale after an SPA rerender, or collide across documents if frame observation were added later.

This gate (T011/T012) must keep N-Eye safe when the page at execution time is not the page at planning time, and must reason about same-origin frames without expanding Chrome permissions or leaking iframe URLs.

## Decisions
1. **PageEpoch tracks semantically relevant mutations, not cosmetic noise.** Child-list changes that touch actionable controls, characterData inside interactive/label nodes, and interactability attributes (`hidden`, `disabled`, `aria-label`, `role`, hiding `style`/`class`) advance the epoch after the existing 60ms debounce. Hidden-subtree churn, non-interactive clocks, hover classes, and color-only style changes do not.
2. **The planner's target ID is not execution authority.** At execute time N-Eye re-grounds against live semantics and frame provenance. Outcomes stay in the existing vocabulary: `SAFE_REGROUND`, `REOBSERVE`, `REPLAN`, `ASK_USER`, `BLOCK`.
3. **Semantic identity outranks geometry.** Role, tag, input type, and normalized label are the security identity. Geometry and hashed neighborhood are supporting evidence. A unique equivalent replacement may re-ground; duplicate candidates abstain; Continue→Delete on the same node blocks.
4. **Final authority is checked immediately before native dispatch.** Validation can be stale after a HIGH-risk dialog. The executor re-grounds, then re-checks connected/visible/enabled/semantic/frame immediately before `click()` / typing. The DOM is not locked.
5. **Frame provenance is a local authority primitive.** Content scripts remain top-frame only (`all_frames` stays false; no new host permissions). Same-origin `iframe.contentDocument` is walked from the top document. Element IDs are namespaced (`e1` vs `f1e1`). SafeContext may include an opaque `frameId` (`f1`) and never a frame URL or query string. Cross-origin / sandboxed frames are recorded locally as inaccessible and never become clickable targets or coordinate-click shortcuts.
6. **Stale visual evidence is epoch- and frame-bound.** OCR/grounding results from epoch E / frame F must not authorize epoch E+N or frame F2.

## Consequences
- **Positive:** SPA replacement, semantic swap, duplicate targets, disabled/hidden controls, route change, and same-origin iframe targeting have an explicit fail-closed contract. Permissions were not widened.
- **Negative:** Hover-heavy sites no longer bump epoch on every class tweak (safer usability); security-relevant class tokens still bump. Cross-origin iframe content remains unobservable by Chrome's security model. Real Chrome Side Panel E2E for this gate is MANUAL.
- **Privacy:** `inaccessibleFrames` and raw iframe URLs stay local-only. Pydantic rejects URL-like `frameId` values.
