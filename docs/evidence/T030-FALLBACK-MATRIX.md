# T030 — Fallback matrix

Source of truth: `apps/extension/src/eval/t030-fallback-matrix.ts` (25 rows).  
Invariant: failure must not increase authority, widen egress, skip confirmation, or weaken verification. Automated: `fallbackNeverIncreasesAuthority() === true`.

| ID | Primary | Fallback / stop | Authority | Privacy | Evidence |
|---|---|---|---|---|---|
| DOM_INSUFFICIENT | Adaptive OCR | Unique bind or ASK_USER | No guess click | Pixels local | OCR_USED only if text |
| OCR_UNAVAILABLE_CAPTURE | Tab/canvas capture | Structure else OCR_UNAVAILABLE | No pixel execute | No screenshot egress | FALLBACK_USED, no OCR_USED |
| OCR_TIMEOUT | Tesseract | Stop after timeout | No increase | Buffers released | OCR_TIMEOUT |
| OCR_LOW_CONFIDENCE | Bind boxes | Unlabeled / ASK_USER | No guess | OCR untrusted | FALLBACK_USED |
| VISUAL_AMBIGUITY | Unique bind + margin | ASK_USER VISUAL_UNBOUND | Not SYSTEM ERROR | Unchanged | OCR_USED if text |
| NO_TARGET | Ranking | TARGET_NOT_FOUND | No execute | Unchanged | TARGET_NOT_FOUND |
| DUPLICATE_TARGET | Unique exact / submit | MULTIPLE_CANDIDATES | No first-match | Unchanged | No ACTION_EXECUTED |
| OCCLUDED_TARGET | Hit-test | ASK_USER | No click-through | Unchanged | Exec fail |
| STALE_TARGET | Semantic re-ground | STALE_TARGET | No stale execute | Unchanged | BLOCKED |
| PAGE_NAVIGATION | Fresh observe + hay | PARTIAL if query missing | No false COMPLETE | URL stripped | PARTIAL_OUTCOME |
| ORIGIN_CHANGE | Record origin transition | Task hay for SEARCH | No site list | Origin+path | safeUrlEvidence |
| FRAME_INACCESSIBLE | Local inaccessibleFrames | No tunnel | No cross-origin guess | No frame URL egress | Local only |
| CLOSED_SHADOW | Open shadow only | Visual / ASK_USER | No fake closed root | Unchanged | Limitation |
| PROVIDER_UNAVAILABLE | Classified transport | Same SafeContext retry then stop | No execute from error | Same class retry | GATEWAY/PROVIDER phase |
| PROVIDER_TIMEOUT | Abortable fetch | PLANNER_MAX_ATTEMPTS=3 | No increase | No raw retry | FALLBACK_USED |
| MALFORMED_PROPOSAL | Coerce / reject extras | ASK_USER | No execute | Unchanged | ACTION_CHECKED fail |
| MALICIOUS_PROPOSAL | Validator + broker | BLOCKED | Decrease | Unchanged | Security log |
| CONFIRMATION_EXPIRED | Single-use id | Refuse answer | No execute | Unchanged | Security log |
| CONFIRMATION_MISMATCH | Re-ground semantic key | Fail closed | No reminted eN | Unchanged | TARGET_RECHECKED |
| SW_RESTART | Fail closed | New task | No hydrate grant | Vault gone | No resurrect |
| TAB_CLOSED | Port disconnect | Stop | No execute | Unchanged | DISCONNECTED |
| USER_CANCEL | Abort + generation | CANCELLED; may-have-executed | No further execute | Unchanged | TASK_CANCELLED |
| EXECUTION_TIMEOUT | Treat failure | HIGH no replay | Uncertain ≠ retry HIGH | Unchanged | No OUTCOME_VERIFIED |
| VERIFICATION_TIMEOUT | HIGH unverified stop | ASK_USER | No second Submit | Unchanged | HIGH_UNVERIFIED |
| LOCAL_EVIDENCE_UNAVAILABLE | Claim validator | NOT_VERIFIED | Report only | No secret fill | UNVERIFIED claims |

User-facing capture vs OCR vs unbound copy: `perception/fallback-policy.ts` + `status-map.ts` + `ask-user.ts` VISUAL_UNBOUND.
