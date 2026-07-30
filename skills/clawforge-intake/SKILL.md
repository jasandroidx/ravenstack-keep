---
name: clawforge-intake
description: >
  Interrogate a new agent idea and draft an Agent Spec for Ravenstack Keep.
  Never auto-provisions rooms or installs skills. Draft → backlog only.
  Triggers: "clawforge", "new agent", "draft agent spec", "forge an agent".
---

# Clawforge intake (Skill prototype)

## Hard rules

1. **No draft-to-execute.** Output is markdown + JSON draft only.
2. Save under `backlog/agent-specs/<id>.agent-spec.draft.json` (or propose content for human to save).
3. Default **model_tier.default = local**; paid tiers only with justification.
4. **kill_condition** is mandatory.
5. Check **overlap** with existing roster (oracle + candidates in `mcp/seeds/castle_map.json`).
6. Do not unlock rooms or set `status: live`.

## Interview (ask if missing)

1. **Purpose** — one sentence job?
2. **Room** — existing room_id or new UNFORGED room?
3. **Triggers** — on_demand / events / cron? (no paid cron)
4. **Success** — 2–4 measurable tests?
5. **Knowledge seeds** — self / domain / longtail? Never `general`.
6. **Human gates** — what must wait for the operator?
7. **Kill condition** — when do we retire this agent?

## Output

1. Filled Agent Spec from `docs/AGENT-SPEC-TEMPLATE.md` / `schemas/agent-spec.schema.json`.
2. Short overlap note vs existing agents.
3. Suggested next human step: `approve_spec` (confirm) then `unlock_room` (confirm) via Keep MCP — never auto.

## Tools (when Keep MCP available)

- `list_agent_specs`, `get_castle_map`, `list_rooms` — context only
- `propose_agent_spec` — write draft to backlog with confirm of human intent
- Never call `approve_spec` / `unlock_room` unless the human explicitly asks with confirm.
