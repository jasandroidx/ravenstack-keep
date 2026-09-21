# AGENTS.md — Ravenstack Keep

## Non-negotiable rules

- Hetzner-owned Keep; survive without Grok VM.
- Build order: A0 inventory → A1 shift board + rooms (NO AI) → A2 async phi4-mini bubbles.
- Ollama speech later: http://172.18.0.1:11434 — never localhost.
- Never Funnel. Never invent bot work. Never block UI on model calls.
- No gemma4/14B for bubbles. No secrets in free-model context.
- Smallest reversible change. Evidence before claims. Ask before gateway/Ollama restarts.

---

> **MANDATORY FIRST STEP FOR ANY AGENT/LLM/TOOL** touching this repo: load and obey
> `/root/obsidian_vault/Ravenstack/RAVENSTACK-ORACLE.md` +
> `/root/obsidian_vault/Ravenstack/RAVENSTACK-ARCHITECTURE.md`. These rules supersede
> everything below. This repo is part of the same fortress as `ReClaw-2.0` — see that
> repo's own `AGENTS.md` for fortress-wide rules (honesty, outbox delivery, confirm=true
> gating), and its **Universal to-do / open threads** section for what's currently
> deferred across the whole fortress, not just this repo.
>
> **⚠ BROKEN POINTER, verified 2026-09-14:** neither `RAVENSTACK-ORACLE.md` nor
> `RAVENSTACK-ARCHITECTURE.md` exists at that path anymore, in either vault directory
> (`/root/obsidian_vault` or `/root/obsidian-vault` — both exist, unreconciled, likely
> from a reorg). The `Ravenstack/architecture/ravenstack-keep/` doc set referenced below
> is also gone. Don't act as if you've read them — you can't. Say so, and use the live
> system (this repo, `systemctl`, `docker ps`) as ground truth instead of vault prose
> until this is repaired. This is on the fortress-wide to-do list.

**Architecture SOT — currently broken, see warning above.** Was meant to be
`Ravenstack/architecture/ravenstack-keep/` in the vault (`Architecture - Overview.md`,
`Architecture - mcp.md`, `Architecture - Key decisions.md`).

**Corrected 2026-09-21, verified firsthand — do not revert to the old claim below:**
the live Keep (`https://openclaw.tail20a090.ts.net:8120/` → `:8130`) is served by
`ravenstack-keep-ui.service`, now pointing at **this checkout**
(`/root/ravenstack-keep/ui-v2`, branch `ravenstack`), running the **built Nitro server**
(`ui-v2/.output/server/index.mjs`, `NITRO_PRESET=node-server` build — dev `vite` was
retired from the live box 2026-09-21 because dev mode shipped ~12MB of unbundled JS per
page). The box update loop for UI changes is: push → `git pull --ff-only` in
`/root/ravenstack-keep/ui-v2` → `npm run build:box` → `systemctl restart
ravenstack-keep-ui`. Plain `npm run build` still targets the Vercel preset and does
**not** update `:8120`. The unit also gets its non-URL env from an
`EnvironmentFile=` drop-in pointing at `ui-v2/.env` (same env dev mode used).

<details>
<summary>Stale claim this replaced (kept for history, do not follow)</summary>

The URL everyone calls "the live Keep" was served by a `vite dev` process running out of
a separate git worktree (`/root/worktrees/ravenstack-keep-painted`, branch
`painted-hall-box`). That worktree was retired 2026-09-14 — it no longer exists.

</details>

---

## What this is

The fortress's visual command layer: a spatial map of six rooms (`great-hall`,
`alchemy-lab`, `library`, `armory`, `observatory`, `vault`), each with an occupant
agent, rendered as an interactive scene. It is a narrow, purpose-built visualization —
not a second copy of general fortress state. General ops (docker, git, sitrep, vault
read/write, county queue) live in `reclaw-platform-mcp` (ReClaw-2.0, `:8100`); Keep
owns exactly the spatial/presence layer, in its own SQLite DB.

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
npm run build:box              # Nitro node-server build → ui-v2/.output — THIS is
                                # what :8130/:8120 serve (see update loop below)
npm run build                  # production bundle for the Vercel preset — does NOT
                                # update the live box
```

Restart the live services after a change: `systemctl restart ravenstack-keep-mcp
ravenstack-keep-http` (and separately handle the UI — `ravenstack-keep-ui.service`
runs the built server, so it needs a **rebuild** first: `git pull --ff-only && npm
run build:box && systemctl restart ravenstack-keep-ui`).

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

## Boundaries

- Do not touch `ui/` (the old 48×48 tile pipeline) — frozen, per `ACTIVE.md`. Current
  work happens in `ui-v2/`.
- Gated tools (`approve_spec`, `unlock_room`) require `confirm=true` from an explicit
  human ask — never wire an auto-approve path.
- No Dockerfile — this runs bare-metal by design, alongside `reclaw-platform-mcp` and
  `reclaw-outbox` on the same host. See the ADR in `Architecture - Key decisions.md`
  before proposing containerization.
- Known, tracked bugs (player doesn't walk, chat boxes don't work, the dual-UI /
  `:8080` vs `:8120` room-model mismatch, staleness/polling issues) are catalogued in
  `Ravenstack/ideas/keep-remediation-work-order-2026-08-15.md` — check there before
  re-diagnosing from scratch.
