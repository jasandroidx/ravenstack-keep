# AGENTS.md — Ravenstack Keep

> **MANDATORY FIRST STEP FOR ANY AGENT/LLM/TOOL** touching this repo: load and obey
> `/root/obsidian_vault/Ravenstack/RAVENSTACK-ORACLE.md` +
> `/root/obsidian_vault/Ravenstack/RAVENSTACK-ARCHITECTURE.md`. These rules supersede
> everything below. This repo is part of the same fortress as `ReClaw-2.0` — see that
> repo's own `AGENTS.md` for fortress-wide rules (honesty, outbox delivery, confirm=true
> gating). This file only covers what's specific to Ravenstack Keep.

**Architecture SOT — read before changing anything non-trivial:**
`Ravenstack/architecture/ravenstack-keep/` in the vault (`Architecture - Overview.md`,
`Architecture - mcp.md`, `Architecture - Key decisions.md`). This file stays short on
purpose and points there instead of duplicating it — if what's below and what's in the
vault disagree, the vault is more likely to have drifted; check both against the live
system before trusting either.

**Known-fragile fact, worth internalizing before you touch the UI:** the URL everyone
calls "the live Keep" (`https://openclaw.tail20a090.ts.net:8120/`) is served by a
`vite dev` process running out of a **separate git worktree**
(`/root/worktrees/ravenstack-keep-painted`, branch `painted-hall-box`), not out of this
checkout. Pushing to `origin/ravenstack` from here does **not** update what the operator
sees at `:8120` — see `Architecture - Overview.md` for the full picture. If you're asked
to fix something visible in the browser, find and check that worktree, not just this repo.

---

## Project Purpose

Ravenstack Keep is the visual command layer, progressive agent forge, and multi-model Round Table for a personal AI operations fortress (OpenClaw / ReClaw 2.0). It acts as a persistent, embodied 16-bit cyber-arcane fortress spatial map, rejecting ephemeral chatbot windows. Agents are first-class residents in dedicated chambers, communicating across an async FastMCP bridge (`:8100` / `:8110`), and operating across a hybrid topology (local edge compute + remote VPS).

The fortress's visual command layer: a spatial map of six rooms (`great-hall`, `alchemy-lab`, `library`, `armory`, `observatory`, `vault`), each with an occupant agent, rendered as an interactive scene. It is a narrow, purpose-built visualization — not a second copy of general fortress state. General ops (docker, git, sitrep, vault read/write, county queue) live in `reclaw-platform-mcp` (ReClaw-2.0, `:8100`); Keep owns exactly the spatial/presence layer, in its own SQLite DB.

## Non-Negotiable Operational Laws

1. **Branch of truth is `ravenstack`**. Always work on this branch.
2. **Sovereign Local-First / Zero-Token Bias**: Routine tasks must prioritize local Ollama inference on the Gatehouse node. Reserve paid cloud models exclusively for high-reasoning synthesis.
3. **The Oracle Truth Standard**: Zero tolerance for hallucination. Factual assertions must be grounded in primary-source receipts. Never invent file paths, APIs, or system configurations.
4. **Smallest Reversible Changes**: Propose minimal, targeted diffs and non-destructive scripts.
5. **Modern Tooling**: Use `docker compose` (v2), `FastMCP` (async Python), and type-safe TypeScript.
6. **Knowledge Metabolism**: Ingest via structured distillation into atomic notes. No raw PDF vector dumps.
7. **Human gates are permanent**: Any approval action (`approve_spec`, `unlock_room`, etc.) requires explicit `confirm=true` from a human. Never auto-approve.
8. **Kill conditions are mandatory** on every Agent Spec.
9. **Paper until live**: Occupancy is labeled "paper" until `KEEP_PULSE_URL` live API is bound. Never invent idle chips when data is paper.

## Tech Stack & Architecture Topology

