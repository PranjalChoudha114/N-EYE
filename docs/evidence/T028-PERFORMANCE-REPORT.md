# T028 resources / latency

SHA: `7bca2ec4f1946020d11428a38d74a11448039c08`
Hardware: unknown · RAM 25769803776 · Darwin 25.6.0
Runtime: happy-dom

JS+CSS: 314292 B uncompressed / 94184 B gzip PROXY
OCR assets: 8123867 B
SafeContext: 8348 B · screenshot outbound 0 B
Memory proxy: 46296928 (PROXY: Node process.memoryUsage().heapUsed after bench, not Chrome extension RSS)

| Stage | n | p50 ms | p95 ms |
|---|---:|---:|---:|
| observation | 40 | 6.24 | 7.95 |
| privacy | 40 | 0.02 | 0.03 |
| sanitization | 20 | 0.42 | 0.55 |
| mock planner | 20 | 0.02 | 0.06 |
| validation | 20 | 0.00 | 0.00 |
| execution | 15 | 0.21 | 1.89 |
| verification | 15 | 5.63 | 13.33 |

| Class (Node) | n | p50 ms | p95 ms |
|---|---:|---:|---:|
| search affordance | 40 | 0.00 | 0.01 |
| India PII detect | 30 | 0.00 | 0.02 |
| missing-target copy | 30 | 0.00 | 0.00 |
| report build | 20 | 0.01 | 0.04 |

These are happy-dom/Node development measurements, not Chrome E2E SIH judge numbers.
