# N-Eye

> AI needs context. Not your identity.

**Privacy-preserving visual perception for lightweight browser agents.**

N-Eye is a Chrome MV3 browser extension that acts as an immutable trust layer between the user's
private browser environment and remote AI reasoning. It observes pages locally, detects
and protects private data, sends only sanitized context to a remote planner, locally
validates every proposed action, resolves private tokens locally, executes permitted actions,
and verifies results.

## Project Status

**Gate:** T021–T024 software completion. Held-out templates are TESTED. Chrome owner-loop and 10-run demo rehearsal remain **MANUAL**. Local visual model / ONNX / WebGPU: **REJECTED**.

## Architecture Overview

```
SEE locally → PERCEIVE locally (if needed) → PROTECT locally → THINK remotely (SafeContext) → VALIDATE locally → ACT locally → VERIFY locally
```

The browser keeps sensitive context and execution authority local. Remote reasoning
receives only the information it needs via the `SafeContext` contract.

## Quick Start

See the [Operational Runbook](docs/RUNBOOK.md) for full instructions.

### Prerequisites

- Node.js ≥ 22
- pnpm ≥ 11
- Python ≥ 3.11 with `.venv`
- Google Chrome browser

### Install & Build

```bash
# Install Node dependencies
pnpm install

# Build all packages and the extension
pnpm build
```

### Run Tests

```bash
# TypeScript suites (protocol + extension)
pnpm -r run test

# Python suites (planner gateway)
PYTHONPATH=apps/planner-api .venv/bin/pytest apps/planner-api/tests

pnpm lint
pnpm typecheck
```

### Start Planner API Gateway

```bash
# Start FastAPI gateway on port 8000
PYTHONPATH=apps/planner-api .venv/bin/uvicorn src.main:app --port 8000 --host 127.0.0.1 --reload
```

### Load Extension in Chrome

Canonical unpacked path is **`apps/extension/dist/`** (never `apps/extension/` source).

Chrome does **not** hot-reload N-Eye. After source changes:

```bash
pnpm build:extension    # one-shot
# or
pnpm dev:extension       # watch: rebuilds dist only
```

Then `chrome://extensions` → N-Eye → **Reload**, refresh the page, reopen the Side Panel. Confirm the `DEV • <git-short-sha>` label in the panel header and on the extension card.

Full loop: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Repository Structure

```
N-Eye/
├── AGENTS.md                    # Engineering constitution
├── package.json                 # Monorepo root
├── pnpm-workspace.yaml          # Workspace config
├── tsconfig.base.json           # Shared TypeScript config
├── eslint.config.js             # ESLint config
├── docs/                        # Architecture & governance docs
│   ├── CONTEXT.md               # Operational memory
│   ├── ARCHITECTURE.md          # Architecture overview
│   ├── TRUST-MODEL.md           # Trust zones & boundary definitions
│   ├── PRIVACY-BOUNDARY.md      # Privacy boundary & allowlists
│   ├── PROTOCOLS.md             # Protocol schema contracts
│   ├── TEST-STRATEGY.md         # Test strategy & canary proofs
│   ├── RUNBOOK.md               # Developer operational runbook
│   └── decisions/               # Architecture Decision Records (ADR 0001 - 0007)
├── packages/
│   └── protocol/                # Shared protocol contracts & branded identifiers
├── apps/
│   ├── extension/               # Chrome MV3 extension (Content Script, Service Worker, Side Panel, perception)
│   ├── planner-api/             # FastAPI Remote Planner Gateway & Provider Adapters
│   └── test-portal/             # Controlled test scenarios (01 to 07)
```

## Key Documents

- [AGENTS.md](AGENTS.md) — Engineering constitution for AI agents
- [Runbook](docs/RUNBOOK.md) — Setup and execution guide
- [Context](docs/CONTEXT.md) — Operational memory and system state
- [Architecture](docs/ARCHITECTURE.md) — System architecture overview
- [Trust Model](docs/TRUST-MODEL.md) — Trust zones and boundaries
- [Privacy Boundary](docs/PRIVACY-BOUNDARY.md) — Privacy invariants
- [Protocols](docs/PROTOCOLS.md) — Data contract definitions
- [ADR-0007](docs/decisions/ADR-0007-local-adaptive-perception.md) — Local Adaptive Visual Perception

## SIH 2026 — Problem Statement 26171

**On-device Visual Perception for Lightweight Browser Agents**
Organization: ISRO / Dept. of Space

Scoring: Visual-context accuracy (25%) | PII precision-recall (20%) |
Redaction precision (20%) | Client resource utilization (20%) | E2E latency (15%)

## License

Private — SIH 2026 competition entry.
