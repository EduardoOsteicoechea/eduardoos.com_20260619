#!/usr/bin/env bash
# deploy-remote-production.sh — production HTTPS (:443) + API (:3000).
#
# Called from deploy/ec2/deploy-remote.sh after repo sync + .env are in place.
#
# Selective rebuild (CI sets these; default = build everything):
#   DEPLOY_BACKEND=1|0   — go build + restart eduardoos.service
#   DEPLOY_FRONTEND=1|0  — publish CI-built dist from /tmp/frontend-dist.tgz
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
DEPLOY_USER="$(whoami)"
BACKEND_ADDR="${BACKEND_ADDR:-:3000}"
DEPLOY_BACKEND="${DEPLOY_BACKEND:-1}"
DEPLOY_FRONTEND="${DEPLOY_FRONTEND:-1}"

echo "==> Eduardo OS PRODUCTION deploy"
echo "    APP_DIR=$APP_DIR"
echo "    API ${BACKEND_ADDR} via eduardoos.service"
echo "    DEPLOY_BACKEND=${DEPLOY_BACKEND} DEPLOY_FRONTEND=${DEPLOY_FRONTEND}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "ERROR: APP_DIR is not a git clone: ${APP_DIR}"
  exit 1
fi

# Production uses APP_DIR/.env only (ADDR=:3000).
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
    echo "ERROR: Go is required to build the backend"
    exit 1
  fi
}

wait_health() {
  echo "==> Waiting for /health on ${BACKEND_ADDR}"
  local ready=0
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "ERROR: /health not ready on :3000"
    sudo journalctl -u eduardoos -n 80 --no-pager || true
    exit 1
  fi
  echo "==> Production backend healthy on :3000"
}

install_and_restart_backend() {
  echo "==> Installing eduardoos.service on ${BACKEND_ADDR}"
  local SERVICE_FILE="/etc/systemd/system/eduardoos.service"
  sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Eduardo OS backend (production ${BACKEND_ADDR})
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${APP_DIR}/.env
# PORT wins over ADDR in server main (belt-and-suspenders vs leaked ADDR).
Environment=PORT=3000
Environment=ADDR=${BACKEND_ADDR}
Environment=EVOICE_PYTHON=${APP_DIR}/backend/internal/evoice/worker/.venv/bin/python
ExecStart=${APP_DIR}/backend/bin/eduardoos-next
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable eduardoos.service
  sudo systemctl restart eduardoos.service
  wait_health
}

ensure_evoice_worker_deps() {
  # Super Premium PDF → page images needs pymupdf (preferred) or pdftoppm.
  local worker_dir="${APP_DIR}/backend/internal/evoice/worker"
  local req="${worker_dir}/requirements.txt"
  local venv="${worker_dir}/.venv"
  echo "==> Ensuring eVoice worker Python deps (pymupdf for PDF→PNG)"
  if [[ ! -f "${req}" ]]; then
    echo "ERROR: missing ${req}"
    exit 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 required for eVoice worker"
    exit 1
  fi
  if [[ ! -x "${venv}/bin/python" ]]; then
    echo "==> Creating ${venv}"
    python3 -m venv "${venv}"
  fi
  "${venv}/bin/pip" install -U pip
  "${venv}/bin/pip" install -r "${req}"
  if ! "${venv}/bin/python" -c "import fitz" >/dev/null 2>&1; then
    echo "ERROR: pymupdf (fitz) failed to import in ${venv}"
    exit 1
  fi
  if ! command -v pdftoppm >/dev/null 2>&1; then
    echo "==> Installing poppler-utils (pdftoppm fallback)"
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y poppler-utils || true
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y poppler-utils || true
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y poppler-utils || true
    fi
  fi
  echo "==> eVoice worker python: ${venv}/bin/python"
}

# --- Backend ---
# Always keep worker venv + systemd EVOICE_PYTHON in sync (Super Premium PDF rasterize).
ensure_evoice_worker_deps

