#!/usr/bin/env bash
# Fast EC2 path: pull latest code, rebuild Astro static assets only, reload nginx.
# Skips Go/backend rebuild and Docker image rebuilds.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
REPO_URL="${REPO_URL:-https://github.com/EduardoOsteicoechea/eduardoos.com_20260619.git}"
BRANCH="${BRANCH:-master}"

echo "==> Frontend-only deploy to ${APP_DIR} (${BRANCH})"

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "ERROR: ${APP_DIR} is not a git checkout. Run the full deploy once first."
  exit 1
fi

cd "${APP_DIR}"

echo "==> Pulling latest ${BRANCH}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

chmod +x deploy/ec2/build-frontend.sh
APP_DIR="${APP_DIR}" bash deploy/ec2/build-frontend.sh

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ec2.yml)

echo "==> Reloading nginx to pick up new frontend/dist"
if "${COMPOSE[@]}" exec -T nginx nginx -s reload 2>/dev/null; then
  echo "==> nginx reloaded"
else
  echo "==> nginx reload failed — restarting nginx container"
  "${COMPOSE[@]}" up -d nginx
fi

echo "==> Frontend-only deploy complete"
