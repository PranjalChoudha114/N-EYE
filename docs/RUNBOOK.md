# N-Eye Operational Runbook (Gate 005/006 + Cursor Genesis)

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
| Close/reopen Side Panel | Loads current side panel HTML/JS | After extension reload |

**True live/hot reload: NO.**

### First-time install
1. `pnpm build:extension` (or `pnpm build`)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select `apps/extension/dist` (the folder that contains `manifest.json`, `background.js`, `content.js`)
5. Confirm **one** N-Eye card. Do not keep a second unpacked copy.
6. Pin the icon / open the Side Panel
7. Verify **build identity**:
   - `chrome://extensions` version line shows `DEV • <git-short-sha>` (trailing `*` means uncommitted source)
   - Side Panel header next to “Trust Layer” shows the same label
   - `cat apps/extension/dist/build-identity.txt` matches

### After a normal Cursor source change
1. `pnpm build:extension` **or** keep `pnpm dev:extension` running
2. `chrome://extensions` → N-Eye → **Reload**
3. Refresh the target webpage if content-script / observer / executor changed
4. Close and reopen the Side Panel (or the panel after Reload)
5. Confirm the `DEV • <sha>` label changed or matches `git rev-parse --short HEAD` (`*` if dirty)

### After manifest / permission change
Reload the extension. If Chrome disables the extension, review the new permissions prompt, then Reload again. Re-select `apps/extension/dist` only if you previously loaded the wrong folder.

### After service-worker change
`chrome://extensions` → **Reload** is mandatory. A page refresh alone will not replace the background worker. Stale workers can keep an old manifest version (e.g. `0.1.0`) while `dist/manifest.json` is already `0.2.0`.

### After content-script change
Reload the extension, then **refresh every tab** you care about. Content scripts do not upgrade in already-open pages.

### Running Test Portal
```bash
python3 -m http.server 5173 --directory apps/test-portal
```
Navigate to `http://localhost:5173/scenario-06-trust-loop.html`.

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
