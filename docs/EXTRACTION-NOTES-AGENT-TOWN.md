# Extraction Notes — Agent Town inspirations for Ravenstack Keep

**Date:** 2026-08-06  
**Scope:** Visual command layer items 1–6  
**Keep stack:** Phaser 3 + Keep MCP (streamable-http) + Tailscale :8120 UI

## 1. geezerrrr/agent-town

| Take | How we use it |
|------|----------------|
| Walk-up / click-to-interact menu | Room click → RPG interaction panel (assign/view/gate/spec) |
| Task lifecycle bubbles (queued→running→done) | Speech bubble from live `agent_state` + task only — no invented work |
| Seat/agent binding | Room `occupant_agent_id` + Agent Spec status |
| Multi-session status surface | Keep status bar + OpenClaw sync (existing) |

| Ignore |
|--------|
| Modern office aesthetic / Tiled office maps |
| Direct OpenClaw WS from game UI (we stay on Keep MCP) |
| Paid asset packs, generative life-sim chatter |

## 2. AGI-Villa/agent-town

| Take | How we use it |
|------|----------------|
| Ambient presence | Idle roam within room bounds when `idle` |
| Lightweight status updates | Poll castle-map every 3s; no extra LLM |

| Ignore |
|--------|
| Full life-sim, pets, schedule generators, paid daily posts |
| Repo was 404 at research time — concepts only |

## 3. shengyu-meng/ClawLibrary

| Take | How we use it |
|------|----------------|
| OpenClaw-native room metaphor | Already: Great Hall, Library, Alchemy Lab, Armory, Observatory, Vault |
| Activity-driven routing | `report_presence` / `report_agent_status` → room summary + path when room changes |
| Replaceable art layer | `ui/public/art/**` + procedural pipeline |

| Ignore |
|--------|
| Non-Phaser museum browser, their asset pipeline paths, LAN password model |

## 4. rafapetter/agent-town

| Take | How we use it |
|------|----------------|
| Speech bubbles + status→animation mapping | Bubble text from task; work pulse / wait amber |
| BFS multi-room pathfinding | MCP `get_path` + Phaser tween along pixels |
| Kanban-style stage cues | Compact status pill + forge flow stages (not full kanban board) |
| Zero-dep status patterns | Procedural sprites; no paid packs |

| Ignore |
|--------|
| Pure canvas zero-Phaser renderer |
| Farm/pirate themes, heavy simulation engine |

## Hard Keep constraints (non-negotiable)

- 32×32 (and multiples) hard pixels, shared fortress palette  
- Map never invents agent work — MCP is SOT  
- `approve_spec` / `unlock_room` require `confirm=true`  
- No second gateway  
