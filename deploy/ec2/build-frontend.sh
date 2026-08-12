#!/usr/bin/env bash
# Builds the Astro static site on the EC2 host (no Docker). Output: frontend/dist/
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
FRONTEND_DIR="${APP_DIR}/frontend"
LOCK_FILE="${LOCK_FILE:-/tmp/eduardoos-frontend-build.lock}"

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

verify_node_modules() {
  # Incomplete installs show up as missing Astro CLI internals + Vite optimizeDeps misses.
  local required=(
    "node_modules/astro/package.json"
    "node_modules/astro/dist/cli/index.js"
    "node_modules/react/package.json"
    "node_modules/react-dom/package.json"
    "node_modules/@astrojs/react/package.json"
    "node_modules/toastify-js/package.json"
  )
  local missing=0
  local path
  for path in "${required[@]}"; do
    if [ ! -e "${path}" ]; then
      echo "ERROR: missing ${path}"
      missing=1
    fi
  done
  # Astro 5 ships throw-and-exit; older broken trees fail here.
  if [ -f "node_modules/astro/dist/cli/index.js" ] && [ ! -f "node_modules/astro/dist/cli/throw-and-exit.js" ]; then
    echo "ERROR: astro CLI tree is incomplete (throw-and-exit.js missing)"
    missing=1
  fi
  return "${missing}"
}

install_deps() {
  echo "==> Clean install (wipe node_modules to avoid partial trees from concurrent deploys)"
  rm -rf node_modules
  # Install with default env so npm ci does not skip needed transitive deps.
  unset NODE_ENV || true
  if ! npm ci --no-audit --no-fund; then
    echo "==> npm ci failed — falling back to npm install"
    rm -rf node_modules
    npm install --no-audit --no-fund
  fi
  if ! verify_node_modules; then
    echo "==> node_modules verification failed — retrying once with npm install"
    rm -rf node_modules
    unset NODE_ENV || true
    npm install --no-audit --no-fund
    verify_node_modules
  fi
}

echo "==> Building frontend on host (${FRONTEND_DIR})"
ensure_node

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
echo "==> Waiting for frontend build lock (${LOCK_FILE})"
if ! flock -w 900 9; then
  echo "ERROR: timed out waiting for frontend build lock"
  exit 1
fi

cd "${FRONTEND_DIR}"

echo "==> Disk free before npm install"
df -h . || true

install_deps

export NODE_ENV=production
# Tests run in GitHub Actions; EC2 deploy only builds static assets.
npm run build

if [ ! -f dist/index.html ]; then
  echo "ERROR: frontend/dist/index.html missing after build"
  exit 1
fi

echo "==> Frontend ready at ${FRONTEND_DIR}/dist"
