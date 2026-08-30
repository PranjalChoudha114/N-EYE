# T021–T024 claims / evidence matrix

Statuses: PROVEN | PARTIALLY_PROVEN | UNVERIFIED | LIMITATION

| CLAIM | SCOPE | STATUS | EVIDENCE | LIMITATION |
|---|---|---|---|---|
| Secrets in the tested canary set do not appear in tested SafeContext/summary/receipt channels | T019 + T021 synthetic canaries, happy-dom | PROVEN | `bench/canary`, `final-canary.ts`, hidden h05 | Not “never leaks anywhere” |
| Auth-class NEVER_SEND residual leak = 0 on T019 corpus | 41 sanitization samples | PROVEN | T019 privacy/sanitization JSON | Corpus-bound |
| PII micro P/R/F1 100% on 55-sample T019 corpus | Implemented detector classes | PROVEN | T019 privacy JSON | Not all PII classes; not the web |
| Raw screenshot outbound 0 B on measured paths | T019 visual/performance + Evidence model | PROVEN (those paths) | T019 performance/visual | Not a proof of every future path |
| Adaptive OCR, not always-on | Cascade corpus | PROVEN | T019 visual cascade | Fixture pages |
| Planner is untrusted; extra keys/selectors/JS rejected | Proposal schema | PROVEN | `proposal-schema`, final-redteam | — |
| Confirmation is a single-use capability | Automated | PROVEN | `confirmation-binding.test.ts` | Chrome confirm click MANUAL |
| Planner COMPLETE is not product Completed | Arbiter | PROVEN | `completion-arbiter.test.ts` | — |
| Duplicate Mock clicks abstain after T021 repair | Mock grammar | PROVEN (post-repair) | first-pass had 2 wrong clicks; current 0 | First-pass preserved |
| Held-out generalization | 20 templates | PARTIALLY_PROVEN | first-pass + post-repair JSON | Same-agent templates; some AMBIGUOUS verifies |
| Fresh-profile Chrome loads unpacked extension | Chrome 152, this machine | PARTIALLY_PROVEN | `bench/chrome/t021-chrome-e2e.json` | Identity was dirty `dc182a3*`; owner-loop MANUAL |
| Live HTTP canary capture in Chrome | Network panel | UNVERIFIED | — | Use human DevTools on a protect event |
| 10 consecutive demo runs | Finale hardware | UNVERIFIED | Demo procedure only | Operator rehearsal |
| Universal website agent | — | LIMITATION | — | Do not claim |
| Perfect privacy / 100% security | — | LIMITATION | — | Do not claim |
