# Architecture Decision Record (ADR) 0018: Verified Task Report

## Status
**ACCEPTED** (architecture). Side Panel / overlay Chrome presentation remains **HUMAN REQUIRED**.

## Context
T027/T028 require N-Eye to prove what it understood, inspected, protected, proposed, allowed, executed, and verified — including for partial and failed tasks. A green badge, planner `COMPLETE`, or `click()` dispatch is not success. Historical Side Panel status could disagree with the page. Users also saw engine exceptions (`targetCurrent`) instead of a human stop.

## Decision
1. **Every terminal task produces a View Report control.** Terminal includes VERIFIED COMPLETE, PARTIALLY COMPLETE, COULD NOT COMPLETE, STOPPED FOR SAFETY, CANCELLED, and SYSTEM ERROR. Failure reports are first-class.
2. **Authoritative evidence is a local append-only ledger.** Only the trust loop writes events. Page text and Remote/model text are `UNTRUSTED_INPUT` if recorded. No vault mappings, raw secrets, screenshots, or hidden chain-of-thought.
3. **A Report Verifier constructs the user report from the ledger + local product state.** A claim is FACT only when required local events exist. Otherwise: UNVERIFIED, UNKNOWN, NOT OBSERVED, or NOT APPLICABLE.
4. **Success is only VERIFIED COMPLETE when fresh local evidence satisfies the success condition** (`OUTCOME_VERIFIED` or local `ALREADY_SATISFIED`). Planner COMPLETE, UI color, and execution dispatch cannot author that result.
5. **Human view is ten sections:** what you asked; what N-Eye understood; what it looked at; privacy (detected / protected / sent / not sent, no raw secrets); how it decided; what it did; what actually happened; result; why; time (system stages vs human approval wait).
6. **Technical details are expandable** and may show task/build/origin, observation method, OCR/visual flags, privacy counts, protected-context size, proposal/risk/confirmation, execution/verification, fallbacks, timings, payload size. Never vault maps.
7. **NI (N-Eye Intelligence) may propose. Local N-Eye remains the authority.** The report must not treat model statements as facts.

## Alternatives
- Model-written narrative reports: rejected (unsupported claims).
- Success-only reports: rejected (failures are competition-critical).
- Persisting raw reports to disk: rejected for this gate (session/product state only).

## Consequences
- **Positive:** Partial YouTube-class search and missing-target stops can be explained without claiming completion. Privacy claims require ledger + egress evidence.
- **Negative:** Real Chrome agreement between page and report is still HUMAN REQUIRED. Screenshot “not sent” is FACT only when Remote ran and local egress recorded PASS with 0 screenshot bytes — not from UI color.
- **Privacy:** Ledger scrub drops secret-like untrusted text entirely rather than partial-replacing it.

## Supercedes
Nothing. Complements ADR-0005 (authority), ADR-0004 (egress), ADR-0017 (intelligence proposes only).
