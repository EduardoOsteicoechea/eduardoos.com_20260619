#!/usr/bin/env bash
# deploy-remote-production.sh — cut over production HTTPS (:443) + API (:3000) to Eduardo OS Next.
#
# Called from parent deploy/ec2/deploy-remote.sh after repo sync + .env are in place.
# Does NOT stop staging (eduardoos-next.service on :3001 / nginx :8080).
#
# Rollback (one cycle):
#   1) Point docker nginx html volume back to ./frontend/dist (compose files + recreate nginx)
#   2) sudo systemctl stop eduardoos
#   3) Restore ExecStart to @APP_DIR@/bin/eduardoos.prev (or copy .prev → bin/eduardoos and
#      reinstall deploy/ec2/eduardoos.service.template) then sudo systemctl start eduardoos
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
NEXT_DIR="${NEXT_DIR:-$APP_DIR/eduardoos-next}"
DEPLOY_USER="$(whoami)"
BACKEND_ADDR="${BACKEND_ADDR:-:3000}"

echo "==> Eduardo OS Next PRODUCTION cutover"
echo "    APP_DIR=$APP_DIR"
echo "    NEXT_DIR=$NEXT_DIR"
echo "    API ${BACKEND_ADDR} via eduardoos.service (rollback: bin/eduardoos.prev)"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "ERROR: APP_DIR is not a git clone: ${APP_DIR}"
  exit 1
fi

# Production uses APP_DIR/.env only (ADDR=:3000). Staging keeps NEXT_DIR/.env (ADDR=:3001).
# Do NOT copy production env into NEXT_DIR/.env — that made staging bind :3000 and crash.
if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "ERROR: ${APP_DIR}/.env not found. CI must upload it before deploy."
  exit 1
fi

ensure_go() {
  if command -v go >/dev/null 2>&1; then
    echo "==> Go $(go version) OK"
    return 0
  fi
  echo "==> Installing Go toolchain"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y golang || true
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y golang || true
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y golang-go || true
  fi
  if ! command -v go >/dev/null 2>&1; then
    echo "ERROR: Go is required to build eduardoos-next backend"
    exit 1
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge 20 ]] 2>/dev/null; then
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
    echo "ERROR: install Node.js 20+ manually, then re-run."
    exit 1
  fi
}

ensure_go
ensure_node

mkdir -p "${APP_DIR}/bin" "${APP_DIR}/.cache/go-tmp" "${APP_DIR}/.cache/go-build" "${APP_DIR}/.cache/go-mod" "${APP_DIR}/.cache/tmp"
export TMPDIR="${APP_DIR}/.cache/tmp"
export GOTMPDIR="${APP_DIR}/.cache/go-tmp"
export GOCACHE="${APP_DIR}/.cache/go-build"
export GOMODCACHE="${APP_DIR}/.cache/go-mod"
rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true
sudo rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true

echo "==> Stopping production eduardoos.service (staging :3001 left alone)"
sudo systemctl stop eduardoos.service 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
fi

# Preserve previous monolith binary for one-cycle rollback.
if [[ -f "${APP_DIR}/bin/eduardoos" ]]; then
  echo "==> Backing up ${APP_DIR}/bin/eduardoos -> bin/eduardoos.prev"
  cp -f "${APP_DIR}/bin/eduardoos" "${APP_DIR}/bin/eduardoos.prev"
fi

echo "==> Building Next production backend (CGO_ENABLED=0)"
mkdir -p "${NEXT_DIR}/backend/bin"
(
  cd "${NEXT_DIR}/backend"
  CGO_ENABLED=0 go build -o bin/eduardoos-next ./cmd/server
)
# Also keep a copy under APP_DIR/bin for ops discoverability (service ExecStart uses NEXT_DIR path).
cp -f "${NEXT_DIR}/backend/bin/eduardoos-next" "${APP_DIR}/bin/eduardoos-next"

echo "==> Installing eduardoos.service -> Next binary on ${BACKEND_ADDR}"
SERVICE_FILE="/etc/systemd/system/eduardoos.service"
sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Eduardo OS Next backend (production ${BACKEND_ADDR})
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${NEXT_DIR}
# APP_DIR/.env only — never share with staging NEXT_DIR/.env (ADDR collision).
EnvironmentFile=-${APP_DIR}/.env
# PORT wins over ADDR in eduardoos-next main (belt-and-suspenders vs leaked ADDR).
Environment=PORT=3000
Environment=ADDR=${BACKEND_ADDR}
ExecStart=${NEXT_DIR}/backend/bin/eduardoos-next
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eduardoos.service
sudo systemctl restart eduardoos.service

echo "==> Waiting for Next /health on ${BACKEND_ADDR}"
ready=0
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  echo "ERROR: eduardoos-next /health not ready on :3000"
  sudo journalctl -u eduardoos -n 80 --no-pager || true
  exit 1
fi
echo "==> Next production backend healthy on :3000"

echo "==> Building Next frontend (production nginx html root)"
chmod +x "${NEXT_DIR}/deploy/build-frontend.sh"
bash "${NEXT_DIR}/deploy/build-frontend.sh"

# Keep old frontend/dist on disk for rollback (do not delete).
if [[ -d "${APP_DIR}/frontend/dist" ]]; then
  echo "==> Old frontend/dist retained for rollback (nginx volume switch)"
fi

echo "==> Production Next assets ready"
echo "    Backend: ${NEXT_DIR}/backend/bin/eduardoos-next (:3000)"
echo "    Frontend: ${NEXT_DIR}/frontend/dist"
echo "    Rollback binary: ${APP_DIR}/bin/eduardoos.prev (if present)"
