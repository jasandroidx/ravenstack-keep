#!/usr/bin/env bash
# Ravenstack Keep on Ravenserve — binds 127.0.0.1 only. Tailnet door is `tailscale serve` (never Funnel).
# Usage: ./start.sh api   (foreground Keep HTTP API, used by systemd ravenstack-keep-api.service)
#        ./start.sh ui    (foreground Nitro UI, used by systemd ravenstack-keep-ui.service)
#        ./start.sh build (npm ci + build:box + mcp venv; does not start anything)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$ROOT/keep.env"; set +a
KEEP_OLLAMA_URL="${KEEP_OLLAMA_URL:-http://100.122.120.83:11434}"
BL="$ROOT/box-local"; mkdir -p "$BL"/{vault,outbox,drops,probes,uploads,logs}
export OBSIDIAN_VAULT="$BL/vault" KEEP_OUTBOX_DIR="$BL/outbox" KEEP_DROPS_DIR="$BL/drops" \
       KEEP_PROBES_DIR="$BL/probes" KEEP_UPLOAD_DIR="$BL/uploads" \
       OLLAMA_URL="$KEEP_OLLAMA_URL" OLLAMA_BASE_URL="$KEEP_OLLAMA_URL" KEEP_OLLAMA_URL \
       KEEP_TALK_MODEL="${KEEP_TALK_MODEL:-qwen3:1.7b}" OLLAMA_MODEL="${KEEP_TALK_MODEL:-qwen3:1.7b}" \
       OLLAMA_TIMEOUT_SEC="${OLLAMA_TIMEOUT_SEC:-60}" KEEP_OLLAMA_NUM_CTX="${KEEP_OLLAMA_NUM_CTX:-8192}" \
       KEEP_HTTP_URL="http://127.0.0.1:${KEEP_HTTP_PORT:-8112}" KEEP_PULSE_URL="http://127.0.0.1:${KEEP_HTTP_PORT:-8112}/api/castle-map"
case "${1:-}" in
  api) cd "$ROOT/mcp"
       KEEP_HTTP_HOST=127.0.0.1 KEEP_HTTP_PORT="${KEEP_HTTP_PORT:-8112}" KEEP_MCP_DATA="$ROOT/mcp/data" \
         exec .venv/bin/python src/http_api.py ;;
  ui)  cd "$ROOT/ui-v2"; [ -f .env ] && { set -a; . ./.env; set +a; }
       HOST=127.0.0.1 PORT="${KEEP_UI_PORT:-8130}" NITRO_HOST=127.0.0.1 NITRO_PORT="${KEEP_UI_PORT:-8130}" \
         exec node .output/server/index.mjs ;;
  build) cd "$ROOT" && npm ci --no-audit --no-fund
       [ -f ui-v2/.env ] || { printf 'VITE_AUTH_ENABLED=false\n' > ui-v2/.env; chmod 600 ui-v2/.env; }
       (cd ui-v2 && NODE_OPTIONS=--max-old-space-size=3072 npm run build:box)
       (cd mcp && { [ -x .venv/bin/python ] || python3 -m venv .venv; } && .venv/bin/pip install -q -r requirements.txt) ;;
  *) echo "usage: $0 api|ui|build  (services: systemctl status ravenstack-keep-api ravenstack-keep-ui)"; exit 2 ;;
esac
