#!/usr/bin/env bash
# Builds the Astro static site on the EC2 host (no Docker). Output: frontend/dist/
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
FRONTEND_DIR="${APP_DIR}/frontend"

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [ "${major}" -ge 20 ] 2>/dev/null; then
      echo "==> Node $(node -v) OK"
      return 0
    fi
    echo "==> Node $(node -v) is older than v20; installing Node 22"
  else
    echo "==> Node not found; installing Node 22"
  fi

  if command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "ERROR: install Node.js 20+ manually, then re-run this script."
    exit 1
  fi
}

echo "==> Building frontend on host (${FRONTEND_DIR})"
ensure_node

cd "${FRONTEND_DIR}"
export NODE_ENV=production
npm ci --no-audit --prefer-offline
# Tests run in GitHub Actions; EC2 deploy only builds static assets.
npm run build

if [ ! -f dist/index.html ]; then
  echo "ERROR: frontend/dist/index.html missing after build"
  exit 1
fi

echo "==> Frontend ready at ${FRONTEND_DIR}/dist"
