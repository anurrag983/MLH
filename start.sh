#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_NODE="$ROOT/work/node-v26.13.0-darwin-arm64/bin"
if [[ -x "$LOCAL_NODE/node" ]]; then PATH="$LOCAL_NODE:$PATH"; export PATH; fi
PYTHON="$ROOT/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then PYTHON="python3"; fi
API_PORT="${FREEBUF_API_PORT:-8001}"
UI_PORT="${FREEBUF_UI_PORT:-5174}"
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Frontend packages are missing. Run: cd frontend && npm install" >&2
  exit 1
fi

api_is_freebuf() {
  local response
  response="$(curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$API_PORT/api/auth/status" 2>/dev/null)" || return 1
  [[ "$response" == *'"registered":'* && "$response" == *'"authenticated":'* ]]
}

ui_is_freebuf() {
  curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:$UI_PORT/" 2>/dev/null | grep -q 'FreeBuff · Project Assistant'
}

# Re-running the launcher should reuse a healthy instance instead of failing
# with EADDRINUSE while leaving the user unsure whether FreeBuff is running.
if api_is_freebuf && ui_is_freebuf; then
  echo "FreeBuff is already running."
  echo "Open: http://127.0.0.1:$UI_PORT/"
  echo "Backend API docs: http://127.0.0.1:$API_PORT/docs"
  exit 0
fi

if ! api_is_freebuf && lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $API_PORT is already used by another service; FreeBuff's API did not answer there." >&2
  echo "Close that service, then run ./start.sh again." >&2
  exit 1
fi
if ! ui_is_freebuf && lsof -nP -iTCP:"$UI_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $UI_PORT is already used by another service; FreeBuff's page did not answer there." >&2
  echo "Close that service, then run ./start.sh again." >&2
  exit 1
fi

echo "FreeBuff page: http://127.0.0.1:$UI_PORT/"
echo "FreeBuff API:  http://127.0.0.1:$API_PORT/docs"

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${UI_PID:-}" ]] && kill "$UI_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
if ! api_is_freebuf; then
  cd "$ROOT"
  "$PYTHON" -m uvicorn backend.main:app --host 127.0.0.1 --port "$API_PORT" & API_PID=$!
fi
if ! ui_is_freebuf; then
  cd "$ROOT/frontend"
  VITE_API_PORT="$API_PORT" npm run dev -- --host 127.0.0.1 --port "$UI_PORT" --strictPort & UI_PID=$!
fi

if [[ -n "${API_PID:-}" && -n "${UI_PID:-}" ]]; then
  while kill -0 "$API_PID" 2>/dev/null && kill -0 "$UI_PID" 2>/dev/null; do sleep 1; done
  if ! kill -0 "$API_PID" 2>/dev/null; then wait "$API_PID"; else wait "$UI_PID"; fi
elif [[ -n "${API_PID:-}" ]]; then
  wait "$API_PID"
elif [[ -n "${UI_PID:-}" ]]; then
  wait "$UI_PID"
fi
