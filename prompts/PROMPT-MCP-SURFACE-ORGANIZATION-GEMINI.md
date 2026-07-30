# Prompt: MCP surface organization (assign to Gemini)

**Assignee:** Gemini (large context — inventory + architecture)  
**Not for:** Grok chat (use for live sitrep later, not mega-inventory)  
**Scope:** How all tools and connectors should be organized end-to-end — even if that means “start over” on structure. Do **not** re-litigate room/agent SOT (Claude owns that). Do **not** implement servers.

---

## Why Gemini

This pass needs to hold many tool lists at once: ~40 reclaw-platform tools, Keep MCP v0 (~30 tools), OpenClaw skills surface, Grok connectors, and client entrypoints. Large context + structure tables are the point.

---

## Paste this to Gemini

```text
You are the architect for Ravenstack / ReClaw MCP surface organization.

## Mission
Design the cleanest, most efficient organization of ALL MCP tools and connections for a one-person AI ops fortress. Prefer clarity and least privilege over “one mega server.” You may recommend starting over on packaging/naming if justified. Produce a concrete target architecture and a migration plan.

## Fixed decisions (do not reopen)
1. Two planes (already chosen):
   - reclaw-platform = fortress ops (sitrep, docker, county queue, vault RW, connector, health)
   - ravenstack-keep = Keep control plane (rooms, Agent Specs, scoped knowledge, human gates, A2A read, rituals)
2. No draft-to-execute. Gated tools use confirm=true.
3. Keep is Tailscale-first; public quick tunnels are a liability.
4. Section E (cost event pipeline / budget_remaining / model_routing_policy tools) is DEFERRED — plan the slot, do not design the full ledger now.
5. SOT for room/agent IDs is owned by a separate Claude memo — use placeholder “canonical room_id/agent_id from SOT memo” rather than inventing a third roster.

## Inputs to analyze (use whatever you can access; mark gaps)
- Keep architecture: docs/ARCHITECTURE-MCP-SPLIT.md
- Keep tool contracts: mcp/tools.md (update may lag; also list tools from Keep server if provided)
- Blueprint: RAVENSTACK-KEEP-BLUEPRINT-v0.2.md § MCP
- SuperGrok connector guide patterns (public URL vs Tailscale vs stdio)
- reclaw-platform tool surface (~40 tools): sitrep, project_sitrep, morning_digest, docker_status, openclaw_health, reclaw_health, county_queue_*, pipeline_status, inspect_session, query_knowledge, read_vault_file, write_vault_file, ingest_to_ravenstack, connector_status, public_mcp_url, git_*, list_packages, etc.
- Clients: Grok chat (public HTTPS only), Grok Build local (Tailscale or stdio), Grok Build on Hetzner (stdio), Claude Desktop, future Phaser Keep UI, OpenClaw agents
- Security: public MCP currently no auth; vault path sandbox; never auto-approve county or forge gates

If you cannot call live reclaw-platform, work from names above and say “live inventory unverified.”

## Questions you must answer
1. Is the two-server split right, or should Keep be a *package/namespace inside* reclaw-platform with hard policy middleware? Pros/cons for this operator.
2. How should tools be named/prefixed across clients (ravenstack-keep__list_rooms vs list_rooms)?
3. Which reclaw tools (if any) should be *removed, aliased, or frozen* to reduce bloat?
4. Which Keep tools should stay vs merge (e.g. list_rooms vs get_castle_map)?
5. What is the minimum tool set for: (a) morning phone check on SuperGrok, (b) Keep UI poll loop, (c) Oracle agent answering, (d) forge approval day?
6. Connection matrix: client × plane × transport × auth. Include failure modes (quick tunnel rotate, bridge crash).
7. Event/A2A: who writes, who reads, where stored — without inventing a second bus if logs already exist.
8. “Start over” option: if greenfield MCP layout tomorrow, what are the 2–3 servers/packages and their tool caps (max tools each)?
9. Evaluation plan: 10 questions that prove the organization works (not just that a tool returns JSON).

## Deliverable
Title: MCP-SURFACE-ORGANIZATION.md

Sections:
1. Decision summary (one page max)
2. Target architecture diagram (mermaid or ASCII)
3. Tool catalog tables: Keep vs reclaw vs deferred — with action: keep / move / merge / delete / gate
4. Client connection playbooks (SuperGrok, Build laptop, Build server, UI)
5. Anti-bloat rules (hard rules the implementer must not violate)
6. Migration plan (phased, reversible; include “if start over” path)
7. Risks & kill criteria for the organization itself
8. Open questions only if they block implementation (≤5)

## Quality bar
- Ruthless simplification. If a tool is “nice” but unused weekly, mark delete or defer.
- Do not solve SOT roster conflicts.
- Do not propose unauthenticated public exposure of Keep.
- Prefer read tools free; writes/gates explicit.
- One operator cognitive load is the #1 metric.

Return only the markdown memo.
```

---

## After Gemini returns

- Human + Grok Build: reconcile with Claude SOT memo  
- Apply naming/merge decisions to Keep MCP + reclaw docs  
- Cap tool growth with the anti-bloat rules  
