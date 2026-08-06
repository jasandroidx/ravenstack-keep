# Spatial telemetry — Ravenstack Keep

**Status:** live with Keep MCP v0.1  
**Consumers:** visual Keep (Next.js + Phaser), agents, Round Table UIs

## Coordinate registry

Only these **six** rooms participate in pathing and `get_castle_map`.

| Room        | `room_id`     | Coords `[x,y]` | Default status | Fortress role              |
|-------------|---------------|----------------|----------------|----------------------------|
| Great Hall  | `great-hall`  | `[0, 0]`       | Secure         | Orchestrator / command     |
| Alchemy Lab | `alchemy-lab` | `[1, 1]`       | Active         | Clawforge                  |
| Library     | `library`     | `[1, 0]`       | Active         | Knowledge / Oracle         |
| Armory      | `armory`      | `[0, 1]`       | Secure         | Tools & MCP multiplex      |
| Observatory | `observatory` | `[1, 2]`       | Active         | Round Table / multi-AI     |
| Vault       | `vault`       | `[-1, -1]`     | Restricted     | Cost, secrets              |

ASCII (y increases “north”):

```
                 [1,2] Observatory

        [0,1] Armory   [1,1] Alchemy Lab

        [0,0] Great    [1,0] Library
              Hall

  [-1,-1] Vault
```

## Distance and pathing

- **Manhattan** distance: `|dx| + |dy|`.
- **Adjacency** (`get_adjacent_rooms`): rooms with Manhattan distance **exactly 1**.
- **Pathing** (`get_path`): BFS on a free **4-directional grid**. Empty cells are walkable so Vault can reach Great Hall even though no room sits on intermediate tiles.
- Output includes `path_cells`, `steps` (with cardinal `dir`), `rooms` encountered on the path, and `manhattan`.

Example: Great Hall → Vault

- Manhattan = 2  
- Path cells (one valid BFS result): `[0,0] → [-1,0] → [-1,-1]` (or equivalent length-2 routes)

## Status vs lock_state

| Layer | Field | Values | Used by |
|-------|--------|--------|---------|
| Spatial / UI | `status` | `Active`, `Secure`, `Restricted` | Phaser tint, dashboards |
| Phase-1 contract | `lock_state` | `UNFORGED`, `live`, `locked` | `list_rooms` filters |

v0 seed maps Active/Secure → `live`, Restricted (Vault) → `locked`.

## Occupancy

- `occupant_agent_id` on a room row is seedable and updated lightly via `report_agent_status` when that agent is already linked to the room.
- `get_castle_map` and `get_room_status` attach live `agent_status` rows when present.
- `get_occupancy_summary` aggregates agents + room status counts.

## How the visual Keep should consume this

1. **Boot:** `get_castle_map` → place sprites at `coords`, color by `status`, label occupants.
2. **Tick:** poll `get_occupancy_summary` or re-fetch map every N seconds.
3. **Move animation:** `get_path(from, to)` → animate along `path_cells` (not only room nodes).
4. **Hover / click:** `get_room_status(name)` for detail panel.
5. **Fog / proximity UI:** `rooms_within_distance(room, d)`.

Do **not** hardcode coordinates only in the client — treat Keep MCP as source of truth so agent pathing and UI stay aligned.

## Security

- Spatial tools are **read-only** except occupancy that flows through `report_agent_status`.
- Vault is `Restricted` / `locked` — UI should gate interactions; MCP does not auto-unlock.
- Bind HTTP to `127.0.0.1` or Tailscale only; no public tunnel for v0.

## Phase-1 relationship

Spatial tools are **additive**. The five Phase-1 names in [tools.md](../tools.md) remain the control-plane contract for specs, scoped knowledge, and cost.
