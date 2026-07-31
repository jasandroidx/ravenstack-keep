# Skill outline: agent-spec-drafter

**Status:** draft outline only — not installed  
**Owner skill of:** Clawforge  
**Policy:** forge-must-write → human approval before any install  
**Date:** 2026-07-31

---

## Purpose

Produce a schema-valid Keep Agent Spec JSON (`status: draft` only) from an operator idea, with overlap and cost notes. Never set approved/live. Never install skills or unlock rooms.

## Inputs

- Idea text (required)
- Optional: target `room_id`, constraints, "must reuse X"
- Optional: research packet from Researcher (cited notes)

## Outputs

1. `agents/<id>.agent-spec.json` (status=`draft`)
2. Short overlap report (existing Specs/SOULs that collide)
3. Provision checklist (files/coords only — not applied)
4. Operator handoff line: path + what to approve

## Steps

1. **Normalize purpose** to exactly one sentence. If two jobs appear → stop and ask operator to split.
2. **Scan existing agents**
   - `ravenstack-keep/agents/*.agent-spec.json`
   - ReClaw `agents/*/SOUL.md` and pipeline roles
   - Flag purpose overlap > rough threshold; recommend merge/kill/scope change.
3. **Fill Spec fields** per `schemas/agent-spec.schema.json`
   - `model_tier.default` = `local` always
   - `kill_condition` mandatory and concrete
   - `human_gates` include permanent gates (spend, skill install, draft-to-execute, forge)
   - `knowledge_seeds` never include `general`
4. **Map tools** to minimum set (prefer reclaw-platform + keep-mcp reads; gated writes only)
5. **Skills block**
   - `existing`: reuse first
   - `forge_must_write`: list only; do not create installable skill files in this skill
6. **Validate** against schema (ajv / check-jsonschema or equivalent). On fail → fix or escalate once.
7. **Write draft only** — never change status to approved/live.
8. **Handoff** to operator. Report status `waiting_approval`.

## Forbidden

- Setting status to approved or live
- Writing OpenClaw runtime config
- Changing castle_map lock_state
- Installing or enabling skills
- Paid model defaults or ambient cron with paid tiers
- Inventing citations or tools that do not exist

## Research dependency

When domain facts are missing (ToS, external tool behavior, best-practice agent patterns):

- Emit a structured **research request** to Researcher / Research Scout
- Wait for cited packet OR note "research incomplete" and still draft with explicit gaps
- Clawforge does not replace continuous operator research jobs

## Success tests

- [ ] Output JSON validates against `agent-spec.schema.json`
- [ ] status is `draft`
- [ ] purpose is one sentence
- [ ] overlap report present even if "none found"
- [ ] handoff asks for explicit operator approval

## Install policy

This file is documentation. A real OpenClaw/ClawHub skill may be written later from this outline only after Jason approves Clawforge and this skill.
