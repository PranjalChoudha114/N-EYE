# N-Eye Operational Runbook (Gate T013/T014)

## 1. Quick Start

### Prerequisites
- Node.js >= 22
- pnpm >= 11
- Python >= 3.11 with virtual environment

### Installation
```bash
# Install Node workspace dependencies
pnpm install

# Setup Python virtual environment and install planner API dependencies
python3 -m venv .venv
.venv/bin/pip install -e apps/planner-api
# or
.venv/bin/pip install fastapi uvicorn pydantic httpx pytest pytest-asyncio python-dotenv
```

### Running the Planner API Gateway
```bash
# Option A: Run in Mock/Deterministic mode (Zero API keys required)
PLANNER_PROVIDER=mock PYTHONPATH=apps/planner-api .venv/bin/uvicorn src.main:app --port 8000 --host 127.0.0.1 --reload

# Option B: Run with Google Gemini (Real AI Reasoning)
# Create apps/planner-api/.env with:
# PLANNER_PROVIDER=gemini
# GEMINI_API_KEY=your_key_here
# PLANNER_MODEL=gemini-2.5-flash
PYTHONPATH=apps/planner-api .venv/bin/uvicorn src.main:app --port 8000 --host 127.0.0.1 --reload
```

## 2. Chrome extension — canonical development loop

**Canonical source:** `apps/extension/src/` (and `apps/extension/manifest.json`)
**Canonical Chrome Load unpacked path:** `apps/extension/dist/`
**Do not load** `apps/extension/` (source). Vite emits the MV3 bundle only into `dist/`.

Chrome does **not** hot-reload this extension. Rebuilding `dist/` is necessary but not sufficient. You must click **Reload** on `chrome://extensions`.

| Operation | What it does | Chrome updated? |
|---|---|---|
| `pnpm build:extension` | One-shot production bundle into `dist/` | No |
| `pnpm dev:extension` | Watches source and rebuilds `dist/` | No |
| Reload on `chrome://extensions` | Reloads service worker + extension runtime | Yes |
| Refresh the target webpage | Re-injects content script | After extension reload |
| Close overlay / reopen Side Panel | Overlay is a view; Side Panel reload after extension Reload | After extension reload |

**True live/hot reload: NO.**

### First-time install
1. `pnpm build:extension` (or `pnpm build`)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select `apps/extension/dist` (the folder that contains `manifest.json`, `background.js`, `content.js`)
5. Confirm **one** N-Eye card. Do not keep a second unpacked copy.
6. Pin the icon / click it to open the N-Eye overlay card on the current page
7. Verify **build identity**:
   - `chrome://extensions` version line shows `DEV • <git-short-sha>` (trailing `*` means **tracked** files have uncommitted edits; untracked files such as `scratch/` do not count)
   - Capsule footer shows the same label
   - `cat apps/extension/dist/build-identity.txt` matches

### After a normal Cursor source change
1. `pnpm build:extension` **or** keep `pnpm dev:extension` running
2. `chrome://extensions` → N-Eye → **Reload**
3. Refresh the target webpage if content-script / observer / executor changed
4. Close and reopen the N-Eye capsule (or the window after Reload)
5. Confirm the `DEV • <sha>` label changed or matches `git rev-parse --short HEAD` (`*` if dirty)

### After manifest / permission change
Reload the extension. If Chrome disables the extension, review the new permissions prompt, then Reload again. Re-select `apps/extension/dist` only if you previously loaded the wrong folder.

### After service-worker change
`chrome://extensions` → **Reload** is mandatory. A page refresh alone will not replace the background worker. Stale workers can keep an old manifest version (e.g. `0.1.0`) while `dist/manifest.json` is already `0.2.0`.

### After content-script change
Reload the extension. T009/T010 recovery will try **one** programmatic inject + handshake on the already-open tab. If the pill still says CONTENT SCRIPT DISCONNECTED, **refresh the page**. Restricted pages (`chrome://`, Web Store) cannot be injected.

`content.js` must remain a self-contained IIFE (no `import "./assets/..."`). The build fails if that invariant breaks.

T009/T010 notes:
- Manifest `0.3.0` adds `wasm-unsafe-eval` on **extension pages only** (Tesseract WASM). No new host permission.
- OCR assets live in `apps/extension/dist/ocr/` after `pnpm build:extension` (not loaded from a CDN).
- `file://` pages still need Chrome “Allow access to file URLs” on the extension card if you open the portal as files instead of `http.server`.
- After this gate: Reload extension → click the toolbar icon → confirm `DEV • <short-sha>` matches `git rev-parse --short HEAD`. If the page was open before Reload, the capsule should show RECOVERING then Ready, or a truthful Disconnected state — never Ready with a dead script.
- Visualizer must start empty: “No N-Eye privacy transformation has occurred for this task.”
- Scenarios 08/09: `http://localhost:5173/scenario-08-visual-only.html` and `scenario-09-held-out.html`.

### Running Test Portal
```bash
python3 -m http.server 5173 --directory apps/test-portal
```
Navigate to `http://localhost:5173/scenario-06-trust-loop.html` (DOM), `scenario-03-dynamic.html` (SPA-1..9), `scenario-10-frames.html` (iframes), `scenario-07-visual.html` (pixel/OCR), `scenario-08-visual-only.html` (canvas/icon/document), or `scenario-09-held-out.html` (held-out layout). T011/T012 manual Chrome steps: `docs/evidence/T011-T012-MANUAL-CHECKLIST.md`. T013/T014 overlay + Side Panel checklist: `docs/evidence/T013-T014-MANUAL-CHECKLIST.md`.

## 3. Automated Test Execution

```bash
# TypeScript/Vitest (protocol + extension)
pnpm -r run test

# Python/Pytest (16 isolated mock HTTP + 1 live Gemini adapter)
PYTHONPATH=apps/planner-api .venv/bin/pytest apps/planner-api/tests

# Lint and typecheck
pnpm lint
pnpm typecheck
```
