# T019/T020 performance / resource

SHA: `333631f1460188e29bc7eaaf38cb88f60b67c363`
Runtime: happy-dom on unknown

| Stage | N | p50 (ms) | p95 (ms) |
|---|---:|---:|---:|
| observation | 40 | 3.27 | 3.51 |
| privacyDetection | 40 | 0.01 | 0.02 |
| sanitizationAndSafeContext | 20 | 0.49 | 0.61 |
| mockPlanner | 20 | 0.04 | 0.09 |
| validation | 20 | 0.00 | 0.01 |
| executionTypeText | 15 | 0.19 | 1.43 |
| verification | 15 | 3.61 | 4.44 |

SafeContext bytes (this scene): 10268
RawScene local JSON bytes (comparison only, not sent): 1481
Screenshot outbound: 0 B

JS+CSS product dist bytes (uncompressed, excluding ocr/ and maps): 213912
JS+CSS product gzip PROXY: 67054
OCR asset bytes (traineddata + wasm + worker): 8123867
PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS
