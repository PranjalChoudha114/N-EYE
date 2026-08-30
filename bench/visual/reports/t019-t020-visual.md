# T019/T020 visual-context measurement

SHA: `771b51c16ca88d994869c369920516c93749bebc`

Held-out vs development splits from `bench/visual/ground-truth`. Not the T021 hidden corpus.

Text recognition (normalized contains): 7/7 = 100.0%
Target grounding: 7/7 = 100.0% (abstain 4, false grounding 0)
Adaptive cascade: 7/7; DOM-only 2; escalate 5
OCR privacy F1 (visual canaries): 100.0%; leakCount=0
OCR latency p50/p95: 10.19 / 28.63 ms (N=7)
OCR warmup (cold proxy): 67.75 ms; first recognize after warmup: 28.63 ms
Screenshot outbound: 0 B
MODEL_ADMISSION: REJECTED
