# Keep MCP (skeleton)

**Status:** Phase 1 **contract only** — no full server implementation in this commit.  
**Goal:** A dedicated streamable-http MCP surface for Ravenstack Keep so UIs, local agents, Claude Desktop, Grok, and Round Table clients can list rooms, report status, read specs, query **scoped** knowledge, and see cost summaries without knowing internal ReClaw ports.

Blueprint: [RAVENSTACK-KEEP-BLUEPRINT-v0.2.md](../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md) §4.2.

## Why a separate MCP?

| Need | Keep MCP role |
|------|----------------|
| Room / agent status for the visual Keep | `list_rooms`, `report_agent_status` |
| Specs as the unit of reality | `get_agent_spec` |
| Enforce knowledge seeds | `query_scoped_knowledge` |
| Cost attribution (before Phase 4 full governance) | `get_cost_summary` |
| Later forge loop | `propose_agent_spec`, `approve_spec`, `unlock_room` (out of Phase 1) |

Existing **reclaw-platform** remains the fortress ops connector (sitrep, vault RW, pipeline). Keep MCP is a **thin control plane** on top — it may call reclaw-platform or local stores, but clients should not re-implement room/spec policy.

## Phase-1 tools (exactly five)

See **[tools.md](./tools.md)** for full input/output contracts.

1. `list_rooms`
2. `report_agent_status`
3. `get_agent_spec`
4. `query_scoped_knowledge`
5. `get_cost_summary`

Aliases noted in the blueprint (`get_room`, `list_agent_specs`) can be added later; Phase 1 implements the five names above.

## Suggested transport

| Item | Choice |
|------|--------|
| Protocol | **MCP over streamable-http** (same pattern as reclaw-platform on `:8100`) |
| Default bind | Tailnet-only, e.g. `http://100.x.x.x:8110/mcp` (port TBD; do not collide with 8100) |
| Health | `GET /health` → `{ "status": "ok", "service": "ravenstack-keep", "transport": "streamable-http" }` |
| Local dev | stdio optional for Grok Build / CLI tests; production path is HTTP |

## Auth approach (Tailscale-first)

1. **Preferred:** Listen only on the Tailscale interface (or bind `127.0.0.1` + Tailscale serve). Identity = presence on the tailnet. No public Cloudflare quick tunnel for v0.
2. **Secondary:** Shared API key / bearer token in `Authorization` header for non-Tailscale automation (document rotation; store in env, never in git).
3. **Not for v0:** Open public internet without auth. If a tunnel is ever required, treat the URL as secret and add auth first.

Mutating tools (`report_agent_status`) are low-risk status writes. Future approve/forge tools must stay **gated** (`confirm=true` + human intent), never draft-to-execute.

## State store for v0 (simplest possible)

Use **one SQLite file** (recommended) or a small directory of **JSON files** under `mcp/data/` (gitignored):

| Entity | SQLite table / JSON file | Fields (minimal) |
|--------|---------------------------|------------------|
| rooms | `rooms` / `rooms.json` | `room_id`, `name`, `lock_state`, `occupant_agent_id`, `updated_at` |
| agent_status | `agent_status` / `status/<id>.json` | `agent_id`, `state`, `task`, `confidence`, `session_id`, `updated_at` |
| specs | read-only files from repo `agents/*.agent-spec.json` | no duplicate source of truth in v0 |
| cost_events | `cost_events` / `cost.jsonl` | `ts`, `agent_id`, `tier`, `model`, `est_usd`, `note` |

SQLite wins if you want one file and easy summaries; JSONL for costs is fine either way. **Do not** invent a multi-service database for Phase 1.

## Suggested layout (implement in a later session)

```
mcp/
├── README.md          # this file
├── tools.md           # tool contracts
├── data/              # gitignored runtime state (SQLite or JSON)
├── src/               # future: FastMCP (or equivalent) server
│   └── server.py
└── pyproject.toml     # or package.json — choose one stack later
```

Implementation notes for the next session:

- Start from the proven reclaw-platform FastMCP + streamable-http pattern.
- Load Agent Specs from `agents/*.agent-spec.json`; validate with `schemas/agent-spec.schema.json` on read.
- `query_scoped_knowledge` must refuse indexes not listed on the calling agent’s `knowledge_seeds`.
- Every agent defaults to local; cost summary may be empty zeros until Phase 4 wiring.
- Kill conditions are **not** auto-executed by MCP; they are data for humans / Orchestrator policy later.

## Non-goals (this skeleton)

- Full working server process
- UI / sprites
- Clawforge approve loop
- Round Table integration
- Public exposure
