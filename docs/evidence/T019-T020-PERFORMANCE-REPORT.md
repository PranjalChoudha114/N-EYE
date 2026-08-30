# T019/T020 performance / resource

SHA: `333631f1460188e29bc7eaaf38cb88f60b67c363`
Runtime: happy-dom on unknown
OS: Darwin 25.6.0 arm64; RAM 25769803776 B; Node v26.7.0

Classification: **RESULT** for this Node/happy-dom pack. Not Chrome E2E.

| Stage | N | p50 (ms) | p95 (ms) |
|---|---:|---:|---:|
| observation | 40 | 3.27 | 3.51 |
| privacyDetection | 40 | 0.01 | 0.02 |
| sanitizationAndSafeContext | 20 | 0.49 | 0.61 |
| mockPlanner | 20 | 0.04 | 0.09 |
| validation | 20 | 0.00 | 0.01 |
| executionTypeText | 15 | 0.19 | 1.43 |
| verification | 15 | 3.61 | 4.44 |
| OCR recognize (visual fixtures) | 7 | 10.38 | 28.86 |

SafeContext bytes (this scene): 10268
RawScene local JSON bytes (comparison only, not sent): 1481
Screenshot outbound: 0 B
Product JS+CSS uncompressed: 213912 B
Product JS+CSS gzip PROXY: 67054 B
OCR assets: 8123867 B
PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS
