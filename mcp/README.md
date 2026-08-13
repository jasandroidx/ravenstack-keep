# Keep MCP

**Status:** Phase 1 **implemented** + spatial telemetry (v0.1)  
**Goal:** Dedicated MCP surface for Ravenstack Keep so UIs, agents, Claude Desktop, Grok, and Round Table clients can list rooms, report status, read specs, query **scoped** knowledge, see cost summaries, and read the **castle spatial map** without knowing internal ReClaw ports.

Blueprint: [RAVENSTACK-KEEP-BLUEPRINT-v0.2.md](../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md) §4.2  
Contracts: **[tools.md](./tools.md)**  
Spatial: **[docs/SPATIAL-TELEMETRY.md](./docs/SPATIAL-TELEMETRY.md)**

## Why a separate MCP?

| Need | Keep MCP role |
|------|----------------|
| Room / agent status for the visual Keep | `list_rooms`, `report_agent_status` |
| Specs as the unit of reality | `get_agent_spec` |
| Enforce knowledge seeds | `query_scoped_knowledge` |
| Cost attribution (before Phase 4 full governance) | `get_cost_summary` |
| Castle grid / pathing for Phaser UI | `get_castle_map`, `get_path`, … |
| Later forge loop | `propose_agent_spec`, `approve_spec`, `unlock_room` (out of Phase 1) |

**reclaw-platform** remains the fortress ops connector (sitrep, vault RW, pipeline). Keep MCP is a **thin control plane** — specs + rooms + scoped knowledge + spatial telemetry.

## Tools

### Phase-1 (exact names — do not rename)

1. `list_rooms` — `include_unforged` (default true), optional `lock_state`
2. `report_agent_status` — `agent_id`, `state`, optional task/confidence/session_id
3. `get_agent_spec` — `agent_id`, `format` = `json` \| `markdown`
4. `query_scoped_knowledge` — enforces `knowledge_seeds`; `scope_denied` if widened
5. `get_cost_summary` — per-agent / month (zeros OK in v0)

### Spatial telemetry

6. `get_castle_map`
7. `get_room_status`
8. `get_path`
9. `rooms_within_distance`
10. `get_adjacent_rooms`
11. `get_occupancy_summary` (bonus)

## Layout

```
mcp/
├── README.md
├── tools.md
├── requirements.txt
├── pyproject.toml
├── .gitignore          # data/
├── data/               # keep.db (created at runtime, gitignored)
├── docs/
│   └── SPATIAL-TELEMETRY.md
└── src/
    └── server.py
```

## Install

```bash
cd mcp
uv venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

Or: `pip install -r requirements.txt`

## Run

### stdio (default — Grok Build / Claude Desktop / local CLI)

```bash
cd mcp
source .venv/bin/activate
python src/server.py
# or:
# KEEP_MCP_TRANSPORT=stdio python src/server.py
```

### streamable-http (Tailscale / production path)

```bash
cd mcp
source .venv/bin/activate
# Bind loopback by default — put Tailscale Serve in front
KEEP_MCP_TRANSPORT=http KEEP_MCP_HOST=127.0.0.1 KEEP_MCP_PORT=8110 python src/server.py
```

One-liners:

```bash
# stdio
python mcp/src/server.py

# HTTP on :8110 (this is the port the server binds — see DUAL-MCP-OPERATOR-GUIDE.md)
KEEP_MCP_TRANSPORT=http KEEP_MCP_PORT=8110 python mcp/src/server.py
```

Optional env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `KEEP_MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `KEEP_MCP_HOST` | `127.0.0.1` | HTTP bind (use Tailscale, not public) |
| `KEEP_MCP_PORT` | `8110` | HTTP port (do not collide with reclaw `:8100`) |
| `KEEP_MCP_DATA` | `mcp/data` | Directory for `keep.db` |
| `OBSIDIAN_VAULT` | (auto) | Vault root for local `query_scoped_knowledge` |


## Live fortress (Hetzner)

| MCP process | `http://127.0.0.1:8111/mcp` (binds 0.0.0.0 for Docker) |
| Tailnet MCP | `https://openclaw.tail20a090.ts.net:8110/mcp` (Serve → 8111) |
| Visual Keep UI | `https://openclaw.tail20a090.ts.net:8120/` |
| HTTP API | `http://127.0.0.1:8120/api/*` |



| Item | Value |
|------|--------|
| Service | `ravenstack-keep-mcp.service` |
| Local | `http://127.0.0.1:8111/mcp` |
| Health | `http://127.0.0.1:8111/health` |
| Tailnet | `https://openclaw.tail20a090.ts.net:8111/mcp` |
| Health (tailnet) | `https://openclaw.tail20a090.ts.net:8111/health` |

```bash
sudo systemctl status ravenstack-keep-mcp
curl -sS http://127.0.0.1:8111/health
```

## Auth (Tailscale-first)

1. **Preferred:** Listen on `127.0.0.1` + Tailscale Serve, or bind the tailnet interface only.
2. **Secondary:** Bearer token (add later); store in env, never git.
3. **Not for v0:** Public Cloudflare quick tunnel without auth.

## State store

SQLite file `mcp/data/keep.db` (created on first tool call / startup):

| Table | Purpose |
|-------|---------|
| `rooms` | Six spatial rooms + lock/status/occupancy |
| `agent_status` | Live status from `report_agent_status` |
| `cost_events` | Optional cost rows (summary may be zeros) |

Specs stay **read-only** from `agents/*.agent-spec.json` (validated with `schemas/agent-spec.schema.json` when jsonschema is installed).

## Smoke (Python)

```bash
cd mcp && source .venv/bin/activate
python - <<'PY'
import sys
sys.path.insert(0, "src")
from server import (
    init_db, get_castle_map, get_path, rooms_within_distance,
    list_rooms, get_agent_spec, report_agent_status, get_cost_summary,
)
init_db()
print(get_castle_map()[:400], "...")
print(get_path("Great Hall", "Vault"))
print(rooms_within_distance("Great Hall", 2))
print(list_rooms(include_unforged=True)[:300], "...")
print(get_agent_spec("oracle")[:300], "...")
print(report_agent_status("oracle", "answering", task="smoke"))
print(get_cost_summary(agent_id="oracle"))
PY
```

## Non-goals (still)

- Clawforge approve loop / `unlock_room`
- Public exposure
- Auto-executing kill conditions
- Replacing reclaw-platform ops tools
