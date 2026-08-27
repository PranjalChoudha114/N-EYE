# N-Eye Protocol Contracts & Data Structures

## 1. Identifiers
All identifiers are strongly branded in TypeScript to prevent domain confusion:
- `TaskId`: Unique identifier for an agent execution task.
- `ElementId`: Ephemeral session-local identifier (e.g. `e1`, `e2`) assigned to interactable controls.
- `PageEpoch`: Integer incremented whenever the active tab DOM undergoes meaningful mutation or navigation.
- `ActionId`: Unique identifier for a proposed or executed action step.
- `TokenId`: Opaque token identifier for vaulted private data (e.g. `TOKEN_EMAIL_1`).

## 2. Core Protocol Schemas

### 2.1 RawScene (Zone 1 -> Zone 3: Local Only)
Contains complete local observations: visible element candidates, bounding rects, accessibility labels, and detected privacy findings.
*Rule: Marked non-serializable across Zone 4.*

### 2.2 SafeContext (Zone 4 -> Zone 5: Outbound Contract)
Strict allowlisted JSON object sent to remote planner:
- `protocolVersion`: string (e.g., `"1.0.0"`)
- `taskId`: `TaskId`
- `pageEpoch`: `PageEpoch`
- `sanitizedGoal`: string
- `safeElements`: array of `SafeElement` (id, role, safeLabel, inputType, enabled, bbox)
- `tokenRoles`: array of available token capabilities (e.g. `[TOKEN_EMAIL_1]`)
- `visualHints`: optional safe crop references if explicitly escalated

### 2.3 ActionProposal (Zone 5 -> Zone 4 -> Zone 3: Untrusted Inbound)
Structured next action suggestion returned by planner:
- `actionId`: `ActionId`
- `type`: `CLICK` | `TYPE_TOKEN` | `SCROLL` | `SELECT` | `WAIT` | `ASK_USER` | `COMPLETE`
- `targetId`?: `ElementId`
- `tokenId`?: `TokenId`
- `value`?: string (for non-sensitive input)
- `reasoning`?: string
- `riskLevel`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

### 2.4 Internal Extension Messages
Typed cross-context messaging between Content Script, Service Worker, and Side Panel.
- `OBSERVE_REQUEST` / `OBSERVE_RESPONSE`
- `EXECUTE_ACTION_REQUEST` / `EXECUTE_ACTION_RESPONSE`
- `GET_TASK_STATE` / `TASK_STATE_UPDATED`
- `PING` / `PONG`
