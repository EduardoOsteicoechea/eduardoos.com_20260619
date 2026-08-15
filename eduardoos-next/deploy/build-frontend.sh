#!/usr/bin/env bash
# build-frontend.sh — build Eduardo OS Next Astro frontend only.
# Never touches parent production frontend/ or nginx.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "==> Eduardo OS Next frontend build"
echo "    ROOT=$ROOT"
echo "    NODE_OPTIONS=$NODE_OPTIONS"

cd "$FRONTEND"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

echo "==> Build complete: $FRONTEND/dist"