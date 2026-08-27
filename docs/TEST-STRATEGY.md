# N-Eye Testing & Verification Strategy

## 1. Testing Philosophy
Testing is a parallel engineering track, not an afterthought. Invariants receive unit and integration tests, not just comments.

## 2. Test Tiers

### 2.1 Static & Contract Tests
- TypeScript strict mode verification (`pnpm typecheck`).
- ESLint architecture rule enforcement (`pnpm lint`).
- Protocol serialization & schema conformance tests (Vitest).

### 2.2 Privacy & Canary Tests
- Seed known synthetic secrets (canary passwords, OTPs, JWT tokens) into test DOMs.
- Assert that outbound serialization produces 0 occurrences of canary strings.
- Verify that forbidden fields cannot be attached to `SafeContext`.

### 2.3 Browser Runtime & E2E Tests
- Controlled test portal (`apps/test-portal`).
- Extension loading and service worker communication verification.
- Content script target grounding and isolation tests.

### 2.4 Adversarial & Fault Injection Tests
- Stale target replacement during plan-to-act transition.
- Prompt injection text in button labels and headings.
- Cross-origin message forgery attempts.
