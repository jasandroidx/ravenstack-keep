# Handoff — Grok Build painted hall → jasandroidx/ravenstack-keep

Jason already has the fortress repo. This sandbox is a **new skin**, not a new project.

| Repo | What it is |
|---|---|
| [jasandroidx/ravenstack-keep](https://github.com/jasandroidx/ravenstack-keep) | Specs, Keep MCP, HTTP API `:8120`, Phaser `ui/` that failed visually |
| [jasandroidx/ReClaw-2.0](https://github.com/jasandroidx/ReClaw-2.0) | Ops substrate (API, RAG, dashboard, rural_data) |
| This Grok Build tree | Painted Great Hall that finally looks like the reference paintings |

**Do not create a third Keep repo.** Land this as a branch on `ravenstack-keep` (suggested: `painted-hall`) and keep `mcp/`, `agents/`, `schemas/` untouched.

## Why this app is necessary

The stack works. The operator cannot *see* it. ACTIVE.md still listed “Visual rooms UI” as not started in spirit: the old `ui/` is a 48×48 tile grid + procedural façades. Jason rejected that look for months. Without a hall he will use, Keep MCP (`list_rooms`, `get_castle_map`, gates, specs) stays a raw tool surface. The fortress dies of unreadability, not of missing Python.

This hall is the missing command layer. Raziel’s test still applies: chips must call live tools or it is theater.

## What already exists on GitHub (reuse, don’t rewrite)

Keep MCP (Phase 1 + spatial), HTTP API:

- `list_rooms`, `report_agent_status`, `get_agent_spec`, `query_scoped_knowledge`, `get_cost_summary`
- `get_castle_map`, `get_path`, occupancy, gates with `confirm=true`
- `GET /api/castle-map` — live, else UI falls back to `/castle_map.json` **without inventing idle chips**
- Agent specs: Raziel, Clawforge, Oracle, Corvid

Old visual (frozen):

- `ui/src/KeepScene.ts` + `ui/src/api.ts` (this is the **wire** to copy)
- `ui/scripts/generate_keep_art.py` — failed 48×48 pipeline. Do not revive.
- `ui/docs/ART-DIRECTION.md` — palette + “art never moves rooms” still law
- `ui/docs/UI-CONTRACT.md` — paper vs live. Honor it.

OpenClaw skills (on the box, not this sandbox):

- **openclaw-mechanic** — diagnose gateway/skills/MCP; Valerie’s job
- **ravenstack-sentinel** — harness / red-flag watch; Watchtower
- **keep-asset-pipeline** — the failed tile generator. Replaced here by `skills/keep-visual-pipeline/SKILL.md`

## How to copy this build onto the real repo

1. Branch `painted-hall` on `ravenstack-keep`.
2. Drop this app’s `src/lib/hall`, `src/components/hall`, `public/hall` in as `ui-v2/` **or** replace `ui/src` while keeping `ui/src/api.ts` contract.
3. Point `src/lib/keep/pulse.ts` at `http://127.0.0.1:8120/api/castle-map` (box only). Map `source: api` → badge **live**, `seed` → **paper**.
4. War table → `GET /api/gates`. Approve still `confirm: true`.
5. Valerie Diagnose → mechanic skill / `stack_health` via reclaw-platform `:8100`. Keep MCP stays control plane.
6. Leave `mcp/` and `agents/*.json` as machine SOT (Model C, 2026-07-30).

`.gitignore` in this sandbox already drops attachments, screenshots, Grok `AGENTS.md`, `.env`. Do not commit Funnel paths.

## First wires (Raziel)

| UI | Existing endpoint |
|---|---|
| Occupancy chips | `GET /api/castle-map` |
| Gate glow / war table | `GET /api/gates` |
| Ledger specs | `get_agent_spec` / `agents/*.json` |
| Oracle talk | `query_scoped_knowledge` (not unscoped `query_knowledge`) |
| Mechanic | reclaw-platform `stack_health` + openclaw-mechanic |
| Sentinel | ravenstack-sentinel / harness watch |

Until those answer, the header must say **paper**.

## What Grok Build should not do

- More unique walk-sprites
- A second MCP
- Pushing Funnel URLs
- Overwriting `mcp/` on GitHub from this sandbox without a review finding
