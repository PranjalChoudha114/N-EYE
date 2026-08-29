# N-Eye SIH visual evaluation harness

Ground truth lives here. Predictions are produced by `apps/extension` tests.

```
bench/visual/
  ground-truth/     # hand-authored expected answers (never imported by perception code)
  reports/          # generated JSON + Markdown from the eval runner
```

Development vs held-out splits are separate JSON files. The runner must not derive expected labels from `decidePerception` or `groundAndFuse`.
