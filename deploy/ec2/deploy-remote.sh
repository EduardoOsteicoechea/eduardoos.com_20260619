#!/usr/bin/env bash
# Runs on the EC2 host during CI/CD deploy (or manually over SSH).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
REPO_URL="${REPO_URL:-https://github.com/EduardoOsteicoechea/eduardoos.com_20260619.git}"
BRANCH="${BRANCH:-master}"

echo "==> Deploying Eduardo OS to ${APP_DIR} (${BRANCH})"

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
if [ -z "${DOMAIN}" ]; then
  echo "ERROR: DOMAIN is not set in .env"
  exit 1
fi

echo "==> Pulling latest ${BRANCH}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> Rendering nginx config for DOMAIN=${DOMAIN}"
sed "s/localhost/${DOMAIN}/g" nginx/default.conf > nginx/default.prod.conf

CERT_DIR="nginx/certs/live/${DOMAIN}"
if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
  echo "==> No TLS cert for ${DOMAIN}; creating temporary self-signed cert"
  mkdir -p "${CERT_DIR}"
  openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
  echo "    Run certbot on the host after DNS points here for a real certificate."
fi

echo "==> Building and starting stack (arm64 + AWS backends)"
docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build

echo "==> Deploy complete"
docker compose -f docker-compose.yml -f docker-compose.ec2.yml ps
