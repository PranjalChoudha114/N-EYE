# T021/T022 Chrome E2E (fresh profile)

Identity: `DEV • dc182a3*`
PASS 5 / FAIL 0 / INCONCLUSIVE 1

| id | goal | status | actual | notes |
|---|---|---|---|---|
| load-extension | Unpacked dist loads | PASS | chrome-extension://fignfifoniblkonapihmkfakmlgkbkcf/service_worker.js | DEV • dc182a3*
Built 2026-08-30T14:08:11.480Z (uncommitted source) |
| A-portal | Portal page loaded in fresh profile | PASS | http://127.0.0.1:59022/scenario-14-text-input.html | Content-script READY is proven via SW PING, not page-world window |
| sw-attach | Service worker CDP | INCONCLUSIVE | Error: Uncaught (in promise) TypeError: Cannot read properties of undefined (rea | MV3 SW may not expose Runtime |
| privacy-page | Open privacy fixture | PASS | navigated | synthetic canaries on page |
| high-risk-page | Open high-risk fixture | PASS | navigated | confirmation surface requires Side Panel owner |
| public-example | Public-site smoke (example.com) | PASS | Example Domain | date 2026-08-30 — no purchase/submit |

Side Panel owner loop, confirmation Allow/Deny, and ASK_USER Continue remain MANUAL if SW CDP cannot open the panel (user-gesture).
