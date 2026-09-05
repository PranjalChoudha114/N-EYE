# T029-R1 — Semantic affordance audit

No site adapters. Representation-independent only.

## Wikipedia H05 (composite autocomplete)

Observed: query typed; several similar resource names; ASK_USER MULTIPLE_CANDIDATES; no wrong click; no false complete.

**FIT:** click ranking treated token-coverage ties as always ambiguous.

**Repair:** unique exact accessible-name match may break a tie. Derivative names (“X Institute”, “X: The Biography”) stay ambiguous.

**After R1:** if one candidate’s AccName equals the requested entity, act. Otherwise ASK_USER remains correct. Do not prefer shorter labels. Do not special-case any article title.

## Wikipedia H06

Exposed search field + submit: PASS. Preserve.

## GitHub H07 (dynamic search)

Observed: search UI opened; query typed; visible “Search all of …” action; ASK_USER “no unique search button”; no Enter hack; no wrong click.

**FIT:** SEARCH_COMMIT was modeled as button/submit/link only. A labeled popup `option` scored −1.

**Repair:** SEARCH_COMMIT may be:

- native submit / form-associated submit
- labeled button/link with search/submit/find
- unique unlabeled adjacent search icon
- labeled `option` / `menuitem` / `treeitem` containing `\bsearch\b` or `\bfind\b` (`aria-selected` bonus)

Two Search popup actions → ASK_USER. Ambiguous submits still do **not** PRESS_ENTER.

Observer now includes `role=treeitem` and bounded descendants of `aria-controls` / `aria-owns` popups.

## OPEN_SEARCH_SURFACE

Bounded SCROLL exploration already exists. A dedicated one-step “click unique search opener then re-observe” is **not** wired. H07 had already typed, so this was not the FIT. Deferred REC-049 (POST-SIH). Do not wander.

## F010 destination

Action verifier still treats URL/origin change as **action** success (query/hash stripped from the evidence string).

Task arbiter: SEARCH and NAVIGATE (`Open X`) require the query/resource to appear in privacy-safe outcome hay (origin+path + title) when hay is provided. Generic `Click Continue` is not a destination check.
