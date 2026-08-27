#!/usr/bin/env bash
# Runs on the EC2 host during CI/CD deploy (or manually over SSH).
# Production HTTPS serves frontend/dist + backend on :3000 (systemd eduardoos.service).
#
# Selective scopes (CI detects from git diff; defaults = full deploy):
#   DEPLOY_BACKEND=1|0
#   DEPLOY_FRONTEND=1|0
#   DEPLOY_NGINX=1|0     — render nginx conf, compose up, certbot
#   DEPLOY_DISK_CLEAN=1|0 — docker system prune (slow; default 1 only on full/nginx)
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
REPO_URL="${REPO_URL:-https://github.com/EduardoOsteicoechea/eduardoos.com_20260619.git}"
BRANCH="${BRANCH:-master}"
DEPLOY_BACKEND="${DEPLOY_BACKEND:-1}"
DEPLOY_FRONTEND="${DEPLOY_FRONTEND:-1}"
DEPLOY_NGINX="${DEPLOY_NGINX:-1}"
# Heavy prune only when building backend or touching nginx by default.
if [[ -z "${DEPLOY_DISK_CLEAN:-}" ]]; then
  if [[ "${DEPLOY_BACKEND}" == "1" || "${DEPLOY_NGINX}" == "1" ]]; then
    DEPLOY_DISK_CLEAN=1
  else
    DEPLOY_DISK_CLEAN=0
  fi
fi

echo "==> Deploying Eduardo OS to ${APP_DIR} (${BRANCH})"
echo "    scopes: backend=${DEPLOY_BACKEND} frontend=${DEPLOY_FRONTEND} nginx=${DEPLOY_NGINX} disk_clean=${DEPLOY_DISK_CLEAN}"

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
sync_ok=0
for attempt in 1 2 3 4 5; do
  if git fetch origin "${BRANCH}" && git reset --hard "origin/${BRANCH}"; then
    sync_ok=1
    break
  fi
  echo "WARNING: git sync attempt ${attempt} failed (likely concurrent deploy); retrying..."
  sleep $((attempt * 2))
done
if [ "${sync_ok}" -ne 1 ]; then
  echo "ERROR: could not sync ${BRANCH} after retries"
  exit 1
fi

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

export COMPOSE_PARALLEL_LIMIT=1
export DOCKER_BUILDKIT=1

if [[ "${DEPLOY_DISK_CLEAN}" == "1" ]]; then
  reclaim_ec2_disk
else
  echo "==> Skipping docker disk prune (DEPLOY_DISK_CLEAN=0)"
fi

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

chmod +x deploy/ec2/deploy-remote-production.sh deploy/ec2/build-frontend.sh deploy/ec2/publish-frontend-dist.sh
APP_DIR="${APP_DIR}" \
  DEPLOY_BACKEND="${DEPLOY_BACKEND}" \
  DEPLOY_FRONTEND="${DEPLOY_FRONTEND}" \
  bash deploy/ec2/deploy-remote-production.sh

# DynamoDB / S3 markers — only on backend deploys (schema-related).
if [[ "${DEPLOY_BACKEND}" == "1" ]]; then
  echo "==> Ensuring DynamoDB observability tables exist"
  bash deploy/aws/create-observability-tables.sh || echo "WARNING: could not create observability tables (check IAM)"

  echo "==> Ensuring DynamoDB static pamphlet footers table exists"
  bash deploy/aws/create-pamphlet-footers-table.sh || echo "WARNING: could not create eduardoos_static_pamphlet_footers (check IAM)"

  echo "==> Ensuring DynamoDB edebats table exists"
  bash deploy/aws/create-edebats-table.sh || echo "WARNING: could not create eduardoos_edebats (check IAM)"

  echo "==> Ensuring DynamoDB ifcbim table and S3 ifcbim/ prefix exist"
  bash deploy/aws/create-ifcbim-table.sh || echo "WARNING: could not create eduardoos_ifcbim (check IAM)"
  bash deploy/aws/create-ifcbim-prefix.sh || echo "WARNING: could not create s3 ifcbim/ prefix (check IAM)"
else
  echo "==> Skipping DynamoDB/S3 bootstrap (DEPLOY_BACKEND=0)"
fi

if [[ "${DEPLOY_NGINX}" == "1" ]]; then
  echo "==> Rendering nginx config for DOMAIN=${DOMAIN}"
  sed "s/localhost/${DOMAIN}/g" nginx/default.conf > nginx/default.prod.conf
  ensure_cert_bootstrap

  if [[ "${DEPLOY_DISK_CLEAN}" == "1" ]]; then
    docker builder prune -af || true
  fi

  "${COMPOSE[@]}" up -d
  issue_letsencrypt_cert || true
else
  echo "==> Skipping nginx re-render / compose recreate (DEPLOY_NGINX=0)"
  # Frontend-only: reload nginx so it picks up new files on the mounted dist volume.
  if [[ "${DEPLOY_FRONTEND}" == "1" ]]; then
    echo "==> Reloading nginx to pick up updated frontend dist"
    "${COMPOSE[@]}" exec nginx nginx -s reload 2>/dev/null \
      || "${COMPOSE[@]}" restart nginx 2>/dev/null \
      || echo "WARNING: could not reload nginx"
  fi
fi

echo "==> Deploy complete"
"${COMPOSE[@]}" ps || true
