# T028 resources / latency

SHA: `64638ad42da2fa401fa2f471d4f39e116770380f`
Hardware: unknown · RAM 25769803776 · Darwin 25.6.0
Runtime: happy-dom

JS+CSS: 298743 B uncompressed / 90302 B gzip PROXY
OCR assets: 8123867 B
SafeContext: 8348 B · screenshot outbound 0 B
Memory proxy: 57249408 (PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS)

| Stage | n | p50 ms | p95 ms |
|---|---:|---:|---:|
| observation | 40 | 5.68 | 6.66 |
| privacy | 40 | 0.02 | 0.03 |
| sanitization | 20 | 0.43 | 0.57 |
| mock planner | 20 | 0.02 | 0.06 |
| validation | 20 | 0.00 | 0.00 |
| execution | 15 | 0.19 | 1.71 |
| verification | 15 | 5.52 | 7.66 |

| Class (Node) | n | p50 ms | p95 ms |
|---|---:|---:|---:|
| search affordance | 40 | 0.00 | 0.01 |
| India PII detect | 30 | 0.00 | 0.01 |
| missing-target copy | 30 | 0.00 | 0.00 |
| report build | 20 | 0.00 | 0.02 |

These are happy-dom/Node development measurements, not Chrome E2E SIH judge numbers.
