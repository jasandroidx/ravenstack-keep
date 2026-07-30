# Keep MCP (`ravenstack-keep`)

**Status:** v0 implementation (local). Contracts + working stdio/HTTP server.  
**Not:** reclaw-platform. Ops (sitrep, docker, county queue, vault RW) stay on `:8100`.

Thin control plane for:

- Rooms / castle map / desk assignments  
- Agent Specs (read, propose draft, gated approve/retire)  
- Scoped knowledge (`knowledge_seeds`)  
- Human gates + event log  
- Honest A2A/round-table stubs until instrumented  

## Layout

```
mcp/
├── README.md
├── tools.md                 # full tool catalog
├── requirements.txt
├── seeds/
│   └── castle_map.json
├── data/                    # runtime SQLite (gitignored)
├── src/ravenstack_keep_mcp/
│   ├── server.py            # FastMCP tools + entrypoint
│   ├── store.py             # SQLite
│   ├── specs.py             # Agent Spec load/validate/promote
│   ├── knowledge.py         # scoped RAG / vault scan
│   └── paths.py
└── tests/
```

## Setup (laptop)

```bash
cd ~/ravenstack-keep
# uv already used to create .venv — reinstall if needed:
# ~/.local/bin/uv venv .venv && ~/.local/bin/uv pip install --python .venv/bin/python -r mcp/requirements.txt

export PYTHONPATH="$PWD/mcp/src"
.venv/bin/python -m ravenstack_keep_mcp          # stdio
# or HTTP:
MCP_TRANSPORT=streamable-http FASTMCP_PORT=8110 .venv/bin/python -m ravenstack_keep_mcp
```

### Grok Build config sketch

```toml
[mcp_servers.ravenstack-keep]
command = "/home/sirboydimus/ravenstack-keep/.venv/bin/python"
args = ["-m", "ravenstack_keep_mcp"]
env = { PYTHONPATH = "/home/sirboydimus/ravenstack-keep/mcp/src" }
enabled = true
```

## Tests

```bash
cd ~/ravenstack-keep
PYTHONPATH=mcp/src .venv/bin/pytest mcp/tests -v
```

## Auth / network

- **v0:** localhost / Tailscale only. No public quick tunnel.  
- Optional later: bearer token for non-tailnet automation.  
- Reload real execution: set `KEEP_RELOAD_CMD` with `{goal}` placeholder (Hetzner).

## SOT note

`seeds/castle_map.json` is **CANONICAL** ([KEEP-SOT-DECISION.md](../KEEP-SOT-DECISION.md)).  
Agent Spec files under `agents/` are the source of “agent is real” (`status ≥ approved`).  
See `docs/ARCHITECTURE-MCP-SPLIT.md`.

## Related prompts

| Task | File | Who |
|------|------|-----|
| SOT decision | `prompts/PROMPT-SOT-RESEARCH-CLAUDE.md` | Claude |
| Tool surface organization | `prompts/PROMPT-MCP-SURFACE-ORGANIZATION-GEMINI.md` | Gemini |
| Build tools (this package) | Grok Build local | Done in v0 |
