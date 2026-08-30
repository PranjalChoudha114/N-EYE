# T019/T020 performance / resource

SHA: `771b51c16ca88d994869c369920516c93749bebc`
Runtime: happy-dom on Apple M5
OS: Darwin 25.6.0 arm64; RAM 25769803776 B; Node v26.7.0

Classification: **RESULT** for this Node/happy-dom pack. Not Chrome E2E.

| Stage | N | p50 (ms) | p95 (ms) |
|---|---:|---:|---:|
| observation | 40 | 3.21 | 3.61 |
| privacyDetection | 40 | 0.01 | 0.02 |
| sanitizationAndSafeContext | 20 | 0.39 | 0.52 |
| mockPlanner | 20 | 0.04 | 0.09 |
| validation | 20 | 0.00 | 0.01 |
| executionTypeText | 15 | 0.18 | 1.40 |
| verification | 15 | 3.63 | 4.23 |
| OCR recognize (visual fixtures) | 7 | 10.19 | 28.63 |

SafeContext bytes (this scene): 10264
RawScene local JSON bytes (comparison only, not sent): 1481
Screenshot outbound: 0 B
Product JS+CSS uncompressed: 213912 B
Product JS+CSS gzip PROXY: 67054 B
OCR assets: 8123867 B
PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS
