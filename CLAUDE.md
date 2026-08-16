# Ravenstack Keep

Visual command layer for the Ravenstack agent swarm. Phaser UI + a Starlette
API, themed after Suikoden's castle: rooms unlock as agents become real.

## Read this before you touch a branch

**`feat/suikoden-hq` is the truth.** It is what runs in production on `:8120`.

The repo's GitHub default branch is `ravenstack`, and it is **stale** (Aug 8).
A fresh `git clone` lands there and looks like a much smaller app — no music,
no portraits, no minimap, no chambers. On 2026-08-16 a session spent an
afternoon "improving" that stale copy before noticing. Do not build from
`ravenstack`. If the default has since been corrected, this note can go.

There are ~10 branches. Most are dead. `claude/ravenstack-keep-upgrade-guvajo`
is a competing Suikoden HQ build that lost — do not merge it.

## Layout

    ui/                 Vite + TypeScript + Phaser 3 front end
      src/KeepScene.ts    the map: rooms, agents, camera
      src/hud.ts          side panel: gates, room detail, operator actions
      src/api.ts          all network calls, same-origin /api/*
      src/config/seats.ts seat <-> room <-> agent_id bindings
      public/art/         room interiors, agent sprites, portraits
    mcp/src/
      server.py           Keep MCP tools (SQLite at mcp/data/keep.db)
      http_api.py         Starlette on :8120 — /api/* plus serves ui/dist
      gates.py            human gate storage
    agents/               agent specs, validated by schemas/agent-spec.schema.json

## Ports

| Port | What |
|---|---|
| 8120 | Keep API + built UI. **This is the Keep's URL**, not :8443 |
| 8000 | ReClaw API — county queue, jobs, capability gates |
| 18789 | OpenClaw gateway |
| 3000 / 8443 | Ravenstack Fortress (separate app, agent-town fork) |
| 5173 | Vite dev server, proxies /api to 8120 |

## The two halves

The Keep answers **"what exists, and what needs me?"** Rooms have lock states;
agent specs move draft → approved → live; a room unlocks only after its
occupant's spec is approved.

ReClaw (`:8000`) owns the **operational** half — county queue, running jobs,
capability grants. The browser reaches it through an allow-listed proxy at
`/api/reclaw/*` in `http_api.py`. That list is deliberately short. Do not turn
it into a general proxy.

## Rules

- **Human gates are the point.** `approve_spec`, `unlock_room`, county
  approve/reject and capability grants all require explicit human intent and
  `confirm=true`. Never auto-approve one to make a test pass or a flow
  complete. The whole design is that a person says yes.
- **A reject needs a reason.** ReClaw writes it to `auditor_lessons_log.yaml`
  and it shapes the next run. An empty reject teaches the pipeline nothing.
- **Never invent agent activity.** If an agent's state is unknown, show it as
  unknown. The map showing fictional work is worse than the map showing
  nothing — it was doing exactly that for six weeks and nobody could tell.
- **Resolve agents by `occupant_agent_id`, not `room_id`.** `seats.ts` aliases
  several rooms onto one seat, so a room lookup renders the same agent twice.

## Checks

    cd ui && npx tsc --noEmit && npm run build
    python3 -m py_compile mcp/src/http_api.py

There is no test suite. Typecheck and build are the gate.
