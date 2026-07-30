# MCP surface split — reclaw-platform vs ravenstack-keep

**Status:** active plan (2026-07-30)  
**Owner:** Jason + Grok Build  
**Deferred:** Section E (cost event pipeline / model routing policy tools)

## Principle

| Plane | Server | Port (suggested) | Responsibility |
|-------|--------|------------------|----------------|
| **Fortress ops** | `reclaw-platform` | `8100` | sitrep, docker, OpenClaw, county queue, vault RW, connector, RAG admin |
| **Keep control plane** | `ravenstack-keep` | `8110` | rooms, castle map, Agent Specs, scoped knowledge, gates, A2A read, rituals |

Clients may connect to **both**. Do **not** merge into one mega-tool bag.

```
SuperGrok / Grok Build / UI
        │
        ├─ reclaw-platform  →  "is the fortress healthy? queue? vault?"
        └─ ravenstack-keep  →  "which room? which agent? allowed knowledge? approve?"
```

## Non-negotiables

1. **No draft-to-execute** — `propose_agent_spec` → backlog only; `approve_spec` + `unlock_room` are separate human gates with `confirm=true`.
2. **Scoped knowledge** — `query_scoped_knowledge` enforces Agent Spec `knowledge_seeds`; `general` is forbidden.
3. **Honest empty** — A2A/traces/round table return `not_instrumented`, never invented history.
4. **Tailscale-first for Keep** — no public quick tunnel for Keep v0.
5. **SOT is CANONICAL** — see [KEEP-SOT-DECISION.md](../KEEP-SOT-DECISION.md): repo owns `mcp/seeds/castle_map.json` + `agents/*.agent-spec.json`; vault owns narrative fortress knowledge; Drive Keep specs frozen historical.

## Tool inventory (Keep MCP v0)

### A — Core control plane
`list_rooms`, `get_room`, `report_agent_status`, `get_agent_spec`, `list_agent_specs`, `query_scoped_knowledge`, `get_cost_summary` (stub zeros)

### B — Map / dashboard / A2A
`get_castle_map`, `list_a2a_messages`, `get_agent_trace`, `get_queue_depth`, `list_waiting_human`, `get_desk_assignment`

### C — Governance (gated where noted)
`propose_agent_spec`, `approve_spec` (confirm), `unlock_room` (confirm), `retire_agent` (confirm), `list_pending_gates`, `diff_agent_spec`

### D — Rituals / hygiene
`trigger_reload_ritual` (confirm; dry_run default), `reload_status`, `list_knowledge_indexes`, `explain_scope`, `search_castle_events`

### E — Cost pipeline
**Deferred** (`record_cost_event`, `get_model_routing_policy`, `budget_remaining`)

### F — Round table
Stubs only: `start_roundtable`, `get_roundtable_status`, `submit_roundtable_vote`, `get_consensus_result`

### H — Meta
`keep_health`, `sot_versions`

## Run locally

```bash
cd ~/ravenstack-keep
source .venv/bin/activate   # or: .venv/bin/python
export PYTHONPATH=mcp/src
# stdio (Grok Build)
python -m ravenstack_keep_mcp

# HTTP (Tailscale later on Hetzner)
MCP_TRANSPORT=streamable-http FASTMCP_HOST=127.0.0.1 FASTMCP_PORT=8110 \
  python -m ravenstack_keep_mcp
```

Grok config sketch (local):

```toml
[mcp_servers.ravenstack-keep]
command = "/home/sirboydimus/ravenstack-keep/.venv/bin/python"
args = ["-m", "ravenstack_keep_mcp"]
env = { PYTHONPATH = "/home/sirboydimus/ravenstack-keep/mcp/src" }
enabled = true
```

## Deploy (Hetzner)

- Path: `/root/ravenstack-keep`
- Unit: `ravenstack-keep-mcp.service` → streamable-http **`:8110`**
- UFW: `8110/tcp` on **tailscale0 only**
- Health/MCP: `http://100.108.130.82:8110/mcp`
- `RECLAW_OBSIDIAN_VAULT_PATH=/root/obsidian_vault`
- Sync from laptop: `rsync -az --exclude .venv … ~/ravenstack-keep/ openclaw:/root/ravenstack-keep/`
- Do **not** expose via cloudflared quick tunnel until auth exists

## Open decisions

1. **SOT** — **Resolved 2026-07-30.** [KEEP-SOT-DECISION.md](../KEEP-SOT-DECISION.md) Model C (hybrid, repo-centric). Canonical map: `mcp/seeds/castle_map.json`.
2. **Surface organization** — See [MCP-TOOL-TIERS.md](./MCP-TOOL-TIERS.md) (soft core/extended/gated tiers). Connector ops: [CONNECTOR-RUNBOOK.md](./CONNECTOR-RUNBOOK.md).
