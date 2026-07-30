# Keep MCP — tool catalog (v0)

**Server name:** `ravenstack-keep`  
**Transport:** stdio (dev) · streamable-http `:8110` (Tailscale later)  
**Split:** Fortress ops stay on **reclaw-platform** (`:8100`). This server is the Keep control plane only.  
**Deferred:** Section E (cost event pipeline / model routing policy).  
**SOT:** Map seed `mcp/seeds/castle_map.json` is **CANONICAL** ([KEEP-SOT-DECISION.md](../KEEP-SOT-DECISION.md)). Agent Specs on disk are agent truth when `status ≥ approved`.

All tools are synchronous. Errors return `{ "error", "code", "message" }`.

---

## H — Meta

| Tool | Access | Notes |
|------|--------|-------|
| `keep_health` | read | Liveness, room/spec counts, vault path, SOT status |
| `sot_versions` | read | Which seeds/specs loaded; policy note |

---

## A — Core control plane

| Tool | Access | Notes |
|------|--------|-------|
| `list_rooms` | read | Filter `include_unforged`, `lock_state` |
| `get_room` | read | Room + occupant status |
| `report_agent_status` | write | `idle` \| `answering` \| `working` \| `waiting_human` \| `failed` \| `retired` |
| `get_agent_spec` | read | `format=json\|markdown`; schema-validated |
| `list_agent_specs` | read | Roster + validation flags |
| `query_scoped_knowledge` | read | Enforces `knowledge_seeds`; `general` → `scope_denied` |
| `get_cost_summary` | read | Stub zeros until section E |

---

## B — Map / dashboard / A2A

| Tool | Access | Notes |
|------|--------|-------|
| `get_castle_map` | read | Rooms + coords + status chips |
| `list_a2a_messages` | read | Empty → honest not instrumented |
| `get_agent_trace` | read | By `trace_id`; no invented chains |
| `get_queue_depth` | read | Per room or all |
| `list_waiting_human` | read | Agents + pending gates |
| `get_desk_assignment` | read | Agent → room → x,y |

---

## C — Governance

| Tool | Access | Notes |
|------|--------|-------|
| `propose_agent_spec` | write | Draft → `backlog/agent-specs/` only |
| `approve_spec` | **gated** | `confirm=true`; promotes to `agents/`; no unlock |
| `unlock_room` | **gated** | `confirm=true`; requires approved/live occupant when present |
| `retire_agent` | **gated** | `confirm=true`; locks room if live |
| `list_pending_gates` | read | Keep-wide gates |
| `diff_agent_spec` | read | Live vs backlog draft |

---

## D — Rituals / hygiene

| Tool | Access | Notes |
|------|--------|-------|
| `trigger_reload_ritual` | **gated** | `confirm=true`; default `dry_run=true`; real exec needs `KEEP_RELOAD_CMD` |
| `reload_status` | read | Last ritual record |
| `list_knowledge_indexes` | read | Never `general` |
| `explain_scope` | read | Per-agent seeds |
| `search_castle_events` | read | Status/gate/ritual events |

---

## F — Round table (stubs)

| Tool | Access | Notes |
|------|--------|-------|
| `start_roundtable` | gated stub | `not_instrumented` |
| `get_roundtable_status` | stub | `not_instrumented` |
| `submit_roundtable_vote` | gated stub | `not_instrumented` |
| `get_consensus_result` | stub | `not_instrumented` |

---

## E — Deferred (do not implement yet)

- `record_cost_event`
- `get_model_routing_policy`
- `budget_remaining`
- Full cost ledger writers

---

## Explicit non-tools

- Generic shell / `exec`
- Unscoped vault write
- Auto-install skills or OpenClaw config
- Public unauthenticated exposure of Keep

---

## Client sketch

```
list_rooms({ include_unforged: true })
get_castle_map()
get_agent_spec({ agent_id: "oracle" })
report_agent_status({ agent_id: "oracle", state: "answering", task: "Q about MCP" })
query_scoped_knowledge({ agent_id: "oracle", query: "reload ritual", top_k: 5 })
report_agent_status({ agent_id: "oracle", state: "idle" })

# gates
approve_spec({ agent_id: "oracle", confirm: true })   # human only
unlock_room({ room_id: "oracle", confirm: true })
```
