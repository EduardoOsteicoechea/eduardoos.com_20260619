#!/usr/bin/env bash
# deploy-remote-staging.sh - deploy Eduardo OS Next as a secondary stack on EC2.
# Does NOT touch production :3000 / HTTPS nginx default.conf.
#
# Expected layout:
#   APP_DIR  = monorepo clone (e.g. ~/eduardoos.com_20260619)
#   NEXT_DIR = $APP_DIR/eduardoos-next
#   .env     already at NEXT_DIR/.env (uploaded by CI)
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
NEXT_DIR="${NEXT_DIR:-$APP_DIR/eduardoos-next}"
BRANCH="${BRANCH:-master}"
DEPLOY_USER="$(whoami)"
STAGING_PORT="${STAGING_PORT:-8080}"
BACKEND_ADDR="${BACKEND_ADDR:-:3001}"

echo "==> Eduardo OS Next STAGING deploy"
echo "    APP_DIR=$APP_DIR"
echo "    NEXT_DIR=$NEXT_DIR"
echo "    BRANCH=$BRANCH"
echo "    nginx listen :${STAGING_PORT} -> static + API ${BACKEND_ADDR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "ERROR: APP_DIR is not a git clone: ${APP_DIR}"
  exit 1
fi

if [[ ! -f "${NEXT_DIR}/.env" ]]; then
  echo "ERROR: ${NEXT_DIR}/.env missing. CI must scp it before this script runs."
  exit 1
fi

cd "${APP_DIR}"
echo "==> Syncing ${BRANCH}"
sync_ok=0
for attempt in 1 2 3 4 5; do
  if git fetch origin "${BRANCH}" && git reset --hard "origin/${BRANCH}"; then
    sync_ok=1
    break
  fi
  echo "WARNING: git sync attempt ${attempt} failed (likely concurrent deploy); retrying..."
  sleep $((attempt * 2))
done
if [[ "${sync_ok}" -ne 1 ]]; then
  echo "ERROR: could not sync ${BRANCH} after retries"
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

echo "==> Building Next backend (CGO_ENABLED=0)"
mkdir -p "${APP_DIR}/.cache/go-tmp" "${APP_DIR}/.cache/go-build" "${APP_DIR}/.cache/go-mod" "${APP_DIR}/.cache/tmp"
export TMPDIR="${APP_DIR}/.cache/tmp"
export GOTMPDIR="${APP_DIR}/.cache/go-tmp"
export GOCACHE="${APP_DIR}/.cache/go-build"
export GOMODCACHE="${APP_DIR}/.cache/go-mod"
rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true
sudo rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true

sudo systemctl stop eduardoos-next.service 2>/dev/null || true
mkdir -p "${NEXT_DIR}/backend/bin"
(
  cd "${NEXT_DIR}/backend"
  CGO_ENABLED=0 go build -o bin/eduardoos-next ./cmd/server
)

chmod +x "${NEXT_DIR}/deploy/build-frontend.sh"
bash "${NEXT_DIR}/deploy/build-frontend.sh"

echo "==> Installing systemd unit eduardoos-next.service (staging :3001 only)"
# Write unit explicitly so PORT=3001 always wins over any leaked ADDR in .env
# (systemd EnvironmentFile overrides Environment= for the same key; main prefers PORT).
SERVICE_FILE="/etc/systemd/system/eduardoos-next.service"
sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Eduardo OS Next backend (staging secondary)
After=network.target

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${NEXT_DIR}
EnvironmentFile=-${NEXT_DIR}/.env
Environment=PORT=3001
Environment=ADDR=${BACKEND_ADDR}
ExecStart=${NEXT_DIR}/backend/bin/eduardoos-next
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eduardoos-next.service
sudo systemctl restart eduardoos-next.service

echo "==> Waiting for Next /health on ${BACKEND_ADDR}"
ready=0
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:3001/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  echo "ERROR: eduardoos-next /health not ready"
  sudo journalctl -u eduardoos-next -n 80 --no-pager || true
  exit 1
fi
echo "==> Next backend healthy on :3001"

