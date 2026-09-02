# Keep MCP — Phase-1 tool contracts

Five tools only. Names match [blueprint v0.2 §4.2](../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md).  
Transport: streamable-http. Auth: Tailscale-first (see [README.md](./README.md)).

All tools are **synchronous request/response**. Errors use structured MCP errors with a short `message` and optional `code`.

---

## 1. `list_rooms`

**Purpose:** Inventory Keep rooms and lock/occupant state for the dashboard and agents.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `include_unforged` | boolean | no (default `true`) | Include `UNFORGED` rooms |
| `lock_state` | string enum | no | Filter: `UNFORGED` \| `live` \| `locked` |

### Output

```json
{
  "rooms": [
    {
      "room_id": "oracle",
      "name": "Oracle",
      "lock_state": "UNFORGED",
      "occupant_agent_id": "oracle",
      "status_summary": "draft-spec",
      "updated_at": "2026-07-29T00:00:00Z"
    }
  ]
}
```

### Notes

- Seed v0 rooms from blueprint: Orchestrator, Clawforge (active); Oracle, Scribe Warden, Flipper (unforged).
- Read-only.

---

## 2. `report_agent_status`

**Purpose:** Agents (or their wrappers) publish live status so the Keep UI can move without scraping logs.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | yes | Must match a known Agent Spec `id` |
| `state` | string enum | yes | `idle` \| `answering` \| `working` \| `waiting_human` \| `failed` \| `retired` |
| `task` | string | no | Short current task description |
| `confidence` | number | no | 0.0–1.0 if the agent reports it |
| `session_id` | string | no | Correlates multi-step work |
| `detail` | string | no | Optional free text (keep short) |

### Output

```json
{
  "ok": true,
  "agent_id": "oracle",
  "state": "answering",
  "updated_at": "2026-07-29T12:00:00Z"
}
```

### Notes

- **Write** to state store only (status row). Not a general event bus.
- Reject unknown `agent_id` (must have a spec file or registered row).
- `retired` is reportable for display; enforcing kill_condition remains a human/Orchestrator policy action.

---

## 3. `get_agent_spec`

**Purpose:** Return the Agent Spec that makes an agent “real.”

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | yes | Spec id (e.g. `oracle`) |
| `format` | string enum | no | `json` (default) \| `markdown` |

### Output

```json
{
  "agent_id": "oracle",
  "status": "draft",
  "spec": { "...": "full Agent Spec object per schema" },
  "source_path": "agents/oracle.agent-spec.json"
}
```

If `format=markdown`, `spec` may be a string body of `agents/<id>.md` instead of the JSON object.

### Notes

- Validate JSON against `schemas/agent-spec.schema.json` before return; on invalid spec, return error rather than a partial agent.
- Read-only. Approval / status transitions are **not** Phase 1 tools.

---

## 4. `query_scoped_knowledge`

**Purpose:** RAG query that **respects the calling agent’s knowledge_seeds**.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | yes | Spec whose `knowledge_seeds` apply |
| `query` | string | yes | Natural-language query |
| `top_k` | integer | no | Default 5, max 20 |
| `indexes` | string[] | no | Subset of the agent’s allowed indexes; default = all allowed |

### Output

```json
{
  "agent_id": "oracle",
  "indexes_used": ["self"],
  "results": [
    {
      "path": "Ravenstack/RAVENSTACK-ORACLE.md",
      "section": "Quick Start for Agents",
      "snippet": "…",
      "score": 0.83,
      "index": "self"
    }
  ]
}
```

### Notes

- If `indexes` requests an index **not** in the agent’s seeds → **error** (`scope_denied`), do not silently widen.
- `general` is never a valid index in Keep (schema excludes it).
- v0 implementation may proxy to reclaw-platform `query_knowledge` / `POST /rag/search` and **filter** results by path globs from the spec.
- Read-only. Does not ingest or write vault files.

---

## 5. `get_cost_summary`

**Purpose:** Per-agent and monthly cost attribution surface (even if zeros in v0).

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | no | If set, filter to one agent |
| `month` | string | no | `YYYY-MM`; default = current UTC month |

### Output

```json
{
  "month": "2026-07",
  "currency": "USD",
  "monthly_ceiling": null,
  "total_est_usd": 0.0,
  "by_agent": [
    {
      "agent_id": "oracle",
      "tier_breakdown": { "local": 0.0, "escalate": 0.0, "god": 0.0 },
      "est_usd": 0.0,
      "call_count": 0
    }
  ],
  "notes": "v0 may return zeros until cost events are wired (Phase 4)."
}
```

### Notes

- Read-only summary. Recording cost events can be an internal helper used by escalate/god paths later; not a Phase-1 public tool.
- Local tier always attributes **$0** marginal (still may count calls for observability).
- When a monthly ceiling exists (Phase 4), crossing it **stops** paid calls; this tool only reports.

---

## 6. `report_presence` (visual command layer)

**Purpose:** Spatial presence for Phaser sprites — room + state + short task + sprite_hint.

### Input
| Field | Type | Required |
|-------|------|----------|
| room_id | string | yes |
| state | agent state enum | yes |
| task_summary | string | no |
| sprite_hint | string | no (e.g. `oracle`, `raziel`) |
| agent_id | string | no (defaults to room occupant) |

### Notes
- Writes `agent_status` (incl. room_id, sprite_hint) and room status_summary.
- **Never invent work.** Human gates still require separate approve_spec / unlock_room with confirm=true.
- HTTP: `POST /api/report-presence`

## 7. `list_agent_specs`

Lists on-disk specs: id, status, room_id, path. Filter optional `status`.

## 8. `get_room`

Alias of `get_room_status` for UI/agent clients.

## Arcane Library Spatial Compactor

| Tool | Purpose |
|------|---------|
| `trigger_spatial_compaction` | 85% token threshold → archive low spatial-relevance context, vault note, vectors |
| `get_compaction_history` | Recent compaction events |
| `query_spatial_memory` | Spatially biased search over archived summaries |

See [docs/ARCANE-LIBRARY-COMPACTOR.md](docs/ARCANE-LIBRARY-COMPACTOR.md).

## Explicitly deferred (not Phase 1)

| Tool | Phase |
|------|--------|
| `get_room` / `list_agent_specs` | convenience aliases |
| `propose_agent_spec` | Clawforge |
| `approve_spec` | human gate |
| `unlock_room` | progression |
| any execute / install / spend tool | never without permanent human gate |

---

## Client usage sketch

```
# list rooms
list_rooms({ include_unforged: true })

# oracle answers → status
report_agent_status({ agent_id: "oracle", state: "answering", task: "Q about MCP endpoints" })
query_scoped_knowledge({ agent_id: "oracle", query: "Tailscale MCP endpoint?", top_k: 5 })
report_agent_status({ agent_id: "oracle", state: "idle", session_id: "…" })

# inspect policy
get_agent_spec({ agent_id: "oracle", format: "json" })
get_cost_summary({ agent_id: "oracle" })
```
