# T019/T020 claims / evidence matrix

SHA: `771b51c16ca88d994869c369920516c93749bebc`

| Claim | Status | Evidence |
|---|---|---|
| N-Eye protects detected sensitive information before remote planning | PROVEN (tested corpus/channels) | privacy bench + canary channels |
| N-Eye does not normally send raw screenshots | PROVEN (this pack) | visual + performance screenshotOutboundBytes=0 |
| N-Eye uses local OCR when pixels contain needed text | PROVEN (controlled fixtures) | visual OCR 7/7 |
| N-Eye is adaptive rather than always-on vision | PROVEN (cascade corpus) | DOM-only 2/7 |
| N-Eye verifies browser actions locally | PARTIALLY PROVEN | task bench uses local arbiter; Chrome E2E remains MANUAL |
| ASK_USER is not confirmation | PROVEN (automated) | ask-user + overlay + trust-loop tests |
| Compact UI does not require SafeContext/PageEpoch/EgressGuard vocabulary | PROVEN (copy audit) | statusCopy compact jargon check |
| Hidden-site generalization | UNVERIFIED | T021/T022 |
| Clean-profile real Chrome E2E | UNVERIFIED | T021/T022 |
