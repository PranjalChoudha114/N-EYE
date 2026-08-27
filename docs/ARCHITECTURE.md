# N-Eye Architecture Overview

## 1. System Identity
N-Eye is a privacy-preserving visual perception trust layer for browser agents. It operates as a Chrome Manifest V3 (MV3) extension, serving as an immutable trust boundary between the user's private browser session and remote AI reasoning engines.

## 2. Core Execution Loop
```
[ Webpage (DOM / Visual Pixels) ]
             │
             ▼ (Zone 0 -> Zone 1)
[ Browser Observer & Content Script ]
             │
             ▼ (Zone 1 -> Zone 3)
[ Local Sensitive Processing (Privacy Detection + Vault Tokenization) ]
             │
             ▼ (Zone 3 -> Zone 4)
[ Egress Guard: Strict SafeContext Construction & Byte-Level Canary Scan ]
             │
             ▼ (Zone 4 -> Zone 5 - Untrusted Network Boundary)
[ Remote Planner Gateway (FastAPI) -> Provider Adapter (Gemini / Mock) ]
             │
             ▼ (Zone 5 -> Zone 4 -> Zone 3)
[ Local Action Validator (Schema + Epoch + Target + Policy Guard) ]
             │
             ▼ (Zone 3 -> Zone 1)
[ Local Action Executor (Content Script Live Reference Execution) ]
             │
             ▼ (Zone 1 -> Zone 3)
[ Local Verification Engine (State-Change Delta Confirmation) ]
```

## 3. Runtime Component Placement

| Component | Context | Primary Responsibility | Constraints / Trust |
|-----------|---------|------------------------|----------------------|
| **Content Script** | Isolated Webpage Context | Observes visible interactable DOM elements, manages live target node references, executes validated actions | Hostile-adjacent; no secrets or planner API keys |
| **Service Worker** | Chrome MV3 Background | Task lifecycle coordinator, message router, permission manager | No DOM access; ephemeral lifecycle |
| **Side Panel UI** | Privileged Extension UI | User task control, Trust Core visualizer, SafeContext inspector, Mode switcher, Network proof drawer | Privileged UI; observes state, does not store secrets |
| **Planner Gateway** | Backend Service (`apps/planner-api`) | Validates SafeContext, holds provider API keys, formats structured prompt, returns ActionProposal | Server-side only; zero browser execution authority |
| **Provider Adapters** | Gateway Subsystem | Translates SafeContext into LLM structured generation (Gemini, OpenAI, Mock) | Vendor-isolated; output treated as untrusted data |
| **Remote Planner Client** | Extension Client (`apps/extension`) | Dispatches egress-guarded SafeContext via HTTP POST with timeout, cancellation, and retry | Strictly calls Egress Guard before transport |

## 4. Architectural Invariants
1. Raw DOM dumps, full screenshots, form values, and credentials never cross the network by default.
2. `SafeContext` is the sole allowed schema for outbound network planner requests.
3. `ActionProposal` returned by planners is untrusted advice and must be locally validated before execution.
4. Private token mapping (`[EMAIL_1]` -> `user@example.com`) is held purely in local memory and resolved at the moment of authorized execution.
5. All critical actions require post-execution verification against live page deltas.
6. Remote AI reasoning engines receive intelligence context only; they receive NO direct browser execution authority.
