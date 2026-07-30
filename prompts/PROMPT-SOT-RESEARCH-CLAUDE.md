# Prompt: SOT research for Ravenstack Keep (assign to Claude)

**Assignee:** Claude (Cowork / Desktop preferred — you already saw the Drive docs)  
**Not for:** Grok chat (tunnel flaky; incomplete Drive), Gemini (use Gemini for the *organization* pass instead)  
**Scope:** Source of truth for rooms, agents, map coordinates, and inter-agent protocol **only**. Do not implement MCP servers. Do not redesign reclaw-platform.

---

## Why you

You already inventoried nine Drive specs that conflict with the repo blueprint and the live Oracle/vault. This task needs careful multi-source synthesis and a **single decisive recommendation**, not more brainstorming.

---

## Paste this to Claude

```text
You are the sole owner of the Ravenstack Keep SOURCE OF TRUTH (SOT) decision.

## Mission
Reconcile conflicting Keep specs and recommend ONE SOT model for rooms, agents, desks/coordinates, and A2A protocol — with a migration path from what exists today. Do not implement code. Do not expand into cost tooling or OpenClaw gateway redesign.

## Context (facts)
- Operator: one person, tight budget, Hetzner ReClaw fortress already live.
- Live ops MCP: reclaw-platform on Tailscale :8100 (sitrep, vault, queue, docker) — out of scope to replace.
- New plane: ravenstack-keep MCP (rooms, Agent Specs, scoped knowledge, gates) — may use PROVISIONAL map seeds until you decide.
- Repo: github.com/jasandroidx/ravenstack-keep (or local ~/ravenstack-keep)
  - Blueprint: RAVENSTACK-KEEP-BLUEPRINT-v0.2.md
  - Agent Spec schema: schemas/agent-spec.schema.json
  - Only full Agent Spec on disk today: agents/oracle.agent-spec.json (status=draft)
  - Provisional map: mcp/seeds/castle_map.provisional.json (merged blueprint + Drive coords — NOT final)
- Drive (you found earlier) includes among others:
  - Ravenstack Keep Architecture & Technical Resource Guide (v2.0)
  - Roundtable Orchestrator Architecture Specification (v1.0)
  - Fortress Inter-Agent Communication Protocol (A2A) Specification (v1.0.0)
  - Keep Spatial Layout & Coordinate Map Specification (v1.0)
  - Phaser / dashboard TypeScript notes
  - RAVENSTACK-ORACLE.md / ARCHITECTURE (also live in vault as SOT for fortress knowledge)
- Known tension:
  - Blueprint v0.2 rooms: Orchestrator, Clawforge (live), Oracle / Scribe Warden / Flipper (unforged); Clawforge = meta agent forge.
  - Drive spatial map: clawforge, oracle, scribe, suno_studio, lead_forge + agents raziel-main, clawsmith-compiler, silent-auditor, content-scriptwriter, suno-audio-gen, gatekeeper-proxy; Clawforge = execution room.
  - Vault Oracle remains SOT for fortress knowledge ops, not necessarily for Keep room IDs.

## Hard constraints
1. One operator — no multi-team process theater.
2. Low cost — prefer fewer sources of truth, not more sync jobs.
3. Agent Spec JSON (+ schema) is the unit of “agent is real.”
4. No draft-to-execute: specs/rooms unlock only via human gates.
5. Keep MCP must not invent A2A traces or room health.
6. Prefer Tailscale-private Keep; public tunnel is not a SOT concern.

## Research steps
1. Open and compare the Drive docs listed above + vault RAVENSTACK-ORACLE.md + repo blueprint + provisional castle_map.
2. Build a conflict table: entity (room_id, agent_id, lock_state, coordinates, protocol message types) × sources × disagreement.
3. Evaluate at least three SOT models:
   A) Vault/Oracle-centric (docs in Obsidian win; code/seeds generated from vault)
   B) Repo-centric (git ravenstack-keep wins; Drive is archival; vault mirrors after ingest)
   C) Hybrid (repo owns machine-readable Agent Specs + castle_map.json; vault owns narrative Oracle; Drive frozen or imported once)
   D) (Optional) Your better model if A–C are wrong — justify.
4. Pick ONE model. Be decisive. “It depends” is only allowed as a short migration phase with an end date.

## Deliverable (single markdown memo)
Title: KEEP-SOT-DECISION.md

Required sections:
1. Executive decision (5–10 lines): the winning SOT model in plain English.
2. Conflict table (the real disagreements that forced the choice).
3. Canonical IDs: final list of room_id values and agent_id values for v1 (mark UNFORGED vs live).
4. File locations: exact paths that become canonical (e.g. agents/*.agent-spec.json, mcp/seeds/castle_map.json, vault paths).
5. What to demote: which Drive docs become historical; which blueprint sections to rewrite.
6. Migration steps: ordered, reversible, ≤10 steps; who runs each (human / Grok Build / ingest).
7. MCP implications: which Keep tools read which files (no new tool invention unless essential).
8. Kill criteria: when this SOT decision itself should be revisited.
9. Explicit non-goals.

## Quality bar
- Prefer boring and enforceable over clever.
- If Drive spatial map and blueprint Clawforge meanings conflict, resolve Clawforge naming (meta-forge vs room) explicitly.
- Do not recommend auto-sync of three systems forever.
- Do not put PII or jailbreak/persona PDFs into Keep SOT.

## Out of scope
- Implementing FastMCP tools
- Cost ledger / OpenRouter wiring
- County queue / reclaw-platform changes
- Phaser sprite art

When done, return only the memo (KEEP-SOT-DECISION.md body). If a Drive file is missing, say what you lacked and decide with available evidence.
```

---

## After Claude returns

- Human reviews memo  
- Grok Build applies: rewrite `castle_map` seed, align room_ids, update blueprint § rooms  
- Re-run Keep MCP tests  
