# Architecture Decision Record (ADR) 0015: Local language-model admission REJECTED (T026-B)

## Status
**ACCEPTED**

## Context
T026-B asked whether a compact on-device text model (ONNX / Transformers.js / WebGPU) should join the intelligence path. ADR-0008 already rejected a visual neural model. T025 added a deterministic interpreter that must be the baseline.

## Decisions
1. **Admission is evidence-based.** Corpus: literal, paraphrase, search, navigate, form, select, scroll, unsupported, privacy-sensitive. Compare interpreter vs a frozen regex-only baseline. Do not download a neural model for this gate.
2. **MODEL_ADMISSION = REJECT** for a local language LLM/VLM on the critical path. The deterministic parser beat the regex baseline in `runGoalIntelligenceBench` without model download, WASM/WebGPU init, or extra CSP surface.
3. **LOCAL_MODEL remains a provenance label only.** If a later gate measures a quality/cost win in Chrome, reopen this ADR. Output would still be untrusted `ActionProposal`.
4. **Do not add Transformers.js, ONNX Runtime, or a weights file** in T026.

## Consequences
- **Positive:** Offline Mock stays small; no model fetch; no WebGPU correctness dependency.
- **Negative:** Indirect natural language beyond the parser still ASK_USER or (if enabled) Remote.
- **Supersedes:** Nothing in ADR-0008 (visual). This is the language-model counterpart.
