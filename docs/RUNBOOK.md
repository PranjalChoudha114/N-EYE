# N-Eye Operational Runbook (Gate 005/006)

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

### Building the Chrome MV3 Extension
```bash
# Build extension bundle into apps/extension/dist
pnpm -r --filter './apps/**' run build
```

### Loading Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select `apps/extension/dist`.
4. Open the extension Side Panel by clicking the N-Eye icon in the toolbar.

### Running Test Portal
```bash
# Serve test portal on port 5173
python3 -m http.server 5173 --directory apps/test-portal
```
Navigate to `http://localhost:5173/scenario-06-trust-loop.html`.

## 2. Automated Test Execution

```bash
# Run TypeScript/Vitest test suites across packages & extension (57 tests)
pnpm -r run test

# Run Python/Pytest test suites on Planner Gateway (16 tests)
PYTHONPATH=apps/planner-api .venv/bin/pytest apps/planner-api/tests

# Run lint and typecheck
pnpm lint
pnpm typecheck
```
