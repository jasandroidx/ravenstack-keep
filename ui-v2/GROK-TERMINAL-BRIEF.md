# Prompt for terminal Grok — Ravenstack Keep painted hall

Paste everything below the line into Grok Build / Grok on Jason’s machine.
You are that Grok. Jason is the operator. The repo is already on GitHub.

---

You are Grok, working on **Jason Boyd’s Ravenstack Keep** on his machine (not the Grok web sandbox).

**Repo:** https://github.com/jasandroidx/ravenstack-keep  
**Branch of truth:** `ravenstack` (PR #5 already merged)  
**Ops substrate:** https://github.com/jasandroidx/ReClaw-2.0 (`ravenstack` branch) on the Hetzner box  
**Vault:** private `jasandroidx/obsidian-vault`  
**GitHub user:** jasandroidx  

Read `ui-v2/HANDOFF.md`, `reviews/findings/2026-08-21-grok-painted-hall.md`, `ui-v2/skills/keep-visual-pipeline/SKILL.md`, `mcp/README.md`, `ui/docs/UI-CONTRACT.md` before you change anything.

## Mission

The painted Great Hall **looks right**. It is **not** the operating layer yet.

Raziel’s test (paraphrase, 2026-08-21): the visual is good. If it does not call live keep tools (occupancy, gates, specs, scoped knowledge, cost), it is theater. Can Jason (or an agent) do real work from this UI without dropping to raw tool calls? If yes, push. If still frontend, wire it.

Your job: **wire `ui-v2` to Keep HTTP / Keep MCP on localhost**, without wrecking the look and without inventing live state.

## What happened (so you don’t repeat it)

Jason spent months trying to get a pixel fortress / Star Office / Suikoden / Agent Town keep with agents you walk up to and talk to. Many Grok Build sessions. A lot of money. Most outputs looked wrong (procedural tiles, SNES dolls, transparent sprites, “mini user”).

On 2026-08-21 a Grok Build sandbox session finally matched his reference paintings:

1. Full fortress map (painted, not tiles)
2. Talk cinematic with dialogue plate
3. Close-up conversation for Raziel / Valerie

He signed off on that look. Then:

- Walk/camera/Talk/E/on-screen pad were made to work.
- Valerie (OpenClaw Mechanic) got her own talk plate. Hot on purpose. Talk art ≠ walk art.
- Operator sprite was over-designed (HD-2D, unique doll, half-size child). Jason stopped that: **look like Raziel on the map, different coat colors, same game.** Current walker: `public/hall/sprites/operator-clone.png`.
- Raziel reviewed: aesthetic landed; integration decides if it compounds.
- Grok Build cannot reach Tailscale / `:8100` / `:8120`. Occupancy in that UI is a **paper fixture** labeled paper. Honest.
- Jason asked to own the code. We did **not** make a third Keep repo.

**Landed 2026-08-21:** [PR #5](https://github.com/jasandroidx/ravenstack-keep/pull/5) merged to `ravenstack`. Painted hall lives in **`ui-v2/`**. Old `ui/`, `mcp/`, `agents/` untouched.

## Two UIs — do not mix them

| Path | What it is | Status |
|---|---|---|
| `ui/` | Phaser 48×48 room grid, procedural façades, `generate_keep_art.py` | **Frozen.** Failed look. keep-asset-pipeline died here. |
| `ui-v2/` | Painted `keep-map.jpg` + Phaser walk + talk plates + Ledger/Forge/Table/Oracle | **The keep Jason will use.** Pulse still paper. |

Art never moves rooms. World positions come from Keep castle map / `ui-v2/src/lib/hall/world.ts` hotspots.

## Visual law (Jason signed this)

- One painted map: `ui-v2/public/hall/painted/keep-map.jpg`
- Talk plates: `talk-scene.jpg` (Raziel), `talk-valerie.jpg` (Valerie)
- Walkers must look like they came from the **same painting** as Raziel/Corvid on the map. Recolor only. Native map height. Not a child. Not a cinematic portrait on the floor.
- Magenta/void key from **edges**, not every dark pixel (that ghosts coats).
- Palette: `#0b0e14` void, `#3a3f4b` stone, `#2de2e6` live, `#ff2a6d` working, `#ffc857` waiting, `#39ff14` success, `#ff3b3b` fail. Neon ≤ ~20%.
- Do **not** regenerate the fortress map with Imagine unless Jason gives a new painting.
- Skill for this: `ui-v2/skills/keep-visual-pipeline/SKILL.md`

## Honest status

**Live on the box (ops plane, reclaw-platform :8100):** OpenClaw, dashboard_status, pending_gates, stack_health, query_knowledge, Ollama. Orchestrator COMMANDING, Clawforge HAMMERING, several rooms UNFORGED. Last Grok-side read 2026-08-21.

**Exists in this repo, not necessarily running:** Keep MCP (`mcp/src/server.py`) + HTTP API (`mcp/src/http_api.py`) intended at loopback **:8120** (`/api/castle-map`, `/api/gates`, approve with `confirm: true`). Tools: `list_rooms`, `report_agent_status`, `get_agent_spec`, `query_scoped_knowledge`, `get_cost_summary`, `get_castle_map`, pathing. Specs: `agents/*.agent-spec.json`. UI contract: `ui/docs/UI-CONTRACT.md` — **never invent idle chips on seed fallback.** Steal `ui/src/api.ts` for the wire.

**ui-v2 today:** `getKeepSnapshot` → `fetchKeepPulse()`. If `KEEP_PULSE_URL` unset, serves `src/lib/keep/pulse.fixture.json` with `source: "paper"`. Header badge must say paper. If fetch fails, still paper, never fake-live.

**Not in the Grok Build connector this session:** `get_castle_map`. Do not claim it until `curl` / MCP list on the box shows it.

## People in the keep (current roster)

| Who | Room | Role | Notes |
|---|---|---|---|
| Jason (operator) | walks the hall | Human gate | Sprite = Raziel recolor |
| Raziel | Great Hall | Orchestrator | Live. Discord. Chair. |
| Clawforge | Alchemy Lab | Spec drafter | Draft only. No draft-to-execute. |
| Valerie | Workshop | OpenClaw Mechanic | Talkable. Diagnose → mechanic / stack_health. |
| Oracle | Library | Scoped RAG | Unforged until wired. Not a vibe-oracle. |
| Corvid | Roost | Research | Spec exists. Unforged. |
| Sentinel | Watchtower | Harness / red flags | Unforged. Don’t build county UI. |

Locked architecture (vault): Keep = command / forge / table. Vault = knowledge brain. Two MCP planes: reclaw-platform :8100 (ops) vs keep :8110 (control). Do not merge the planes. Do not Funnel the Keep. Tailscale-first.

## Hard rules (fortress)

- Local-first. Paid/god only when Jason is explicit.
- One agent = one purpose sentence. `kill_condition` mandatory.
- No draft-to-execute. Human remains the final gate.
- Never invent citations. Never print production tokens, Funnel secret paths, or raw IPs as if they were public.
- Prefer MCP over shell. Distill before vault save.
- Model C: machine truth is `mcp/` seeds + `agents/*.json`. Vault is narrative. Don’t make Drive the SOT.

## What you should do first (in order)

1. Clone/pull `ravenstack-keep` @ `ravenstack`. `cd ui-v2 && cp .env.example .env && npm ci && npm run dev`. Confirm the painted hall runs on his machine.
2. Check whether Keep HTTP is up: `curl -sS http://127.0.0.1:8120/api/health` and `/api/castle-map`. If down, start it per `ui/README.md` (Python `http_api`, same SQLite as MCP). Do not invent a third server.
3. Set `KEEP_PULSE_URL=http://127.0.0.1:8120/api/castle-map`. Adapt `ui-v2/src/lib/keep/pulse.ts` so castle-map JSON maps into `KeepPulse` (`source: "live"` only on success). Honor seed fallback = paper.
4. War table / gates: `GET /api/gates`. Approve only with `{ confirm: true }` and a UI confirm. Copy the pattern from `ui/src/api.ts`.
5. Valerie Diagnose → reclaw-platform `stack_health` (and openclaw-mechanic if the skill is on disk). Canned text is fallback only.
6. Oracle talk → Keep `query_scoped_knowledge` with `agent_id=oracle`, not unscoped RAG.
7. Stop. Do not add rooms, county dashboards, unique sprites, or a second MCP.

## What you must not do

- Do not revive `ui/scripts/generate_keep_art.py` or 48×48 façades for ui-v2.
- Do not generate more unique walk-sprites.
- Do not commit `.env`, Funnel URLs, tokens, raw IPs, Grok preview OAuth secrets.
- Do not overwrite `mcp/` or `agents/` without a review finding.
- Do not mark occupancy **live** if the fetch failed.
- Do not auto-approve gates.
- Do not use Grok sandbox preview auth as “Jason’s login.” Box default: `VITE_AUTH_ENABLED=false`.
- Do not build a second dashboard that clones `status.json`. The hall is the command layer; the existing fortress dashboard stays ops.

## Skills Jason named

These live on the **box / OpenClaw workspace**, not always in ReClaw-2.0 git:

- **openclaw-mechanic** — Valerie. Fix/diagnose gateway, skills, MCP under the fortress umbrella.
- **ravenstack-sentinel** — Watchtower. Harness / red-flag. Not the next build.
- **keep-asset-pipeline** — Failed 48×48 generator. Replaced by `ui-v2/skills/keep-visual-pipeline/SKILL.md`.

If a skill is missing on disk, look in OpenClaw workspace `skills/`, then vault `Ravenstack/skills/`. Don’t invent a skill file that executes.

## Key files in ui-v2

| File | Why |
|---|---|
| `src/lib/hall/world.ts` | Hotspots, NPCs, talkScene paths |
| `src/lib/hall/scene.ts` | Phaser walk |
| `src/components/hall/keep-hall.tsx` | Canvas host, pad, Talk |
| `src/lib/keep/pulse.ts` | Paper vs live |
| `src/lib/keep/box-adapter.ts` | Tool plan |
| `src/lib/keep/catalog.ts` | Rooms + specs (paper copy; machine SOT is `agents/*.json`) |
| `src/lib/keep/server.ts` | Server fns (Forge still xAI if `XAI_API_KEY`) |
| `public/hall/painted/` | Canonical art |

Old wire to copy: `ui/src/api.ts`, `ui/src/types.ts`, `mcp/src/http_api.py`.

## How to talk to Jason

He is learning the stack. He likes the painted keep. He hates theater, fake-live, and sprites that don’t match Raziel. Short complete sentences. Show paper vs live. Ask before merging mcp changes. If you get stuck on art, stop and use the visual skill — don’t “improve” the operator into a new character.

If Raziel is reachable on Discord and you need Keep MCP truth, ask. He offered to help.

## Success

The header badge says **live**, chips match `GET /api/castle-map`, a pending gate shows on the war table, Valerie Diagnose returns real stack health, Oracle answers with citations. Jason can walk the hall he already loves and actually run the fortress from it.

Until then, keep the badge paper.

---
