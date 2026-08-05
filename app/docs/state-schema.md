# state.json schema (schema_version 1)

Sole contract between poller and Phaser renderer. Renderer must never call gateway, ReClaw, or MCP.

## Root

| Field | Type | Notes |
|-------|------|-------|
| `schema_version` | number | `1` |
| `generated_at` | string | UTC ISO-8601 with `Z` |
| `poll_interval_sec` | number | default `4`; stale if age > `3 ×` this |
| `global` | object | see below |
| `rooms` | array | room records |
| `agents` | array | agent records |
| `gates` | array | pending human gates |

## global

| Field | Type |
|-------|------|
| `spend_month_usd` | number \| null |
| `spend_budget_usd` | number \| null |
| `tasks_running` | number \| null |
| `gates_pending` | number \| null |
| `stale` | boolean |

## rooms[]

| Field | Type | Enum |
|-------|------|------|
| `id` | string | map object `room_id` |
| `name` | string | display |
| `lock` | string | `live` \| `locked` \| `unforged` |
| `agent_id` | string \| null | occupant |

## agents[]

| Field | Type | Enum / notes |
|-------|------|----------------|
| `id` | string | map spawn name |
| `name` | string | |
| `sprite_key` | string | e.g. `mage_blue` |
| `room` | string | room id |
| `state` | string | `idle` \| `working` \| `answering` \| `waiting_on_human` \| `failed` \| `retired` |
| `task_text` | string \| null | |
| `confidence` | number \| null | |
| `source` | string | `hook` \| `poll` |
| `updated_at` | string | UTC ISO-8601 Z |

## gates[]

| Field | Type |
|-------|------|
| `id` | string |
| `agent_id` | string |
| `blocked_on` | string |
| `subject` | string |
| `since` | string (UTC Z) |

## Conflict rules (poller)

1. **Poll wins** on existence/identity (agents, rooms, spend, gate counts).
2. **Hook wins on recency** for transient state if hook `updated_at` > last poll.
3. **Poll heals drift**: ground truth has no pending gate → clear `waiting_on_human` that only hooks set.
4. Every mutable field carries `source` + `updated_at`.

Unknown fields: emit `null`, never invent.
