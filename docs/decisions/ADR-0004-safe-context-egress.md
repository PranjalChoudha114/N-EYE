# Architecture Decision Record (ADR) 0004: SafeContext & Egress Guard

## Status
**ACCEPTED**

## Context
Raw page observations (`RawScene`) and untrusted user task goals must not be transmitted directly over the network to remote planners. A verifiable boundary is needed to prevent secret leakage.

## Decisions
1. **SafeContext Allowlist**:
   - `SafeContextBuilder` constructs outbound payloads field-by-field.
   - `RawScene` properties (`_isLocalOnly`, `elements`, `xpath`, `privacyFindings`) are strictly prohibited from passing through.
   - User task goals are sanitized before inclusion (passwords redacted, emails converted to token symbols).
2. **Egress Guard**:
   - Outbound payloads are serialized to JSON and inspected by `validateSafeContextEgress()`.
   - Performs byte-level scanning for canary credentials and high-entropy API key patterns.
   - Enforces a 256 KB size bound and fails closed if any unexpected field or secret pattern is detected.

## Consequences
- **Positive**: Cryptographic and byte-level guarantees that outbound requests contain only sanitized structure and scoped token symbols.
- **Negative**: Outbound payload size is restricted to 256 KB.
