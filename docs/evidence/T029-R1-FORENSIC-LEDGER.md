# T029-R1 — Forensic defect ledger

Human real-Chrome observations H01–H09 ingested 2026-09-05. Source/runtime wins over prior T029 reports.

IDs in this file are **T029-R1-F\***. Original T029-F001…F012 remain in `T029-FORENSIC-DEFECT-LEDGER.md` and are not renumbered.

## Human findings

| ID | Result | Classification after forensic review |
|---|---|---|
| H01 Selenium TYPE | PASS | Preserve |
| H02 TYPE→SUBMIT | PASS | Preserve |
| H03 TYPE→CLICK | PASS | Preserve (T029 F001/F002 on this path) |
| H04 SELECT→CONTINUE | PASS | Preserve |
| H05 Wikipedia composite search+open | SAFE ABSTENTION + ranking candidate | Exact-name uniqueness added. Ambiguous derivative names must still ASK_USER. No Wikipedia logic. |
| H06 Wikipedia exposed search | PASS | Preserve |
| H07 GitHub dynamic search | SAFE ABSTENTION / SEARCH_COMMIT gap | Popup `option`/`treeitem`/`menuitem` with Search is now a generic SEARCH_COMMIT. No github.com logic. Untrusted Enter still not used to break ambiguity. |
| H08 Privacy email tokenize | PASS (Mock only) | Empty password already `valuePresent=false`. Report wording distinguished control vs value. Live Remote **UNVERIFIED**. |
| H09 Scenario 08 visual-only | CONFIRMED P1 | See F001. file:// vs localhost: same in-page `getImageData` path; file:// still needs Chrome “Allow access to file URLs”. |

## Ledger

| ID | Sev | Class | First incorrect transition | Disposition |
|---|---|---|---|---|
| T029-R1-F001 | P1 | CONFIRMED DEFECT | `groundAndFuse` required IoU≥0.12 or center≤48. Painted word box inside a large canvas has low IoU and a far center → unlabeled canvas → `isClickCapable` false → ASK_USER despite OCR text. | **Repaired.** VisualBindingScore: ROI owner + containment + IoU + proximity + uniqueness margin. |
| T029-R1-F002 | P2 | CONFIRMED DEFECT | Token-coverage ties among similar labels → ASK_USER even when one accessible name is an exact unique match. | **Repaired** `uniqueExactName` (skips delete/submit/password). Not “prefer shorter”. |
| T029-R1-F003 | P1 | CONFIRMED DEFECT | `scoreSearchSubmitTarget` required button/submit/link/`formSubmitting`. Labeled `role=option` (SEARCH_COMMIT) scored −1 → “no unique search button”. | **Repaired.** Popup option/menuitem/treeitem with `\bsearch\b`/`\bfind\b`. Two Search options remain ASK_USER. |
| T029-R1-F004 | P2 | CONFIRMED DEFECT | Report `whatHappened` dumped leftover `VERIFIED_SUCCESS` (WAIT settle) while task result was COULD NOT COMPLETE. | **Repaired.** Action outcome vs task outcome copy. |
| T029-R1-F005 | P2 | DOCUMENTATION/UX | Empty NEVER_SEND password listed as if a value stayed local. Detector already `valuePresent=false`. | **Repaired** Report/privacy-summary wording. Policy unchanged. |
| T029-R1-F006 | P2 | CONFIRMED DEFECT | Bare 10-digit / ISBN-like prose classified `PII_PHONE` (Wikipedia-class false positive). | **Repaired** structured/context US phones; bibliographic skip; IN_MOBILE still independent. Do not weaken structured phones. |
| T029-R1-F007 | P1 | CONFIRMED DEFECT | T029-F010: action-level any URL change = success; search/open task could COMPLETE on a page that does not mention the query/resource. | **Repaired at task arbiter** when `outcomeEvidenceHay` is present. Action-level verifier still records navigation (not destination identity). |
| T029-R1-F008 | P1 | CONFIRMED (sibling) | Occluded canvas could still be `node.click()` if hit-test skipped. Hit-test existed; R1 adds regression. | **Preserved + regression.** |
| T029-R1-F009 | P2 | CONFIRMED DEFECT | `role=treeitem` not in INTERACTIVE_SELECTOR; visual region associated only by x/y < 4px. | **Repaired.** treeitem + bounded `aria-controls`/`aria-owns` popup collect; overlap association. |
| T029-R1-F010 | P3 | PROBABLE | `collectCandidates` walking every node for `shadowRoot` on huge pages. | **Not repaired** (performance opportunity). |
| T029-R1-F011 | P2 | DESIGN LIMITATION | Collapsed SEARCH with no field yet: architecture explores via SCROLL, not a single OPEN_SEARCH_SURFACE click. H07 already typed, so this was not H07 FIT. | **POST-SIH** REC-049. |
| T029-R1-F012 | P2 | DESIGN LIMITATION | Indian-mobile 10-digit starting 6–9 in unrelated prose can still TOKENIZE. | **Documented.** Do not globally disable IN_MOBILE. |
| T029-R1-F013 | P2 | POST-SIH | TaskGraph not the live trust-loop driver (T029-F009). R1 defects were fusion/ranking/SEARCH_COMMIT/report/F010, not missing TaskGraph. | **Leave architecture.** |
| T029-R1-F014 | P2 | DESIGN LIMITATION | Untrusted `PRESS_ENTER`; closed shadow; CORS `*`; AccName HTML subset. | **Unchanged.** |

No confirmed P0 this gate.

## Independent second pass (mandatory)

Traced: observer, registry/epoch/frames, AccName subset, visualRegions, capture, ROI, DPR mapping, OCR, groundAndFuse, canonical controls, semantic-ui, ranking, NI/NALIS, TaskGraph (not loop driver), SafeContext, privacy/vault/egress, planners, validator, confirmation, re-grounding, hit-test, executor, verifier, arbiter, recovery, cancellation, SW, Side Panel/overlay, Report, ledger, benches, fixtures.

Additional issues found by this pass (not only human H-tests):

- F001 IoU vs containment (H09).
- F003 SEARCH_COMMIT representation (H07).
- F004 Report action vs task.
- F006/F007 phone + destination.
- F009 treeitem / region association.
- `ShadowRoot.ownerDocument` null would crash aria-controls lookup; resolver does not use a null document.

Not a bug: H05 ASK_USER with several similar resource names and no unique exact name. H01–H04, H06, H08 Mock privacy.

## Anti-cheat

Production contains no `wikipedia.org`, `github.com`, `scenario-08`, painted-label, or fixture-coordinate special cases.
