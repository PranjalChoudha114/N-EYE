# Architecture Decision Record (ADR) 0007: Local Adaptive Visual Perception

## Status
**ACCEPTED**

## Context
Gate T007/008 must observe visual-only page content (images, canvas, icon-only controls, PDF-like surfaces) without turning N-Eye into a screenshot-to-cloud VLM. Structure-first observation already exists. Pixels are a new **local** input source, not a new egress path.

## Decisions
1. **Adaptive controller (structure first).** OCR runs only when DOM/ARIA is insufficient (canvas, image text, unlabeled/icon controls, PDF/document preview, unresolved visual target). The decision records *why* OCR was invoked.
2. **Replaceable OCR seam.** `OcrEngine.recognize(roi) → OCRResult`. Runtime engine is Tesseract.js v7 (Apache-2.0, WASM, offline with vendored `eng.traineddata`). Provider init stays behind the seam.
3. **ROI-bounded capture.** Prefer canvas `getImageData` / same-origin `drawImage`. Unresolved regions use `chrome.tabs.captureVisibleTab` once per escalate, then crop. Existing `<all_urls>` + `tabs` suffice; no new host permission. Pathological sizes are rejected.
4. **Pixel lifecycle.** `PixelBuffer` is capture → process → extract text → zero/release. No `chrome.storage`, disk, logs, or TaskState rasters. Normal outbound screenshot bytes = 0. Remote privacy-safe crop transmission is **deferred**.
5. **OCR privacy.** OCR text is untrusted page data. It enters the existing detector/policy/vault/SafeContext/egress path with `source: 'ocr'`. Secrets remain `NEVER_SEND` (no `[PASSWORD_n]` export).
6. **Fusion.** DOM/ARIA wins when present; OCR labels unlabeled nearby controls; duplicate labels fuse rather than duplicate targets. Visual evidence is bound to `PageEpoch` and fail-closes when stale.
7. **OCR runs in the Side Panel (extension page), not the service worker.** Avoids Offscreen permission. WASM CSP: `script-src 'self' 'wasm-unsafe-eval'` on extension pages only.
8. **Human assurance.** Truthful states (local monitoring vs protected vs blocked), origin-only site-change events, Privacy Receipts with human + technical evidence and no vault/secret values.

## Consequences
- **Positive:** SIH visual-perception path exists locally; privacy/authority model unchanged; engine can be swapped without redesign.
- **Negative:** Tesseract English LSTM + WASM adds ~7.7 MB to the unpacked extension. UI-font OCR accuracy is a development measurement, not a SIH benchmark. `file://` tab capture still requires Chrome “Allow access to file URLs”.
