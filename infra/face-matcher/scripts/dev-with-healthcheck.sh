#!/bin/bash

set -euo pipefail

PORT="${FACE_MATCHER_PORT:-8788}"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
STARTUP_TIMEOUT_SECONDS=30

bunx wrangler dev --env-file ../../.env --ip 0.0.0.0 --port "${PORT}" --inspector-port 9230 &
WRANGLER_PID=$!

cleanup() {
  if kill -0 "${WRANGLER_PID}" 2>/dev/null; then
    kill "${WRANGLER_PID}" 2>/dev/null || true
    wait "${WRANGLER_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

START_TIME=$(date +%s)

while true; do
  if ! kill -0 "${WRANGLER_PID}" 2>/dev/null; then
    wait "${WRANGLER_PID}" || true
    echo "Face matcher failed before becoming healthy." >&2
    exit 1
  fi

  if HEALTH_RESPONSE=$(curl -fsS "${HEALTH_URL}" 2>/dev/null); then
    if python3 -c 'import json,sys; payload=json.loads(sys.stdin.read()); raise SystemExit(0 if payload.get("data", {}).get("ready") is True else 1)' <<<"${HEALTH_RESPONSE}"; then
      break
    fi
  fi

  CURRENT_TIME=$(date +%s)
  if [ $((CURRENT_TIME - START_TIME)) -ge "${STARTUP_TIMEOUT_SECONDS}" ]; then
    echo "Face matcher did not become healthy within ${STARTUP_TIMEOUT_SECONDS} seconds." >&2
    exit 1
  fi

  sleep 1
done

wait "${WRANGLER_PID}"
