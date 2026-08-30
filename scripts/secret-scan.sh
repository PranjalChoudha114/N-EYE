#!/usr/bin/env bash
# Scan production source for likely real credentials. Synthetic CANARY_* fixtures are allowed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HITS=0
while IFS= read -r file; do
  case "$file" in
    apps/extension/src/*|apps/planner-api/src/*|packages/*) ;;
    *) continue ;;
  esac
  case "$file" in
    */__tests__/*|*eval/*|*detectors.ts|*egress-guard.ts) continue ;;
  esac
  if rg -n \
    -e 'GEMINI_API_KEY\s*=\s*["'"'"']?[A-Za-z0-9_-]{20,}' \
    -e 'AIza[0-9A-Za-z_-]{35}' \
    -e 'sk_live_[0-9a-zA-Z]{24,}' \
    -e 'ghp_[0-9a-zA-Z]{36}' \
    "$file" >/dev/null 2>&1; then
    echo "SECRET_SHAPE $file"
    HITS=$((HITS + 1))
  fi
done < <(git ls-files)
if git ls-files | rg -q '(^|/)\.env$'; then
  echo "TRACKED_ENV"
  HITS=$((HITS + 1))
fi
if [[ "$HITS" -ne 0 ]]; then
  echo "secret-scan FAIL ($HITS)"
  exit 1
fi
echo "secret-scan PASS"
