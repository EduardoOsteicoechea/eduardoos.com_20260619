#!/usr/bin/env bash
# build-frontend.sh — build Eduardo OS Next Astro frontend only.
# Shared by production and staging; serialize with flock so concurrent CI
# jobs do not corrupt frontend/dist mid-build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
LOCK_DIR="${ROOT}/.cache"
LOCK_FILE="${LOCK_DIR}/frontend-build.lock"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "==> Eduardo OS Next frontend build"
echo "    ROOT=$ROOT"
echo "    NODE_OPTIONS=$NODE_OPTIONS"

mkdir -p "${LOCK_DIR}"
exec 9>"${LOCK_FILE}"
echo "==> Waiting for frontend build lock (${LOCK_FILE})"
flock 9
echo "==> Acquired frontend build lock"

cd "$FRONTEND"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

echo "==> Build complete: $FRONTEND/dist"
