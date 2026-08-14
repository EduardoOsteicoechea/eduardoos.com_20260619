#!/usr/bin/env bash
# Runs on the EC2 host during CI/CD deploy (or manually over SSH).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
REPO_URL="${REPO_URL:-https://github.com/EduardoOsteicoechea/eduardoos.com_20260619.git}"
BRANCH="${BRANCH:-master}"

echo "==> Deploying Eduardo OS to ${APP_DIR} (${BRANCH}) [host frontend + monolith + nginx/certbot]"

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "==> Cloning repository"
  ENV_BACKUP=""
  if [ -f "${APP_DIR}/.env" ]; then
    ENV_BACKUP="$(mktemp)"
    cp "${APP_DIR}/.env" "${ENV_BACKUP}"
  fi
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  if [ -n "${ENV_BACKUP}" ] && [ -f "${ENV_BACKUP}" ]; then
    cp "${ENV_BACKUP}" "${APP_DIR}/.env"
    rm -f "${ENV_BACKUP}"
  fi
fi

cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in ${APP_DIR}. CI must upload it before deploy."
  exit 1
fi

DOMAIN=$(grep -E '^DOMAIN=' .env | head -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//; s/["'\'']$//')
CERTBOT_EMAIL=$(grep -E '^CERTBOT_EMAIL=' .env | head -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//; s/["'\'']$//')
if [ -z "${DOMAIN}" ]; then
  echo "ERROR: DOMAIN is not set in .env"
  exit 1
fi

if echo "${DOMAIN}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ERROR: DOMAIN must be your hostname (e.g. eduardoos.com), not an IP address."
  echo "       Set GitHub secret DOMAIN=eduardoos.com — EC2_HOST stays the IP for SSH."
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ec2.yml)

echo "==> Pulling latest ${BRANCH}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> Rendering nginx config for DOMAIN=${DOMAIN}"
sed "s/localhost/${DOMAIN}/g" nginx/default.conf > nginx/default.prod.conf

CERT_DIR="nginx/certs/live/${DOMAIN}"

has_letsencrypt_cert() {
  [ -f "${CERT_DIR}/fullchain.pem" ] && \
    openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"
}

ensure_cert_bootstrap() {
  if has_letsencrypt_cert; then
    echo "==> Let's Encrypt certificate already on disk for ${DOMAIN}"
    return 0
  fi
  if [ -f "${CERT_DIR}/fullchain.pem" ]; then
    echo "==> TLS certificate files already present for ${DOMAIN}"
    return 0
  fi
  echo "==> No TLS cert for ${DOMAIN}; creating temporary self-signed cert"
  mkdir -p "${CERT_DIR}" 2>/dev/null || sudo mkdir -p "${CERT_DIR}"
  if [ ! -w "${CERT_DIR}" ]; then
    sudo chown -R "$(whoami):$(whoami)" nginx/certs 2>/dev/null || true
  fi
  if openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
      -keyout "${CERT_DIR}/privkey.pem" \
      -out "${CERT_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}" 2>/dev/null; then
    echo "    Temporary self-signed cert created"
  else
    echo "WARNING: Could not write bootstrap cert (certbot may own nginx/certs) — continuing deploy"
  fi
}

ensure_cert_bootstrap

reclaim_ec2_disk() {
  echo "==> Disk usage before cleanup"
  df -h / /var/lib/docker 2>/dev/null || df -h /

  echo "==> Pruning unused Docker images, containers, and build cache"
  docker system prune -af || true
  docker builder prune -af || true

  echo "==> Disk usage after cleanup"
  df -h / /var/lib/docker 2>/dev/null || df -h /
}

issue_letsencrypt_cert() {
  if has_letsencrypt_cert; then
    echo "==> Let's Encrypt certificate already installed for ${DOMAIN}"
    return 0
  fi

  if [ -z "${CERTBOT_EMAIL}" ]; then
    echo "WARNING: CERTBOT_EMAIL not set — using self-signed cert (browsers will warn)"
    return 1
  fi

  if [ "${DOMAIN}" = "localhost" ]; then
    echo "==> DOMAIN=localhost — skipping Let's Encrypt"
    return 1
  fi

  echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"
  rm -rf "${CERT_DIR}" "nginx/certs/archive/${DOMAIN}" "nginx/certs/renewal/${DOMAIN}.conf" 2>/dev/null || true

  if "${COMPOSE[@]}" run --rm --entrypoint certbot certbot \
      certonly --webroot -w /var/www/certbot \
      -d "${DOMAIN}" \
      --email "${CERTBOT_EMAIL}" \
      --agree-tos --non-interactive --no-eff-email; then
    "${COMPOSE[@]}" exec nginx nginx -s reload 2>/dev/null || "${COMPOSE[@]}" restart nginx
    echo "==> Let's Encrypt certificate installed"
    return 0
  fi

  echo "WARNING: certbot failed — restoring self-signed bootstrap cert"
  if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
    mkdir -p "${CERT_DIR}" 2>/dev/null || sudo mkdir -p "${CERT_DIR}"
    sudo chown -R "$(whoami):$(whoami)" nginx/certs 2>/dev/null || true
    openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
      -keyout "${CERT_DIR}/privkey.pem" \
      -out "${CERT_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}" 2>/dev/null || echo "WARNING: could not restore bootstrap cert"
    "${COMPOSE[@]}" restart nginx
  fi
  return 1
}

echo "==> Building host assets (backend first, then frontend)"
export COMPOSE_PARALLEL_LIMIT=1
export DOCKER_BUILDKIT=1

reclaim_ec2_disk

install_host_backend() {
  echo "==> Installing / restarting Eduardo OS monolith on the host"
  if ! command -v go >/dev/null 2>&1; then
    echo "==> Installing Go toolchain"
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y golang || true
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y golang || true
    elif command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y golang-go || true
    fi
  fi
  if ! command -v go >/dev/null 2>&1; then
    echo "ERROR: Go is required on the EC2 host for cmd/eduardoos (monolith backend)."
    exit 1
  fi

  echo "==> Building host binary (go build ./cmd/eduardoos)"
  mkdir -p "${APP_DIR}/bin" "${APP_DIR}/.cache/go-tmp" "${APP_DIR}/.cache/go-build"
  # Stop first so Windows/Linux file locks and old go-run children release :3000.
  sudo systemctl stop eduardoos.service 2>/dev/null || true
  # Free :3000 if a stale go-run / orphan process still holds it.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 3000/tcp 2>/dev/null || true
  fi
  # EC2 /tmp is often a small tmpfs — keep Go work files on the root disk.
  export TMPDIR="${APP_DIR}/.cache/tmp"
  export GOTMPDIR="${APP_DIR}/.cache/go-tmp"
  export GOCACHE="${APP_DIR}/.cache/go-build"
  export GOMODCACHE="${APP_DIR}/.cache/go-mod"
  mkdir -p "${TMPDIR}" "${GOTMPDIR}" "${GOCACHE}" "${GOMODCACHE}"
  # Clear stale go-codehost / compile debris that fills the tiny /tmp tmpfs.
  rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true
  sudo rm -rf /tmp/go-build* /tmp/go-codehost* /tmp/go-link-* 2>/dev/null || true
  # Drop stale microservices containers that still hold disk + confuse ops.
  docker rm -f \
    eduardooscom_20260619-backend-1 \
    eduardooscom_20260619-frontend-1 \
    eduardooscom_20260619-payments-1 \
    eduardooscom_20260619-tester-1 \
    eduardooscom_20260619-authenticator-1 \
    eduardooscom_20260619-documents-1 \
    eduardooscom_20260619-chatbot-1 \
    eduardooscom_20260619-s3-1 \
    eduardooscom_20260619-telemetry-1 \
    eduardooscom_20260619-database-1 \
    2>/dev/null || true
  df -h / /tmp "${APP_DIR}" 2>/dev/null || df -h /
  (cd "${APP_DIR}" && CGO_ENABLED=0 go build -o bin/eduardoos ./cmd/eduardoos)

  DEPLOY_USER="$(whoami)"
  SERVICE_FILE="/etc/systemd/system/eduardoos.service"
  sed \
    -e "s|@APP_DIR@|${APP_DIR}|g" \
    -e "s|@DEPLOY_USER@|${DEPLOY_USER}|g" \
    deploy/ec2/eduardoos.service.template | sudo tee "${SERVICE_FILE}" >/dev/null

  sudo systemctl daemon-reload
  sudo systemctl enable eduardoos.service
  sudo systemctl restart eduardoos.service

  echo "==> Waiting for monolith /health on :3000"
  ready=0
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 2
  done
  if [ "${ready}" -ne 1 ]; then
    echo "ERROR: monolith /health not ready after build+restart"
    sudo journalctl -u eduardoos -n 80 --no-pager || true
    exit 1
  fi
  echo "==> Monolith backend healthy on :3000"
}

# Backend first so API fixes (e.g. .epam uploads) ship even if Astro build fails.
install_host_backend

build_host_frontend() {
  chmod +x deploy/ec2/build-frontend.sh
  APP_DIR="${APP_DIR}" bash deploy/ec2/build-frontend.sh
}

build_host_frontend
docker builder prune -af || true

"${COMPOSE[@]}" up -d

issue_letsencrypt_cert || true

echo "==> Ensuring DynamoDB observability tables exist"
bash deploy/aws/create-observability-tables.sh || echo "WARNING: could not create observability tables (check IAM)"

echo "==> Ensuring DynamoDB edebats table exists"
bash deploy/aws/create-edebats-table.sh || echo "WARNING: could not create eduardoos_edebats (check IAM)"

echo "==> Deploy complete"
"${COMPOSE[@]}" ps
