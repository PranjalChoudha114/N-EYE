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
- `availableTokens`: array of `TokenCapability` (`tokenId`, `tokenSymbol`, `privacyClass`, `descriptionRole`) — never real values
- `visualHints`: optional sanitized description + geometry (never image bytes). Produced after local OCR/fusion. Remote crop bytes are not sent.

### 2.3 Perception (Zone 1→3, local-only)
- `PerceptionDecision`: escalate yes/no, reasons (WHY OCR ran), ROI specs
- `OcrTextBlock`: text, optional engine confidence, viewport bbox, roiId, pageEpoch
- `VisualCandidate` / `VisualGrounding`: fused local targets with source `DOM` | `OCR` | `FUSED`
- `PerceptionResult`: `_isLocalOnly: true`; must never include rasters or data URLs

### 2.4 Content-script handshake (Zone 1 ↔ 2)
- `CONTENT_SCRIPT_PROTOCOL`: integer `1`
- `PING` to the tab returns `ContentScriptHello` (`ready`, `contentProtocol`, url/origin/epoch)
- Service-worker `PING` remains a timestamp pong and is not a page handshake

### 2.5 ActionProposal (Zone 5 -> Zone 4 -> Zone 3: Untrusted Inbound)
Structured next action suggestion returned by planner:
- `actionId`: `ActionId`
- `type`: `CLICK` | `TYPE_TOKEN` | `TYPE_TEXT` | `SCROLL` | `SELECT` | `WAIT` | `ASK_USER` | `COMPLETE`
- `targetId`?: `ElementId`
- `tokenId`?: `TokenId`
- `tokenSymbol`?: string (e.g. `[EMAIL_1]`)
- `textValue`?: string (non-sensitive text only; validator rejects password targets)
- `reasoning`: string
- `expectedOutcome`: string
- `riskLevel`: `LOW` | `MEDIUM` | `HIGH` | `BLOCKED`

### 2.6 Internal Extension Messages
Typed cross-context messaging between Content Script, Service Worker, and Side Panel.
- `OBSERVE_REQUEST` / `OBSERVE_RESPONSE`
- `EXECUTE_ACTION_REQUEST` / `EXECUTE_ACTION_RESPONSE`
- `GET_TASK_STATE` / `TASK_STATE_UPDATED`
- `CAPTURE_ROIS_REQUEST` / `CAPTURE_TAB_CROPS` (ROI RGBA locally; never planner transport)
- `PING` / `PONG`
