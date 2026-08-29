# Architecture Decision Record (ADR) 0010: Overlay quick card + Side Panel Trust Center

## Status
**ACCEPTED** (corrected)

## Context
T013/T014 first shipped a detached `chrome.windows.create({ type: 'popup' })` window as the primary UI. That was the wrong surface: a large standalone extension page, not a card over the current website. The T011/T012 behavioral core (Side Panel owns the trust loop, vault, and OCR) must stay the person; only the clothing changes.

`action.default_popup` is still rejected: it closes on page click.

## Decisions
1. **Toolbar click toggles an isolated page overlay.** The content script mounts a closed Shadow DOM host (`#n-eye-overlay-host`) at the upper-right of the current webpage. No `chrome.windows.create`. No new tab.
2. **The overlay is view/control only.** It must not host `PrivateTokenVault`, Tesseract, or `TrustLoopController`. Closing it must not cancel a running task.
3. **The Chrome Side Panel is the owner document** (T011/T012). Vault, OCR, and the trust loop live there. More / Details / Run (when no owner exists) call `chrome.sidePanel.open({ tabId })`.
4. **Theme** remains `localStorage['n-eye.theme']` on the extension page. The overlay receives the preference over the UI bus and never writes page `localStorage`.
5. **Canonical brand** stays centralized in `src/ui/brand.ts`. The mark is exposed only as `web_accessible_resources` for the overlay `<img>`, not as a new Chrome permission.
6. **More → Side Panel gesture.** `chrome.sidePanel.open` requires a user gesture on an extension page. A tiny `web_accessible` iframe (`overlay/open-panel.html`) is mounted on the More control so the click can call `sidePanel.open` directly. The iframe hosts no vault and no secrets. If a page CSP blocks the iframe, the in-shadow More button still messages the service worker.

## Consequences
- **Positive:** The website stays visible around a compact glass card. Full instrumentation remains in the Side Panel. Loop ownership matches T011/T012.
- **Negative:** Chrome may require a user gesture for `sidePanel.open` in some versions; the More iframe is the legitimate workaround. Overlay DOM can be removed by a hostile page; that cannot steal the vault because the vault is not in the overlay.
- **Privacy:** ProductState still must never include vault `realValue`. Overlay attributes must not carry secrets. The More iframe is click-only.
