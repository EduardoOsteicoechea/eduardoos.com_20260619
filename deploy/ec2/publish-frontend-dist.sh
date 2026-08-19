#!/usr/bin/env bash
# publish-frontend-dist.sh — publish a prebuilt Astro dist to nginx html root.
#
# CI builds on the GitHub Actions runner and uploads /tmp/frontend-dist.tgz.
# This script only unpacks, verifies critical routes, and rsyncs into
# frontend/dist (nginx mounts that path live — never empty it mid-publish).
#
# Override tarball path with FRONTEND_DIST_TGZ. Optional: pass a staging
# directory as $1 instead of unpacking a tarball (manual recovery).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="$ROOT/frontend"
LOCK_DIR="${ROOT}/.cache"
LOCK_FILE="${LOCK_DIR}/frontend-build.lock"
DIST_LIVE="${FRONTEND}/dist"
DIST_STAGE="${FRONTEND}/dist-build"
TGZ="${FRONTEND_DIST_TGZ:-/tmp/frontend-dist.tgz}"

echo "==> Eduardo OS frontend publish (prebuilt)"
echo "    ROOT=$ROOT"
echo "    DIST_LIVE=$DIST_LIVE"

mkdir -p "${LOCK_DIR}"
exec 9>"${LOCK_FILE}"
echo "==> Waiting for frontend publish lock (${LOCK_FILE})"
if ! flock -w 900 9; then
  echo "ERROR: timed out waiting for frontend publish lock (${LOCK_FILE})"
  exit 1
fi
echo "==> Acquired frontend publish lock"

STAGE_READY=0
if [[ "${1:-}" != "" ]]; then
  SRC="$1"
  if [[ ! -d "${SRC}" ]]; then
    echo "ERROR: staging directory not found: ${SRC}"
    exit 1
  fi
  # Manual build already wrote into dist-build — reuse it in place.
  if [[ "$(cd "${SRC}" && pwd)" == "$(mkdir -p "${DIST_STAGE}" && cd "${DIST_STAGE}" && pwd)" ]]; then
    echo "==> Using existing staging dir ${DIST_STAGE}"
    STAGE_READY=1
  else
    echo "==> Copying staging from ${SRC}"
    rm -rf "${DIST_STAGE}"
    mkdir -p "${DIST_STAGE}"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "${SRC}/" "${DIST_STAGE}/"
    else
      cp -a "${SRC}/." "${DIST_STAGE}/"
    fi
    STAGE_READY=1
  fi
fi

if [[ "${STAGE_READY}" -ne 1 ]]; then
  if [[ ! -f "${TGZ}" ]]; then
    echo "ERROR: prebuilt tarball missing: ${TGZ}"
    echo "       CI must scp frontend-dist.tgz before DEPLOY_FRONTEND=1 publish."
    exit 1
  fi
  echo "==> Unpacking ${TGZ} → ${DIST_STAGE}"
  rm -rf "${DIST_STAGE}"
  mkdir -p "${DIST_STAGE}"
  tar -xzf "${TGZ}" -C "${DIST_STAGE}"
fi

echo "==> Verifying critical static routes in staging build"
required_files=(
  "index.html"
  "admin/users/index.html"
  "payments/subscription/index.html"
  "contact/index.html"
  "church/workspace/index.html"
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
  rm -rf "${DIST_LIVE}.prev"
  if [[ -d "${DIST_LIVE}" ]]; then
    mv "${DIST_LIVE}" "${DIST_LIVE}.prev"
  fi
  mv "${DIST_STAGE}" "${DIST_LIVE}"
  rm -rf "${DIST_LIVE}.prev"
  DIST_STAGE="${DIST_LIVE}"
fi

rm -rf "${FRONTEND}/dist-build"

echo "==> Publish complete: $DIST_LIVE"
echo "    Verified: /admin/users → admin/users/index.html"
