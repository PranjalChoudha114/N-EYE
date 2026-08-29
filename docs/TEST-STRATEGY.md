# N-Eye Testing & Verification Strategy

## 1. Testing Philosophy
Testing is a parallel engineering track, not an afterthought. Invariants receive unit and integration tests, not just comments.

## 2. Test Tiers

### 2.1 Static & Contract Tests
- TypeScript strict mode verification (`pnpm typecheck`).
- ESLint architecture rule enforcement (`pnpm lint`).
- Protocol serialization & schema conformance tests (Vitest).

### 2.2 Privacy & Canary Tests
- Seed known synthetic secrets (canary passwords, OTPs, JWT tokens) into test DOMs **and** pixel/OCR fixtures (`OCR_EMAIL_T007@example.com`, `OCR_OTP_T007_928441`, `OCR_API_T007_SECRET`, `OCR_SESSION_T007_SECRET`).
- Assert that outbound serialization produces 0 occurrences of canary strings, `data:image/`, or PNG magic.
- Verify OCR text uses `source: 'ocr'` and secret classes remain `NEVER_SEND`.
- Verify that forbidden fields cannot be attached to `SafeContext`.

### 2.3 Browser Runtime & E2E Tests
- Controlled test portal (`apps/test-portal`), including Scenarios 07–09 for visual-only pages, Scenario 03 for SPA-1..9, and Scenario 10 for frames.
- SPA stale-action, mutation classification, TOCTOU, and frame-collision tests (`spa-dynamic.test.ts`, `frames-provenance.test.ts`).
- SIH visual harness (`bench/visual/ground-truth` vs `bench/visual/reports`).
- Content-script recovery state machine (inject bound = 1).
- Extension loading remains MANUAL for unpacked Chrome.

### 2.4 Adversarial & Fault Injection Tests
- Stale target replacement during plan-to-act transition.
- Prompt injection text in button labels, headings, **and OCR output**.
- Cross-origin message forgery attempts.
- Stale visual evidence / page epoch change during perception.
- Adaptive controller must not invoke OCR when DOM/ARIA is sufficient.

### 2.5 Real OCR fixture
At least one test feeds actual PNG pixels through Tesseract.js (`ocr-fixture.test.ts`). Mock OCR remains for policy/fusion unit tests.

