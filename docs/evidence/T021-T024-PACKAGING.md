# T021 packaging / permissions / secrets

## Manifest (unchanged)

| Permission | Why |
|---|---|
| `sidePanel` | Owner UI (trust loop) |
| `activeTab` | User-initiated tab work |
| `tabs` | Active tab URL/title for supported-page classification |
| `scripting` | One recovery inject of `content.js` after Reload |
| `<all_urls>` host | Observe/act on the user’s current page; no remote code |

CSP `extension_pages`: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. WASM is local Tesseract. No remote executable. OCR assets copied into `dist/ocr/` at build from `ocr-assets/` + `tesseract.js` package files.

## Secrets

- `apps/planner-api/.env` gitignored. `scripts/secret-scan.sh` PASS on production source.
- Synthetic canaries in tests/fixtures are intentional.

## Repro commands (README/RUNBOOK)

```
pnpm install
python3 -m venv .venv
.venv/bin/pip install -e apps/planner-api
pnpm test
pnpm build:extension
```

Live Gemini is optional. Mock needs no key.

## Artifact

`bash scripts/pack-release.sh` writes a source tarball under `dist-release/` (gitignored). Rebuild extension from the tagged SHA; do not ship `.env`.
