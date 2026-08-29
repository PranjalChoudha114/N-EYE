# Architecture Decision Record (ADR) 0008: Content-script IIFE recovery and visual-model non-admission

## Status
**ACCEPTED**

## Context
T007/008 implemented on-device OCR. A human then loaded `apps/extension/dist/` in real Chrome (`DEV • ac69e08`) and observed **CONTENT SCRIPT DISCONNECTED** on a normal https page while the Side Panel still showed default SEE=ACTIVE, LOCAL_MONITORING copy, and illustrative privacy-visualizer values.

Inspection of the T007/008 `dist/content.js` showed ES module `import` of Vite chunks. Chrome `content_scripts` are classic scripts and never execute that graph, so `chrome.tabs.sendMessage` has no receiver. The existing 100ms inject retry re-injected the same broken file.

Separately, the T009/T010 brief asked whether a local ONNX/WebGPU visual model was required. ADR-0007 already chose replaceable Tesseract.js. Admission must be evidence-based.

## Decisions
1. **Content script is a self-contained IIFE.** Vite's extension-page build remains ES modules (service worker `type: module`, Side Panel). `content.js` is produced in `closeBundle` as an IIFE with `inlineDynamicImports`. The build fails if `content.js` contains `import` of `./assets`.
2. **Bounded recovery stays on the existing inject path.** PING handshake (`CONTENT_SCRIPT_PROTOCOL`), at most one programmatic inject per observation, handshake wait ≤ 1500ms, one observe retry, no READY without a successful observe, no inject on restricted URLs, duplicate-listener guard via a live `chrome.runtime` ping from the previous boot closure.
3. **Privacy visualizer is empty until a real protect step.** Static `user@example.com` / `[EMAIL_1]` placeholders are forbidden as live evidence.
4. **MODEL_ADMISSION = REJECTED for this gate.** Controlled visual-only cases (image, canvas, unlabeled icon, document-like, fusion, abstention, canaries) passed with Tesseract + geometry. No ONNX Runtime or WebGPU model is added. WebGPU remains acceleration, not a correctness dependency.

## Consequences
- **Positive:** Real-Chrome observation can actually start; recovery can succeed after extension Reload; judges cannot mistake demo privacy rows for a current event; no extra model download/CSP/WebGPU hazard.
- **Negative:** Content is bundled twice in the Vite pipeline (main build + IIFE). UI-font OCR quality remains a development measurement. Real Chrome Side Panel E2E is still MANUAL.
