# N-Eye

> AI needs context. Not your identity.

**Privacy-preserving visual perception for lightweight browser agents.**

N-Eye is a Chrome MV3 browser extension that acts as a trust layer between the user's
private browser environment and remote AI reasoning. It observes pages locally, detects
and protects private data, sends only sanitized context to a remote planner, locally
validates every proposed action, and verifies results.

## Project Status

**Genesis** — Repository foundation, engineering constitution, and first MV3 shell established.

## Architecture Overview

```
SEE locally → PROTECT locally → THINK remotely → VALIDATE locally → ACT locally → VERIFY locally
```

The browser keeps sensitive context and execution authority local. Remote reasoning
receives only the information it needs via the `SafeContext` contract.

## Quick Start

### Prerequisites

- Node.js ≥ 22 (tested with v26.7.0)
- pnpm ≥ 11
- Chrome browser

### Install

```bash
pnpm install
```

### Build

```bash
# Build all packages and the extension
pnpm build
```

### Test

```bash
# Run all tests
pnpm test

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

### Load Extension in Chrome

1. Run `pnpm build`
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `apps/extension/dist/` directory
6. The N-Eye icon should appear in the toolbar

### Test Portal

Open `apps/test-portal/index.html` in Chrome to test the extension against
controlled pages with synthetic canary data.

## Repository Structure

```
N-Eye/
├── AGENTS.md                    # Engineering constitution
├── package.json                 # Monorepo root
├── pnpm-workspace.yaml          # Workspace config
├── tsconfig.base.json           # Shared TypeScript config
├── eslint.config.js             # ESLint config
├── docs/                        # Architecture & governance docs
│   ├── UNDERSTANDING.md
│   ├── CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── TRUST-MODEL.md
│   ├── PRIVACY-BOUNDARY.md
│   ├── PROTOCOLS.md
│   ├── TEST-STRATEGY.md
│   ├── RECOMMENDATIONS.md
│   └── decisions/               # Architecture Decision Records
├── packages/
│   └── protocol/                # Shared type definitions
│       └── src/
│           ├── identifiers.ts   # Branded types (TaskId, ElementId, etc.)
│           ├── raw-scene.ts     # Local-only observation types
│           ├── safe-context.ts  # Outbound contract types
│           ├── action-proposal.ts # Constrained action types
│           ├── messages.ts      # Internal messaging contracts
│           └── errors.ts        # Typed error taxonomy
├── apps/
│   ├── extension/               # Chrome MV3 extension
│   │   ├── manifest.json
│   │   └── src/
│   │       ├── background/      # Service worker
│   │       ├── content/         # Content script
│   │       └── sidepanel/       # Side panel UI
│   └── test-portal/             # Controlled test pages
└── evidence/                    # (Future) Measurement artifacts
```

## Key Documents

- [AGENTS.md](AGENTS.md) — Engineering constitution for AI agents
- [Architecture](docs/ARCHITECTURE.md) — System architecture overview
- [Trust Model](docs/TRUST-MODEL.md) — Trust zones and boundaries
- [Privacy Boundary](docs/PRIVACY-BOUNDARY.md) — Privacy invariants
- [Protocols](docs/PROTOCOLS.md) — Data contract definitions

## SIH 2026 — Problem Statement 26171

**On-device Visual Perception for Lightweight Browser Agents**
Organization: ISRO / Dept. of Space

Scoring: Visual-context accuracy (25%) | PII precision-recall (20%) |
Redaction precision (20%) | Client resource utilization (20%) | E2E latency (15%)

## License

Private — SIH 2026 competition entry.
