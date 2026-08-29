# T009/T010 SIH visual evaluation (development measurement)

Generated: 2026-08-29T13:25:03.002Z

This is **not** a final SIH score. Sample counts are listed. p95 is null unless n ≥ 5.

## Cascade: 7/7
## Grounding: 7/7 (false grounding 0, abstain 4)
## OCR normalized-contains: 7/7
## OCR latency ms: count=7 p50=10.521166999999991 p95=30.697249999999997 (p95 requires n≥5)
## Visual PII F1: 1.000 (tp=4 fp=0 fn=0) leakCount=0
## Raw screenshot outbound bytes: 0
## MODEL_ADMISSION: REJECTED

Tesseract.js + deterministic geometry/fusion solved the required visual-only SIH cases. A local VLM/ONNX path is not currently justified.
