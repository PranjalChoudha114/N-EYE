# N-Eye Architecture Recommendations Log

## 1. Recommendations Overview
This log tracks architecture proposals, trade-offs, and decisions made during the evolution of N-Eye.

| ID | Title | Status | Impact Area | Summary |
|----|-------|--------|-------------|---------|
| REC-001 | Use Branded Types for Identifiers | **Adopted** | Protocol | Use opaque branded nominal types for `TaskId`, `ElementId`, `TokenId` to prevent domain mix-ups. |
| REC-002 | Strict Outbound Schema Allowlist | **Adopted** | Network / Egress | Eliminate generic dictionary/JSON serialization for outbound network requests; allow only strict `SafeContext`. |
| REC-003 | Defer React for Genesis Extension Shell | **Adopted** | Extension UI | Use Vanilla HTML/TS for Phase 1 MV3 shell; introduce React in subsequent UI-focused task to minimize initial moving parts. |
| REC-004 | In-Memory Token Vault for Prototype | **Adopted** | Vault / Privacy | Avoid persistent storage (IndexedDB/chrome.storage) for token mappings to prevent leakages across browser restarts. |
