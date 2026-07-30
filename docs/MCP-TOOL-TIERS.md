# MCP tool tiers (soft caps)

**Status:** active operator policy (2026-07-30)  
**Rejects:** hard 15/10 guillotine from Gemini organization memo  
**Keeps:** two planes (`reclaw-platform` vs `ravenstack-keep`)

## Planes

| Plane | Role | Network |
|-------|------|---------|
| `reclaw-platform` | Fortress ops | Tailscale preferred; public tunnel = **read allowlist only** (target) |
| `ravenstack-keep` | Keep control plane | **Tailscale / stdio only** — never public quick tunnel v0 |

## Tiers (per plane)

| Tier | When connected | Examples |
|------|----------------|----------|
| **Core** | Always (phone morning / UI poll) | reclaw: `morning_digest`, `project_sitrep`, `connector_status`, `public_mcp_url`; keep: `keep_health`, `get_castle_map`, `list_waiting_human`, `sot_versions` |
| **Extended** | Build / deep ops sessions | reclaw: `pipeline_status`, `query_knowledge`, `read_vault_file`, `docker_status`, `openclaw_health`, `list_packages`; keep: full A–D catalog |
| **Gated** | Explicit human intent + `confirm=true` | reclaw: county approve/reject, vault writes, ingest; keep: `approve_spec`, `unlock_room`, `retire_agent`, `trigger_reload_ritual` (non-dry-run) |
| **Stub / deferred** | Honest empty or off | keep F round-table stubs; section E cost pipeline |

## Soft budgets (guidance, not hard deletes)

- **Phone / SuperGrok public:** aim ≤ ~8–12 tools visible (core reads only).
- **Build laptop:** full dual plane OK.
- **Phaser UI:** Keep core only (`get_castle_map`, `list_waiting_human`, gate list).
- Prefer **composites** (`system_health`, `morning_digest`) *in addition to* leaf tools — do not delete leaves Build uses.

## Public reclaw allowlist (target)

When public tunnel is used, restrict to reads, e.g.:

- `morning_digest`, `project_sitrep` / `sitrep`
- `connector_status`, `public_mcp_url`
- `pipeline_status` (read)
- `county_queue_card` / `pending_gates` (read only — **no** approve)

Never on public: vault writes, gated county tools, Keep tools.

## Anti-bloat rules

1. No mega-merge of planes.  
2. Read free; write/gate = `confirm=true`.  
3. No wrappers without a client (digest/sitrep/map OK).  
4. Rename only with aliases for one release.  
5. No invented A2A history.  
6. Section E deferred until ledger exists.
