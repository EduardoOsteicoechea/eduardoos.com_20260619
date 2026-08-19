#!/usr/bin/env bash
# build-frontend.sh — manual Astro build on the host (recovery / local EC2).
# Production CI builds on GitHub Actions and calls publish-frontend-dist.sh instead.
#
# CRITICAL: nginx mounts frontend/dist live. Astro empties outDir at build
# start — building straight into dist causes blank/403/500 pages. Always build
# into a sibling directory, then publish via publish-frontend-dist.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="$ROOT/frontend"
DIST_STAGE="${FRONTEND}/dist-build"
BUILD_TIMEOUT_SEC="${FRONTEND_BUILD_TIMEOUT_SEC:-720}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

echo "==> Eduardo OS frontend build (manual / recovery)"
echo "    ROOT=$ROOT"
echo "    NODE_OPTIONS=$NODE_OPTIONS"
echo "    BUILD_TIMEOUT_SEC=$BUILD_TIMEOUT_SEC"

cd "$FRONTEND"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Building into staging dir (${DIST_STAGE})"
rm -rf "${DIST_STAGE}"

if command -v timeout >/dev/null 2>&1; then
  if ! timeout --signal=TERM --kill-after=30 "${BUILD_TIMEOUT_SEC}" \
    npx astro build --outDir "${DIST_STAGE}"; then
    rc=$?
    echo "ERROR: astro build failed or timed out after ${BUILD_TIMEOUT_SEC}s (exit ${rc})"
    pkill -f "${FRONTEND}/node_modules" 2>/dev/null || true
    exit "${rc}"
  fi
else
  npx astro build --outDir "${DIST_STAGE}"
fi

chmod +x "${ROOT}/deploy/ec2/publish-frontend-dist.sh"
bash "${ROOT}/deploy/ec2/publish-frontend-dist.sh" "${DIST_STAGE}"
