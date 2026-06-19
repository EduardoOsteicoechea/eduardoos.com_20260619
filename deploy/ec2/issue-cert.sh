#!/usr/bin/env bash
# Obtain or renew a Let's Encrypt certificate for the DOMAIN in .env.
# Run on EC2 after DNS A record points to the instance.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eduardoos.com_20260619}"
cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in ${APP_DIR}"
  exit 1
fi

DOMAIN=$(grep -E '^DOMAIN=' .env | head -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//; s/["'\'']$//')
CERTBOT_EMAIL=$(grep -E '^CERTBOT_EMAIL=' .env | head -n1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//; s/["'\'']$//')

if [ -z "${DOMAIN}" ] || [ "${DOMAIN}" = "localhost" ]; then
  echo "ERROR: DOMAIN must be your production hostname in .env"
  exit 1
fi

if [ -z "${CERTBOT_EMAIL}" ]; then
  echo "ERROR: CERTBOT_EMAIL must be set in .env"
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ec2.yml)
CERT_DIR="nginx/certs/live/${DOMAIN}"

echo "==> Rendering nginx config for DOMAIN=${DOMAIN}"
sed "s/localhost/${DOMAIN}/g" nginx/default.conf > nginx/default.prod.conf

if [ -f "${CERT_DIR}/fullchain.pem" ] && \
   openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt"; then
  echo "==> Let's Encrypt certificate already present; running renew"
  "${COMPOSE[@]}" run --rm --entrypoint certbot certbot renew --webroot -w /var/www/certbot
  "${COMPOSE[@]}" exec nginx nginx -s reload 2>/dev/null || "${COMPOSE[@]}" restart nginx
  exit 0
fi

echo "==> Removing bootstrap self-signed cert (if any)"
rm -rf "${CERT_DIR}" "nginx/certs/archive/${DOMAIN}" "nginx/certs/renewal/${DOMAIN}.conf" 2>/dev/null || true

echo "==> Requesting certificate for ${DOMAIN}"
"${COMPOSE[@]}" run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  -d "${DOMAIN}" \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos --non-interactive --no-eff-email

"${COMPOSE[@]}" exec nginx nginx -s reload 2>/dev/null || "${COMPOSE[@]}" restart nginx
echo "==> Certificate installed for https://${DOMAIN}/"
