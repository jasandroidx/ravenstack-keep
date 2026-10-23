#!/usr/bin/env bash
# Ravenstack Keep on grok-bot box — tailnet-only. UI 127.0.0.1:8130, Keep HTTP API 127.0.0.1:8112.
# Exposed only via `tailscale serve --https=8496` (never Funnel).
# Box resets wipe node_modules/.venv; this script rebuilds them when missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BL="$ROOT/box-local"; LOG="$BL/logs"; mkdir -p "$BL"/{vault,outbox,drops,probes,uploads} "$LOG"
cmd="${1:-start}"
stop() {
  for n in ui http; do
    f="$LOG/$n.pid"; if [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null; then kill "$(cat "$f")"; echo "stopped $n"; fi; rm -f "$f"
  done
}
if [ "$cmd" = stop ]; then stop; exit 0; fi
if [ "$cmd" = restart ]; then stop; sleep 2; fi
# --- rebuild after box reset ---
[ -d "$ROOT/node_modules" ] || (cd "$ROOT" && npm ci --no-audit --no-fund)
[ -f "$ROOT/ui-v2/.env" ] || { printf 'VITE_AUTH_ENABLED=false\n' > "$ROOT/ui-v2/.env"; chmod 600 "$ROOT/ui-v2/.env"; }
[ -f "$ROOT/ui-v2/.output/server/index.mjs" ] || (cd "$ROOT/ui-v2" && npm run build:box)
[ -x "$ROOT/mcp/.venv/bin/python" ] || (cd "$ROOT/mcp" && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt)
export OBSIDIAN_VAULT="$BL/vault" KEEP_OUTBOX_DIR="$BL/outbox" KEEP_DROPS_DIR="$BL/drops" \
       KEEP_PROBES_DIR="$BL/probes" KEEP_UPLOAD_DIR="$BL/uploads" \
       OLLAMA_URL="http://127.0.0.1:11434" OLLAMA_BASE_URL="http://127.0.0.1:11434" KEEP_OLLAMA_URL="http://127.0.0.1:11434" \
       KEEP_TALK_MODEL="${KEEP_TALK_MODEL:-qwen3:1.7b}" \
       OLLAMA_MODEL="${KEEP_TALK_MODEL:-qwen3:1.7b}" OLLAMA_TIMEOUT_SEC=30 KEEP_OLLAMA_NUM_CTX="${KEEP_OLLAMA_NUM_CTX:-8192}" KEEP_HTTP_URL="http://127.0.0.1:8112" KEEP_PULSE_URL="http://127.0.0.1:8112/api/castle-map"
# --- Keep HTTP API (keep.db, dialogue, duty, gates) ---
if ! { [ -f "$LOG/http.pid" ] && kill -0 "$(cat "$LOG/http.pid")" 2>/dev/null; }; then
  cd "$ROOT/mcp"
  KEEP_HTTP_HOST=127.0.0.1 KEEP_HTTP_PORT=8112 KEEP_MCP_DATA="$ROOT/mcp/data" \
     nohup .venv/bin/python src/http_api.py >> "$LOG/http.log" 2>&1 &
  echo $! > "$LOG/http.pid"
fi
# --- UI (built Nitro node-server) ---
if ! { [ -f "$LOG/ui.pid" ] && kill -0 "$(cat "$LOG/ui.pid")" 2>/dev/null; }; then
  cd "$ROOT/ui-v2"; set -a; . ./.env; set +a
  HOST=127.0.0.1 PORT=8130 NITRO_HOST=127.0.0.1 NITRO_PORT=8130 \
     nohup node .output/server/index.mjs >> "$LOG/ui.log" 2>&1 &
  echo $! > "$LOG/ui.pid"
fi
sleep 3; ss -ltn | grep -E '127.0.0.1:(8130|8112) ' || true
echo "UI http://127.0.0.1:8130  API http://127.0.0.1:8112  logs $LOG"