write_staging_nginx_conf() {
  local root_path="$1"
  local api_upstream="$2"
  local out_file="$3"
  cat >"${out_file}" <<EOF
# Eduardo OS Next STAGING - listen ${STAGING_PORT} HTTP only.
# Generated by eduardoos-next/deploy/deploy-remote-staging.sh
# Does not replace production default.conf (80/443).
server {
    listen ${STAGING_PORT};
    server_name _;

    client_max_body_size 128M;

    root ${root_path};
    index index.html;

    location /api/ {
        proxy_pass http://${api_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Correlation-ID \$http_x_correlation_id;
    }

    location /health {
        proxy_pass http://${api_upstream}/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    # Prefer \$uri/index.html over \$uri/ to avoid empty-dir redirect → 500.
    location / {
        try_files \$uri \$uri/index.html /index.html;
    }
}
EOF
}

install_staging_nginx() {
  local conf_name="eduardoos-next-staging.conf"
  local repo_conf="${APP_DIR}/nginx/${conf_name}"
  local host_conf_d="/etc/nginx/conf.d"
  local tmp_conf
  tmp_conf="$(mktemp)"

  write_staging_nginx_conf \
    "/usr/share/nginx/eduardoos-next" \
    "host.docker.internal:3001" \
    "${tmp_conf}"
  mkdir -p "${APP_DIR}/nginx"
  cp "${tmp_conf}" "${repo_conf}"
  echo "==> Wrote Docker-oriented staging conf -> ${repo_conf}"

  if [[ -d "${host_conf_d}" ]] && command -v nginx >/dev/null 2>&1; then
    echo "==> Host nginx detected - installing ${host_conf_d}/${conf_name}"
    write_staging_nginx_conf \
      "${NEXT_DIR}/frontend/dist" \
      "127.0.0.1:3001" \
      "${tmp_conf}"
    sudo cp "${tmp_conf}" "${host_conf_d}/${conf_name}"
    if sudo nginx -t; then
      sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload
      echo "==> Host nginx reloaded (staging :${STAGING_PORT})"
      rm -f "${tmp_conf}"
      return 0
    fi
    echo "WARNING: host nginx -t failed; falling back to Docker path"
  fi

  if [[ -f "${APP_DIR}/docker-compose.yml" ]] && command -v docker >/dev/null 2>&1; then
    echo "==> Reloading Docker nginx with staging conf mount (port ${STAGING_PORT})"
    local compose=(docker compose -f docker-compose.yml)
    if [[ -f "${APP_DIR}/docker-compose.ec2.yml" ]]; then
      compose=(docker compose -f docker-compose.yml -f docker-compose.ec2.yml)
    fi
    cd "${APP_DIR}"
    mkdir -p "${NEXT_DIR}/frontend/dist"
    # Reconcile port/volume mounts without touching unrelated services.
    "${compose[@]}" up -d --no-deps nginx
    if ! "${compose[@]}" port nginx "${STAGING_PORT}" >/dev/null 2>&1; then
      echo "ERROR: nginx container does not publish host port ${STAGING_PORT}"
      "${compose[@]}" ps nginx || true
      exit 1
    fi
    if ! "${compose[@]}" exec -T nginx nginx -t; then
      echo "ERROR: nginx -t failed after mounting staging conf"
      exit 1
    fi
    "${compose[@]}" exec -T nginx nginx -s reload \
      || "${compose[@]}" restart nginx
    echo "==> Docker nginx staging conf active (see ${repo_conf})"
    echo "    Published ${STAGING_PORT}; mounts:"
    echo "      ./nginx/${conf_name} -> /etc/nginx/conf.d/${conf_name}"
    echo "      ./eduardoos-next/frontend/dist -> /usr/share/nginx/eduardoos-next"
    rm -f "${tmp_conf}"
    return 0
  fi

  rm -f "${tmp_conf}"
  echo "WARNING: neither host nginx conf.d nor docker compose available."
  echo "         Staging conf is at ${repo_conf} - mount it manually."
}

install_staging_nginx

echo "==> Verifying staging on localhost:${STAGING_PORT}"
ready_edge=0
for i in $(seq 1 15); do
  if curl -sf --connect-timeout 2 "http://127.0.0.1:${STAGING_PORT}/health" >/dev/null; then
    ready_edge=1
    break
  fi
  sleep 2
done
if [[ "${ready_edge}" -ne 1 ]]; then
  echo "ERROR: http://127.0.0.1:${STAGING_PORT}/health not ready after nginx staging install"
  echo "---- diagnostics ----"
  (command -v ss >/dev/null && sudo ss -tlnp | grep -E ":8080|:3001" || true)
  (cd "${APP_DIR}" && docker compose -f docker-compose.yml -f docker-compose.ec2.yml ps nginx 2>/dev/null || docker compose ps nginx 2>/dev/null || true)
  (cd "${APP_DIR}" && docker compose -f docker-compose.yml -f docker-compose.ec2.yml port nginx 8080 2>/dev/null || true)
  exit 1
fi
echo "==> Staging edge healthy on :${STAGING_PORT}"

echo "==> Staging deploy complete"
echo "    Backend: http://127.0.0.1:3001/health (systemd eduardoos-next)"
echo "    Public:  http://<EC2_IP>:${STAGING_PORT}/  (open SG for ${STAGING_PORT})"