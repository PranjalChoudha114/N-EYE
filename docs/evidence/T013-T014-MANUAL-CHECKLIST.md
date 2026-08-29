# T013 / T014 — Manual Chrome QA checklist

Load unpacked: `apps/extension/dist/`. Reload after every rebuild. True hot reload: NO.

Confirm identity: `chrome://extensions` version_name matches `apps/extension/dist/build-identity.txt`.

PASS requires:

- [ ] Click N-Eye toolbar icon
- [ ] NO giant standalone window
- [ ] Floating N-Eye card appears over the current website
- [ ] Position visually matches upper-right inset intent (~16–28px, compact width ~300–380px)
- [ ] Card is compact (not a 680px panel)
- [ ] Website remains visible behind / around it
- [ ] Card has translucent/glass treatment
- [ ] Text remains highly readable
- [ ] Logo is the approved N-Eye mark
- [ ] Status is truthful
- [ ] Site is hostname-only (no query string)
- [ ] Mock works exactly as before (deterministic local planner)
- [ ] Remote behaves exactly as before (gateway/provider path; not a fake of Mock)
- [ ] Run works
- [ ] Cancel works
- [ ] Card can close without corrupting N-Eye core (loop continues if Side Panel is open)
- [ ] More / Details opens Chrome Side Panel
- [ ] No new tab opens
- [ ] Side Panel uses the same visual identity
- [ ] Activity contains deep information
- [ ] Privacy contains deep information
- [ ] Action contains deep information
- [ ] Evidence retains full instrumentation
- [ ] Dark theme works
- [ ] Light theme works
- [ ] System theme works
- [ ] No stale evidence across tabs
- [ ] Raw screenshot outbound invariant preserved (`0 B`)
- [ ] T011/T012 SPA/frame behavior still works
- [ ] No new Chrome permissions vs T011/T012 (`sidePanel`, `activeTab`, `tabs`, `scripting`)
