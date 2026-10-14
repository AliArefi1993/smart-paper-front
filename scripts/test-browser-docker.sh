#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$repo_root/out/index.html" ]]; then
  echo 'Build local-data production assets before running browser tests.' >&2
  exit 1
fi
docker run --rm --init --ipc=host \
  -e BROWSER_BASE_URL="${BROWSER_BASE_URL:-http://127.0.0.1:3192}" \
  -v "$repo_root/out":/site:ro -v "$repo_root/tests/browser":/suite -w /suite \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  bash -lc 'set -euo pipefail; npm ci --ignore-scripts; (cd /site && node /suite/static-server.cjs) & preview_pid=$!; trap "kill $preview_pid 2>/dev/null || true" EXIT; node /suite/wait-preview.cjs; npm test'
