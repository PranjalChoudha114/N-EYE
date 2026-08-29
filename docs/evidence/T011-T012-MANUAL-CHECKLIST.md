# T011/T012 manual Chrome checklist

Real Chrome Side Panel E2E is **UNVERIFIED** until a human completes this list. happy-dom tests are not Chrome.

**Setup**

1. `pnpm build:extension`
2. Chrome → `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist/` (not `apps/extension/`)
3. Confirm card identity `DEV • <short-sha>` (rebuild after the gate commit)
4. Reload the extension after every rebuild. Reopen the Side Panel. Refresh the target tab.

**Pass condition for every case:** Content Script READY, no permanent CONTENT SCRIPT DISCONNECTED, raw screenshot outbound `0 B`, Privacy Receipt not showing a previous page's secrets after navigation.

| ID | Page | Action | Expected | Failure evidence |
|---|---|---|---|---|
| A | `apps/test-portal/scenario-03-dynamic.html` | Observe, then SPA-3 Semantic swap, Mock plan click Continue | BLOCK / FAILED. Delete is not clicked | Screenshot of Side Panel error + page still showing Delete |
| B | Same, SPA-1 Safe move | Observe, plan Continue, then move, execute | Local re-ground, click succeeds | Exec FAILED or wrong control |
| C | Same, SPA-2 Replace equivalent | Observe, plan, replace node, execute | SAFE_REGROUND click on new Continue | Click missed / error |
| D | Same, SPA-4 Duplicate | Observe, plan, duplicate, execute | Abstain, no guess | One of the two Continues clicked |
| E | `apps/test-portal/scenario-10-frames.html` | Observe, plan framed Continue | Click inside same-origin iframe, not top Continue | Top button clicked |
| F | Scenario 10 inaccessible iframe | Attempt to act inside `example.com` frame | Truthful inability / no coordinate click | Click landed in the red iframe |
| G | Scenario 03 SPA-7 Route | Observe, change route, execute old plan | Old proposal invalidated | Action still runs |
| H | Any supported https page | Idle observe | READY after SPA-like DOM updates | DISCONNECTED |
| I | After navigating away from a privacy page | Open Privacy Receipt | No stale receipt from previous origin | Receipt still names previous site secrets |

Do not load real credentials. Synthetic portal data only.
