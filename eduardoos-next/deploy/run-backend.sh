#!/usr/bin/env bash
# run-backend.sh — run the Eduardo OS Next Go API as a secondary process.
# Default listen :3001 (or PORT / ADDR from env / .env). Does NOT replace prod :3000.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading env from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "$BACKEND/.env" ]]; then
  echo "==> Loading env from $BACKEND/.env"
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND/.env"
  set +a
fi

export ADDR="${ADDR:-:3001}"
if [[ -n "${PORT:-}" ]]; then
  if [[ "$PORT" == :* ]]; then
    export ADDR="$PORT"
  else
    export ADDR=":$PORT"
  fi
fi

BINARY="${BACKEND_BINARY:-$BACKEND/bin/eduardoos-next}"
if [[ ! -x "$BINARY" ]]; then
  echo "==> Building backend binary → $BINARY"
  mkdir -p "$(dirname "$BINARY")"
  (cd "$BACKEND" && go build -o "$BINARY" ./cmd/server)
fi

echo "==> Starting Eduardo OS Next backend on $ADDR (staging/secondary only)"
exec "$BINARY"