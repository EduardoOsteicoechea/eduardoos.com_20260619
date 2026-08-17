#!/usr/bin/env bash
# build-frontend.sh — build Eduardo OS Next Astro frontend only.
# Shared by production and staging; serialize with flock so concurrent CI
# jobs do not corrupt frontend/dist mid-build.
#
# CRITICAL: nginx mounts frontend/dist live. Astro empties outDir at build
# start — building straight into dist causes blank/403/500 pages (especially
# /admin/users via try_files directory redirect cycles). Always build into a
# sibling directory, verify critical routes, then rsync into dist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
LOCK_DIR="${ROOT}/.cache"
LOCK_FILE="${LOCK_DIR}/frontend-build.lock"
DIST_LIVE="${FRONTEND}/dist"
DIST_STAGE="${FRONTEND}/dist-build"
# Vite client transform can thrash forever on small EC2 if heap is too large
# (swap) or too small (GC spin). Cap tightly; override via env if needed.
BUILD_TIMEOUT_SEC="${FRONTEND_BUILD_TIMEOUT_SEC:-720}"

# Small EC2 instances OOM / thrash when Node asks for 4GiB. Prefer ~1.5GiB.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

echo "==> Eduardo OS Next frontend build"
echo "    ROOT=$ROOT"
echo "    NODE_OPTIONS=$NODE_OPTIONS"
echo "    BUILD_TIMEOUT_SEC=$BUILD_TIMEOUT_SEC"

mkdir -p "${LOCK_DIR}"
exec 9>"${LOCK_FILE}"
echo "==> Waiting for frontend build lock (${LOCK_FILE})"
if ! flock -w 900 9; then
  echo "ERROR: timed out waiting for frontend build lock (${LOCK_FILE})"
  exit 1
fi
echo "==> Acquired frontend build lock"

cd "$FRONTEND"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Building into staging dir (${DIST_STAGE})"
rm -rf "${DIST_STAGE}"

# Bound the Astro/Vite pass so a hung transform cannot hold the deploy flock
# until GitHub Actions kills SSH (leaving orphans on the host).
if command -v timeout >/dev/null 2>&1; then
  if ! timeout --signal=TERM --kill-after=30 "${BUILD_TIMEOUT_SEC}" \
    npx astro build --outDir "${DIST_STAGE}"; then
    rc=$?
    echo "ERROR: astro build failed or timed out after ${BUILD_TIMEOUT_SEC}s (exit ${rc})"
    # Best-effort cleanup of runaway node/vite children from this tree.
    pkill -f "${FRONTEND}/node_modules" 2>/dev/null || true
    exit "${rc}"
  fi
else
  npx astro build --outDir "${DIST_STAGE}"
fi

echo "==> Verifying critical static routes in staging build"
required_files=(
  "index.html"
  "admin/users/index.html"
  "aps-admin/index.html"
  "contact/index.html"
  "favicon.svg"
)
for rel in "${required_files[@]}"; do
  if [[ ! -f "${DIST_STAGE}/${rel}" ]]; then
    echo "ERROR: missing required build output: ${DIST_STAGE}/${rel}"
    exit 1
  fi
done

echo "==> Publishing staging build → live dist (rsync, nginx-safe)"
mkdir -p "${DIST_LIVE}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${DIST_STAGE}/" "${DIST_LIVE}/"
else
  # Fallback when rsync is unavailable (e.g. some Windows CI hosts).
  rm -rf "${DIST_LIVE}.prev"
  if [[ -d "${DIST_LIVE}" ]]; then
    mv "${DIST_LIVE}" "${DIST_LIVE}.prev"
  fi
  mv "${DIST_STAGE}" "${DIST_LIVE}"
  rm -rf "${DIST_LIVE}.prev"
  # Recreate stage path marker for clarity in logs.
  DIST_STAGE="${DIST_LIVE}"
fi

rm -rf "${FRONTEND}/dist-build"

echo "==> Build complete: $DIST_LIVE"
echo "    Verified: /admin/users → admin/users/index.html"