- **Gateway**: Port `:18789` (OpenClaw gateway)
- **ReClaw 2.0 API**: Port `:8000` (FastAPI agent hub)
- **FastMCP Fortress Bridge**: Port `:8100` (ReClaw platform), Keep MCP on Port `:8110` / `:8111`, HTTP on `:8112` / `:8120`.
- **Edge Compute**: Local Ollama on port `:11434`.
- **Backend / MCP (`mcp/`)**: Python FastMCP server, Python 3.11+, SQLite DB (`keep.db`). Dependencies managed via `uv` or `pip` (`requirements.txt`).
- **Frontend (`ui-v2/`)**: React 19, Vite, TypeScript, TanStack Router/Query/Start, Tailwind CSS v4, PGlite local database auth, and Phaser 3 canvas.
- **Legacy Frontend (`ui/`)**: Frozen Phaser 48x48 tile engine. **Do not touch or revive.**

## The two backend services and how they relate

- **`ravenstack-keep-mcp`** (`mcp/src/server.py`, `127.0.0.1:8111`) — the actual MCP
  tool surface (`list_rooms`, `get_castle_map`, `report_agent_status`, gated
  `approve_spec`/`unlock_room`, spatial context compaction, etc.). This is what
  Grok Build / Claude / OpenClaw call as an MCP server.
- **`ravenstack-keep-http`** (`mcp/src/http_api.py`, `127.0.0.1:8112`) — a thin REST
  wrapper reading/writing the *same* SQLite file directly (not by calling the MCP
  server) so a browser can poll plain HTTP instead of speaking MCP/JSON-RPC.
- Both are separate from **`reclaw-platform-mcp`** (ReClaw-2.0, `:8100`) — that's the
  general fortress operator surface (sitrep, docker, git, vault, county queue). Keep's
  MCP is scoped to the six-room spatial/presence model only.

Full request/response flow and the tool inventory: `Architecture - mcp.md` in the vault.

## How to actually run it (real commands, not guessed)

Three independent processes, normally managed by systemd — see unit files at
`/etc/systemd/system/ravenstack-keep-{mcp,http,ui}.service` for the exact env vars each
one runs with.

