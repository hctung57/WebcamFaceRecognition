#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${WORKERS:-1}"

if [[ -n "${SSL_CERT_FILE:-}" && -n "${SSL_KEY_FILE:-}" ]]; then
	exec uvicorn app.main:app --host "$HOST" --port "$PORT" --workers "$WORKERS" \
		--ssl-certfile "$SSL_CERT_FILE" --ssl-keyfile "$SSL_KEY_FILE"
fi

exec uvicorn app.main:app --host "$HOST" --port "$PORT" --workers "$WORKERS"
