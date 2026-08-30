# T019/T020 human-first UX

## What did not change
- Overlay card + Side Panel architecture, logo, tabs (Activity / Privacy / Action / Evidence), dark/light/system.
- CSS additions only: `.nq-hint` and `.n-receipt h4` using existing type tokens.

## ASK_USER vs CONFIRM
- CONFIRM: “N-Eye needs your approval” + Allow once / Don’t allow. Bound capability.
- ASK_USER: “I need your help” + rewrite field + Continue + Cancel. Continue calls `start()` (fresh observe/validate). Cancel dismisses to READY. No Allow once.

## Compact copy mappings
- ASK_USER → I need your help
- RATE_LIMITED → AI service is temporarily busy
- GATEWAY_UNREACHABLE → Can’t connect to the AI service
- Tokenized (compact) → Hidden from the AI
- Kept local (compact) → Stayed on your device (for this AI request; website may still see what you type)
- SafeContext (compact) → Protected AI context
- Egress Guard (compact) → Privacy check passed
- OCR invoked (compact) → Read visible text locally
- Screenshot outbound 0 B → No screenshot was sent
- Pipeline SEE…VERIFY rail: Look / Read / Protect / Ask / Check / Do / Prove

Technical terms remain on Evidence and under View technical details.

## Copy audit (automated)
Compact status headlines/messages for READY through ASK_USER omit SafeContext, PageEpoch, EgressGuard, tokenization, and OCR as required vocabulary.
Formal human usability study: not performed.
