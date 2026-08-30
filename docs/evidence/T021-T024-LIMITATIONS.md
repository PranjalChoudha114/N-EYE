# T021–T024 limitations register

| LIMITATION | IMPACT | SAFE BEHAVIOR | WORKAROUND | FUTURE | JUDGE-FACING ANSWER |
|---|---|---|---|---|---|
| Held-out eval is same-agent templates, not a blind lab | Cannot claim independent hidden-site certification | Results labeled HELD-OUT TEMPLATE EVALUATION | Independent lab later | Third-party corpus | We measured 20 held-out templates with a sealed first-pass, not every website |
| Mock grammar is a bounded dialect | Unknown goals ASK_USER | No fake COMPLETE | Remote planner for richer goals | Expand dialect only with tests | Offline demo uses Mock; it refuses unknown goals |
| Custom widgets / closed shadow / contenteditable | Unsupported | ASK_USER | Native controls | Widget adapters | We do not guess custom controls |
| Inaccessible / cross-origin frames | No inner DOM | Fail closed | User acts in that frame | — | We will not click a frame we cannot see |
| PII_NAME/ADDRESS/ACCOUNT not scored as detections | Taxonomy gap | Policy maps exist; not claimed as P/R | Email/phone/secrets are scored | Expand detectors | We do not claim we detect every PII class |
| T019 latency is Node/happy-dom | Not Chrome E2E p95 | Labeled RESULT for that runtime | Chrome supplement is sparse | Chrome traces | We report the runtime we measured |
| OCR fixtures are high-contrast | Not all UI fonts | Fail closed / ASK_USER | — | Optional engine swap (REC-017) | Local OCR on controlled fixtures, not every screenshot |
| T019 visual 7/7 is perception, not Chrome visual-action | Fixture OCR/cascade/fusion onto a synthetic button | Real Chrome must still fuse onto a registered live node and propose CLICK | REC-028: labeled canvas/img are click-capable | Coordinate clicks remain forbidden | Automated visual 7/7 does not prove “click the painted control” in Chrome |
| Live Gemini 429/503 | Remote path unavailable | Skip/degrade; Mock backup | Mock demo | — | Provider outage does not grant extra authority |
| Side Panel open needs user gesture | CDP cannot finish owner-loop E2E | Manual checklist | Human Reload + click | — | Judges should click the toolbar like a user |
| 10 consecutive demo runs | Not executed in this agent environment | Procedure frozen; human rehearsal | Rehearse on finale hardware | — | Demo reliability is an operator procedure |
| No CI workflow in-repo | Clone must run commands locally | RUNBOOK | Add CI later | GitHub Actions | Repro is documented, not auto-gated |
| CORS `*` on gateway (REC-008) | Dev convenience | Gateway is local | Tighten before internet deploy | ADR | Prototype gateway is localhost |
