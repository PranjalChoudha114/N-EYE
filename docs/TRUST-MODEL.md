# N-Eye Trust Model & Zone Architecture

## 1. Trust Zones

Security authority is structured into 6 distinct zones:

```
[ Zone 0: Hostile Webpage ]
            │ (Untrusted DOM / Scripts)
[ Zone 1: Content Script (Observer + Executor) ]
            │ (Isolated World, No Privileged Secrets)
[ Zone 2: Privileged Extension Core (Service Worker / Side Panel) ]
            │ (Orchestration & State Management)
[ Zone 3: Local Sensitive Processing (Privacy + Vault + Validator) ]
            │ (In-memory token vault, deterministic detectors)
[ Zone 4: Network Egress Guard (SafeContext Allowlist Gate) ]
            │ (Canary check, byte inspection)
[ Zone 5: Remote Planner Service (Untrusted Advice) ]
```

## 2. Zone Breakdown

### Zone 0 — Webpage (Hostile)
- Arbitrary untrusted HTML, CSS, JavaScript, canvas, and third-party trackers.
- May contain prompt injections, adversarial hidden elements, or malicious listeners.
- Authority: **Zero**.

### Zone 1 — Content Script (Page-Adjacent, Limited)
- Runs in Chrome's isolated world.
- Has direct DOM access to observe visible interactable controls in the top document and same-origin frames, and click/type upon instruction.
- **Rule**: Must NEVER store API keys, persistent vault records, or planner transport logic. Must NEVER tunnel into cross-origin iframe documents or expand host permissions to make a test pass.

### Zone 2 — Privileged Extension Core (Trusted Coordinator)
- Service Worker & Side Panel.
- Coordinates message routing, task lifecycle, user confirmation dialogs, and UI display.
- **Rule**: Ephemeral and resilient to service-worker suspension.

### Zone 3 — Local Sensitive Processing (Highly Trusted)
- Deterministic privacy detectors, local Token Vault, Action Risk Validator, Verification Engine, and on-device OCR.
- Holds active session token bindings and transient ROI rasters (released after OCR).
- **Rule**: Never exports raw token mappings, screenshots, or raw OCR to disk, storage, or network.

### Zone 4 — Network Egress Guard (Controlled Boundary)
- Strict serializer and allowlist schema validator.
- Validates that outbound payloads strictly adhere to `SafeContext` schema.
- Rejects any unrecognized fields or un-sanitized PII canaries.

### Zone 5 — Remote Planner (Untrusted Advice)
- Cloud or local AI model endpoint.
- Only receives `SafeContext`.
- Returns `ActionProposal` JSON objects.
- Authority: **Advisory only**. Cannot run arbitrary JavaScript or bypass local policy.
