#!/usr/bin/env bash
# Build a source+docs release tarball. Excludes secrets, scratch, node_modules, dist, venv.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SHA="$(git rev-parse --short HEAD)"
OUT="dist-release"
mkdir -p "$OUT"
NAME="n-eye-sih-${SHA}"
tar --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.pnpm-store' \
  --exclude='.venv' \
  --exclude='dist' \
  --exclude='scratch' \
  --exclude='.env' \
  --exclude='**/.env' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  -czf "${OUT}/${NAME}-source.tgz" \
  AGENTS.md README.md package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.js \
  apps packages docs bench scripts .gitignore .nvmrc
echo "Wrote ${OUT}/${NAME}-source.tgz"
shasum -a 256 "${OUT}/${NAME}-source.tgz" | tee "${OUT}/${NAME}-source.sha256"
