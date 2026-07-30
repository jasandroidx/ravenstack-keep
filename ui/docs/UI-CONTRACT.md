# Keep Visual Shell — UI Contract (V0)

## Visual states (room)

| State | Meaning | Look (v0) |
|-------|---------|-----------|
| `UNFORGED` | Sealed chamber; waiting for a real agent | Dim stone, dashed border, muted label |
| `live` | Door open (room exists for use) | Lit stone + neon rim |
| `locked` | Was live; locked after retire/etc. | Dim with lock glyph |

**Room live ≠ agent real.** Occupant may be candidate-only.

## Agent reality

| Flag | Meaning |
|------|---------|
| `agent_real: true` | Spec on disk, valid, `status` ∈ {approved, live} |
| `spec_status: draft` | Spec exists but not approved — ghost identity |
| no spec | Candidate name only — ghost outline |

## Agent activity (`agent_state`)

`idle` | `answering` | `working` | `waiting_human` | `failed` | `retired` | `null`

Sources (UI never invents work):

1. Keep MCP / `POST /api/report-status` (agents or operators)
2. **Gate mirror (Track 2):** `GET /api/castle-map` (and `/api/sync-status`) sets
   `waiting_human` for subjects of **pending** gates (`approve_spec` / unlock occupant),
   with `detail=sync:pending_gate`. Clears those rows to `idle` when the gate is gone.
   Does **not** invent A2A / roundtable activity.

Offline seed fallback leaves `agent_state` null (no fake idle chips).

## Gate card

From `GET /api/gates`:

- `id`, `gate_type`, `subject_id`, `summary`, `status`, `created_at`
- Types: `approve_spec`, `unlock_room`, …

Gated POSTs require `{ "confirm": true }`.

## Pipeline edge

From `public/pipeline.json` (UI-only):

- `from`, `to` room_ids, optional `label`

## Data sources

| Priority | Source |
|----------|--------|
| Live | `GET /api/castle-map` (Keep HTTP API → same SQLite as MCP) |
| Offline fallback | `/castle_map.json` static seed |
