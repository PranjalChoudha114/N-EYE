# T019/T020 visual-context

SHA: `333631f1460188e29bc7eaaf38cb88f60b67c363`
Dataset: bench/visual/ground-truth/{development,held-out}.json

| Metric | Result | N |
|---|---|---|
| Text recognition (normalized contains) | 7/7 = 100.0% | 7 |
| Target grounding | 7/7 = 100.0% | 7 |
| Abstain | 4 | 7 |
| False grounding | 0 | 7 |
| Adaptive cascade | 7/7 | 7 |
| DOM-only | 2/7 | 7 |
| Escalate | 5/7 | 7 |
| OCR privacy F1 | 100.0% | visual canaries |
| OCR leakCount | 0 | visual canaries |
| OCR p50/p95 ms | 10.38 / 28.86 | 7 |
| OCR cold warmup PROXY ms | 71.16 | 1 |
| Screenshot outbound | 0 B | — |
| MODEL_ADMISSION | REJECTED | — |

Tesseract.js + deterministic geometry/fusion solved the required visual-only SIH cases. A local VLM/ONNX path is not currently justified.

These fixtures are development + held-out splits, not the T021 hidden corpus.
