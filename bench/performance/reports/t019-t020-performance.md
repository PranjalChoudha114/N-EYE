# T019/T020 performance / resource

SHA: `771b51c16ca88d994869c369920516c93749bebc`
Runtime: happy-dom on Apple M5

| Stage | N | p50 (ms) | p95 (ms) |
|---|---:|---:|---:|
| observation | 40 | 3.21 | 3.61 |
| privacyDetection | 40 | 0.01 | 0.02 |
| sanitizationAndSafeContext | 20 | 0.39 | 0.52 |
| mockPlanner | 20 | 0.04 | 0.09 |
| validation | 20 | 0.00 | 0.01 |
| executionTypeText | 15 | 0.18 | 1.40 |
| verification | 15 | 3.63 | 4.23 |

SafeContext bytes (this scene): 10264
RawScene local JSON bytes (comparison only, not sent): 1481
Screenshot outbound: 0 B

JS+CSS product dist bytes (uncompressed, excluding ocr/ and maps): 213912
JS+CSS product gzip PROXY: 67054
OCR asset bytes (traineddata + wasm + worker): 8123867
PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS
