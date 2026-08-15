#!/usr/bin/env bash
# smoke.sh — staging smoke checks for Eduardo OS Next.
# Requires BASE_URL (e.g. https://staging.eduardoos.com or http://127.0.0.1:3001).
set -euo pipefail

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is not set. Example:"
  echo "  BASE_URL=http://127.0.0.1:3001 ./smoke.sh"
  echo "  BASE_URL=https://staging.eduardoos.com ./smoke.sh"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
fail=0

echo "==> GET $BASE_URL/health"
if curl -fsS -o /tmp/eos-next-health.json -w "HTTP %{http_code}\n" "$BASE_URL/health"; then
  cat /tmp/eos-next-health.json
  echo
else
  echo "FAIL: /health"
  fail=1
fi

# Home is optional when BASE_URL points only at the API port.
if [[ "${SMOKE_HOME:-1}" == "1" ]]; then
  echo "==> GET $BASE_URL/ (home)"
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/" || true)"
  echo "HTTP $code"
  if [[ "$code" != "200" && "$code" != "301" && "$code" != "302" ]]; then
    echo "WARN: home returned $code (ok if BASE_URL is API-only; set SMOKE_HOME=0)"
    # Do not fail hard for API-only smoke; health is required.
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "Smoke FAILED"
  exit 1
fi
echo "Smoke OK"