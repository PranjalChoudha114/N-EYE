# T027 / T028 — claim audit

Labels: VERIFIED RESULT | VERIFIED ARCHITECTURE | AUTOMATED ONLY | REAL-CHROME VERIFIED | TARGET | LIMITATION | UNVERIFIED.

| Claim | Label | Evidence |
|---|---|---|
| Missing target is a typed ASK_USER, not a `targetCurrent` crash | AUTOMATED ONLY | `missing-target.test.ts` |
| SEARCH_ACTION includes combobox + unlabeled adjacent icon; voice is not Search | AUTOMATED ONLY | `semantic-ui-understanding.test.ts` 7b/7c |
| Dynamic-id click can verify via live identity change | AUTOMATED ONLY | semantic-ui test 27; Chrome AssertQA HUMAN REQUIRED |
| View Report after terminal tasks; facts require ledger events | AUTOMATED ONLY / VERIFIED ARCHITECTURE | `task-report.test.ts`; ADR-0018 |
| Planner COMPLETE ≠ task success | AUTOMATED ONLY | completion-arbiter, composite-search, task-report false-completion |
| PII/redaction metrics on synthetic corpus | VERIFIED RESULT (this corpus) | T027 privacy report N=69 |
| Free-text names/addresses detected | LIMITATION | labeled fields only |
| Pixel-only Scenario 08 in live Chrome | LIMITATION / UNVERIFIED | fixture TESTED; Chrome HUMAN REQUIRED |
| OCR is local Tesseract.js | VERIFIED ARCHITECTURE + MEASURED fixtures | visual pack 7/7 |
| No screenshot in Mock SafeContext benches | AUTOMATED ONLY | screenshot outbound 0 B in performance bench |
| Live serialized Remote body has no password/OTP/screenshot | AUTOMATED ONLY (mocked fetch of real body) | `canary.test.ts` Remote POST; live gateway still UNVERIFIED |
| Chrome RSS / main-thread long tasks | UNVERIFIED | Node heap PROXY only |
| Canaries absent from SafeContext/summary/receipt/ledger | AUTOMATED ONLY | T028 canary report + task-report canary test |
| Page injection cannot change policy | AUTOMATED ONLY | adversarial-injection, injection-dom, planner test_security |
| Hostile ActionProposal rejected | AUTOMATED ONLY | proposal-adversarial, authority-policy |
| NI cannot skip confirmation or lower risk | AUTOMATED ONLY | nalis-forensic-suite, confirmation-binding |
| Selenium-like “Text input” unique TYPE; TYPE→SUBMIT ordered | AUTOMATED ONLY | `selenium-isolation.test.ts` A–C; Chrome HUMAN REQUIRED |
| Empty password is SENSITIVE_CONTROL not a private value | AUTOMATED ONLY | privacy + selenium empty-password tests |
| Report screenshot FACT requires typed `egressAudit=PASS` | AUTOMATED ONLY | `task-report.test.ts`; ADR-0019 |
| AccName `label[for]` / labelledby order; role textbox | AUTOMATED ONLY | `observer.test.ts`; not full W3C AccName |
| `form.requestSubmit(submitter)` for native submit | AUTOMATED ONLY | `press-enter.test.ts` |
| Pixel CSS↔bitmap from measured sizes | AUTOMATED ONLY | `coordinates.test.ts`; Scenario 08 Chrome HUMAN REQUIRED |
| Side Panel E2E / page↔Report agreement | UNVERIFIED | checklist |
| Zero leakage as a universal property | NOT claimed | canary campaign is channel-limited |