**MCP tool server** (room/agent/gate state, `mcp/data/keep.db`):
```bash
cd /root/ravenstack-keep/mcp
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
KEEP_MCP_TRANSPORT=http KEEP_MCP_HOST=127.0.0.1 KEEP_MCP_PORT=8111 \
  OBSIDIAN_VAULT=/root/obsidian_vault .venv/bin/python src/server.py
```
(Note: `server.py`'s own default is `KEEP_MCP_PORT=8110` — the live systemd override
sets `8111`. Don't trust the in-code default over `systemctl cat ravenstack-keep-mcp`.)

**HTTP/REST API** (same `keep.db`, plain REST for a browser — *not* a second control
plane, see its own docstring):
```bash
cd /root/ravenstack-keep/mcp
KEEP_HTTP_HOST=127.0.0.1 KEEP_HTTP_PORT=8112 KEEP_MCP_DATA=/root/ravenstack-keep/mcp/data \
  OBSIDIAN_VAULT=/root/obsidian_vault .venv/bin/python src/http_api.py
```
(Same in-code-default-vs-live-override gap: source defaults to `8120`, systemd runs it
on `8112`.)

**UI** (`ui-v2/`, the current painted-hall skin — the old `ui/` is frozen, see below):
```bash
cd /root/ravenstack-keep      # or the live worktree, see the warning above
npm install                    # workspaces: root package.json → ui-v2
npm run dev                    # vite dev, default port 3000 (ui-v2/vite.config.ts)
                                # — the live :8130 process overrides this with an
                                # explicit `--port 8130` CLI flag, see systemd unit
npm run build                  # production bundle — NOT what :8120 currently serves
```

Restart the live services after a change: `systemctl restart ravenstack-keep-mcp
ravenstack-keep-http` (and separately handle the UI worktree — restarting
`ravenstack-keep-ui.service` only picks up changes already present in that worktree's
checkout).

## Coding Conventions

- **TypeScript / React**:
  - Follow existing type-safe conventions and use standard hooks.
  - Test files run via Node's native test runner (`--experimental-strip-types`). **Explicitly include `.ts` or `.mjs` extensions when importing relative modules** (e.g., `import { cn } from "./cn.ts";`).
  - Do not replace `pnpm test` or `npm test` with `bun test`.
  - For styling, use Tailwind CSS v4 variables configured via `@theme` directly in `ui-v2/src/styles.css`. No `tailwind.config.ts`.
  - For custom interactive UI badges (like 16-bit themed elements), ensure keyboard accessibility explicitly: `role="button"`, `tabIndex={0}`, `onKeyDown` handlers (Space/Enter), and `focus-visible` styling.
- **Python / MCP**:
  - Use `ruff` for linting.
  - Follow the existing `mcp/src/server.py` and `mcp/src/http_api.py` conventions.
  - Do not hardcode secret tokens, Funnel paths, or raw IPs as public.
- **Palette & Aesthetic**:
  - Maintain the 9-color 16-bit cyber-arcane palette: Void (`#0b0e14`), Stone (`#1e222b`, `#3a3f4b`, `#4a5568`), Cyan (`#2de2e6`), Magenta (`#ff2a6d`), Amber (`#ffc857`), Toxic Green (`#39ff14`), Red Alert (`#ff3b3b`).
  - Never regenerate the main map unless provided a new painting by Jason.
  - Walkers must look like they came from the same painting as Raziel. Recolor only. Native map height.
- **Documentation**:
  - If acting as 'Palette' (UX/a11y), document learnings in `.jules/palette.md` as `## YYYY-MM-DD - [Title]\n**Learning:** [insight]\n**Action:** [apply]`.
  - If acting as 'Bolt' (Performance), document learnings in `.jules/bolt.md` using the same format. Add comments explaining optimizations.

## Test Commands and Pre-Commit Checks

Before opening a PR, ensure the following pass:

### Frontend (`ui-v2`)
Strictly use `pnpm` for local dev commands inside the `ui-v2` directory.
```bash
cd ui-v2
pnpm install  # (Do not unintentionally commit pnpm-lock.yaml unless requested)
pnpm lint     # Runs eslint
pnpm test     # Runs Node native tests
pnpm typecheck
pnpm build
```
*Note: Avoid running `pnpm format` as it writes globally. Use `npx prettier --write <filepath>` on modified files.*

### Backend (`mcp`)
```bash
cd mcp
ruff check src        # Linting
python3 -m pytest     # Run python tests (if pytest is configured/available)
```

## `castle_map.json` — read carefully, there are three different files with this name

- **This repo's live spatial state is NOT a JSON file** — it's the SQLite DB at
  `mcp/data/keep.db`, owned by `mcp/src/server.py`. Change it through the MCP tools
  (`report_agent_status`, `unlock_room`, etc.), not by hand-editing anything.
- `ui/public/castle_map.json` and `ui/dist/castle_map.json` are static fallback files
  belonging to the **frozen** old `ui/` pipeline (see `ACTIVE.md`: "do not revive").
  They are not read by anything live.
- `/root/ReClaw-2.0/data/castle_map.json` is a **different, unrelated file** in the
  other repo, used by ReClaw-2.0's own dashboard tools (`get_keep_state` /
  `update_room_state` in `reclaw_platform_mcp_server.py`). Do not confuse the two —
  the fortress-wide rule "never alter castle_map.json coordinates blindly" applies to
  *that* file, and separately, by extension of the same caution, to any hand-edit of
  this repo's `keep.db` room coordinates outside the MCP tools.

## Boundaries and Areas Not to Touch

- **`ui/`**: The old 48x48 procedural tiles pipeline is **frozen forever**, per `ACTIVE.md`. Never revive or extend it. Current work happens in `ui-v2/`.
- Gated tools (`approve_spec`, `unlock_room`) require `confirm=true` from an explicit human ask — never wire an auto-approve path.
- No Dockerfile — this runs bare-metal by design, alongside `reclaw-platform-mcp` and `reclaw-outbox` on the same host. See the ADR in `Architecture - Key decisions.md` before proposing containerization.
- Known, tracked bugs (player doesn't walk, chat boxes don't work, the dual-UI / `:8080` vs `:8120` room-model mismatch, staleness/polling issues) are catalogued in `Ravenstack/ideas/keep-remediation-work-order-2026-08-15.md` — check there before re-diagnosing from scratch.
- **`agents/` and `mcp/`**: These are the machine Source of Truth. Do not overwrite without explicit review findings.
- **Live pulse faking**: Never invent live status if `fetchKeepPulse` fails or `KEEP_PULSE_URL` is paper.
