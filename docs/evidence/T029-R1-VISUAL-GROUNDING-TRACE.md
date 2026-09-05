# T029-R1 — Visual grounding trace (Scenario 08 class)

Not a Scenario-08 hard-code. Fixture `apps/test-portal/scenario-08-visual-only.html` is evidence only.

## First incorrect transition (proven)

**Expected:** OCR text that is contained in one unique live canvas/img becomes that node’s fused label; unique labeled visual surface is click-capable; click dispatches on the live node; fixture mutates; verifier sees the change.

**Actual (pre-R1, real Chrome):** Privacy Receipt showed on-device OCR. Task ended ASK_USER “No unique supported control matched this request.”

**FIT module:** `apps/extension/src/perception/grounding.ts` `groundAndFuse`.

**Root cause:** Binding used IoU ≥ 0.12 **or** center distance ≤ 48. A small word box inside a large canvas has IoU often ~0.05 and a center far from the canvas center. Fusion failed. Canvas stayed unlabeled. `isClickCapable` requires a non-empty fused/DOM label on canvas/img. Planner correctly abstained (did not guess pixels).

Automated visual tests previously used large OCR boxes or offsets that still met IoU. That is why Node tests were green while Chrome failed.

## Pipeline (this tree)

| Stage | Behavior |
|---|---|
| Goal | Interpreted as CLICK with entity tokens from the painted-control phrasing. No fixture id. |
| Observation | `collectClickableVisualSurfaces` registers visible canvas/img (area ≥ 1600). Region associated by near-identical bbox **or** ≥80% region overlap. |
| Escalation | Unlabeled canvas → adaptive OCR. Task-conditioned skip does not apply (no unique DOM name). |
| Capture | Prefer `canvas.getImageData` / img drawImage (CSS→intrinsic via `mapCssBoxToElementBuffer`). Tab capture only if local crop fails. **file:// and localhost share this path.** file:// still needs Chrome “Allow access to file URLs”. |
| Coordinates | ROI specs are CSS viewport (`getBoundingClientRect`). Do not add `scrollX/Y`. Buffer pixels scaled to CSS via `transformRoiBoxToViewport(roi, local, bufferSize)`. |
| OCR | On-device Tesseract. Text remains untrusted page data. |
| Grounding | VisualBindingScore: ROI owner 0.5 + 0.4 containment + 0.2 IoU + proximity + 0.05 canvas/img. Require score ≥ 0.34 **and** uniqueness margin 0.12. Same-frame only. LOW OCR confidence does not become a live target. Far / degenerate box without ROI owner stays unbound. |
| Fusion | `applyFusionLabels` copies OCR label onto the unique live node. |
| Planner | Clicks labeled canvas/img. Unlabeled remains ASK_USER. Two identical labels ASK_USER. Does not click from `visualHints` alone. Does not SCROLL to recover pixel evidence. |
| Validator / re-ground / hit-test | Live node, epoch, occlusion (`elementsFromPoint`). |
| Execute | Native `click()` on the registered node. |
| Verify / Report | Fresh observation. ASK_USER + leftover WAIT `VERIFIED_SUCCESS` is not reported as task success. |

## file:// vs localhost

In-page canvas capture does not require `captureVisibleTab`. If OCR ran on file:// (human H09), capture worked. Failure was fusion, not file://-only OCR. Retest **both** `python3 -m http.server 5173 --directory apps/test-portal` and file:// (with file-URL access) on the matching dist identity.

Chrome Scenario 08 remains **UNVERIFIED IN REAL RUNTIME** until the human checklist row RC08 is filled.