if [[ "${DEPLOY_BACKEND}" == "1" ]]; then
  ensure_go

  mkdir -p "${APP_DIR}/bin" "${APP_DIR}/.cache/go-tmp" "${APP_DIR}/.cache/go-build" "${APP_DIR}/.cache/go-mod" "${APP_DIR}/.cache/tmp"
  export TMPDIR="${APP_DIR}/.cache/tmp"
  export GOTMPDIR="${APP_DIR}/.cache/go-tmp"
  export GOCACHE="${APP_DIR}/.cache/go-build"
  export GOMODCACHE="${APP_DIR}/.cache/go-mod"
  rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true
  sudo rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true

  echo "==> Stopping production eduardoos.service"
  sudo systemctl stop eduardoos.service 2>/dev/null || true
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 3000/tcp 2>/dev/null || true
  fi

  if [[ -f "${APP_DIR}/bin/eduardoos" ]]; then
    echo "==> Backing up ${APP_DIR}/bin/eduardoos -> bin/eduardoos.prev"
    cp -f "${APP_DIR}/bin/eduardoos" "${APP_DIR}/bin/eduardoos.prev"
  fi
  if [[ -f "${APP_DIR}/backend/bin/eduardoos-next" ]]; then
    echo "==> Backing up backend/bin/eduardoos-next -> bin/eduardoos-next.prev"
    cp -f "${APP_DIR}/backend/bin/eduardoos-next" "${APP_DIR}/bin/eduardoos-next.prev"
  fi

  echo "==> Building production backend (CGO_ENABLED=0)"
  mkdir -p "${APP_DIR}/backend/bin"
  (
    cd "${APP_DIR}/backend"
    CGO_ENABLED=0 go build -o bin/eduardoos-next ./cmd/server
  )
  cp -f "${APP_DIR}/backend/bin/eduardoos-next" "${APP_DIR}/bin/eduardoos-next"

  install_and_restart_backend
else
  echo "==> Skipping backend Go build (DEPLOY_BACKEND=0)"
  # Still pick up a freshly uploaded .env + EVOICE_PYTHON without a full rebuild.
  if systemctl is-active --quiet eduardoos.service 2>/dev/null; then
    echo "==> Reloading eduardoos.service to pick up .env / EVOICE_PYTHON"
    install_and_restart_backend
  elif [[ -x "${APP_DIR}/backend/bin/eduardoos-next" ]]; then
    echo "==> eduardoos.service inactive but binary present — installing/starting"
    install_and_restart_backend
  else
    echo "ERROR: DEPLOY_BACKEND=0 but no binary at ${APP_DIR}/backend/bin/eduardoos-next"
    exit 1
  fi
fi

# --- Frontend ---
# Astro build runs on GitHub Actions; EC2 only publishes /tmp/frontend-dist.tgz.
if [[ "${DEPLOY_FRONTEND}" == "1" ]]; then
  echo "==> Publishing frontend dist from CI tarball (no Astro on EC2)"
  chmod +x "${APP_DIR}/deploy/ec2/publish-frontend-dist.sh"
  bash "${APP_DIR}/deploy/ec2/publish-frontend-dist.sh"
else
  echo "==> Skipping frontend publish (DEPLOY_FRONTEND=0)"
  if [[ ! -f "${APP_DIR}/frontend/dist/index.html" ]]; then
    echo "ERROR: DEPLOY_FRONTEND=0 but ${APP_DIR}/frontend/dist/index.html is missing"
    exit 1
  fi
fi

echo "==> Production assets ready"
echo "    Backend: ${APP_DIR}/backend/bin/eduardoos-next (:3000) [DEPLOY_BACKEND=${DEPLOY_BACKEND}]"
echo "    Frontend: ${APP_DIR}/frontend/dist [DEPLOY_FRONTEND=${DEPLOY_FRONTEND}]"
echo "    Rollback binary: ${APP_DIR}/bin/eduardoos-next.prev (if present)"
