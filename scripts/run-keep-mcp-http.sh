#!/usr/bin/env bash
set -euo pipefail
cd /root/ravenstack-keep
export PYTHONPATH=/root/ravenstack-keep/mcp/src
export KEEP_AGENTS_DIR=/root/ravenstack-keep/agents
export KEEP_MCP_SEEDS=/root/ravenstack-keep/mcp/seeds
export KEEP_MCP_DATA=/root/ravenstack-keep/mcp/data
export RECLAW_OBSIDIAN_VAULT_PATH="${RECLAW_OBSIDIAN_VAULT_PATH:-/root/obsidian_vault}"
export MCP_TRANSPORT=streamable-http
# Bind all interfaces; rely on UFW/Tailscale for access (same pattern as reclaw :8100)
export FASTMCP_HOST="${FASTMCP_HOST:-0.0.0.0}"
export FASTMCP_PORT="${FASTMCP_PORT:-8110}"
export MCP_STATELESS_HTTP="${MCP_STATELESS_HTTP:-1}"
exec /root/ravenstack-keep/.venv/bin/python -m ravenstack_keep_mcp
