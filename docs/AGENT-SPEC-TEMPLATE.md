# Agent Spec Template

**Status:** Phase 1 template — fill every section before an agent is considered real.  
**Companion schema:** [`schemas/agent-spec.schema.json`](../schemas/agent-spec.schema.json)  
**Source of truth:** [RAVENSTACK-KEEP-BLUEPRINT-v0.2.md](../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md) §3.2

Rules:

- One agent = **one purpose sentence**. Two sentences → two agents.
- **model_tier** defaults to `local`. Paid tiers are opt-in and must be justified.
- **kill_condition** is mandatory. No kill condition → no forge.
- **No draft-to-execute.** Specs and generated skills land on disk for human approval first.
- Prefer scoped knowledge (`self` / `domain` / `longtail`). Never seed `general` indexes.

Copy this file to `agents/<slug>.md` (and a matching JSON under `agents/` if you maintain both).

---

```yaml
# --- frontmatter (maps 1:1 to the JSON Schema) ---
spec_version: "1.0"
id: "<slug>"                     # kebab-case, unique in the Keep
status: draft                    # draft | approved | live | retired
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: Jason
```

## name

Human-readable agent name.

## character

Short identity / voice (1–3 sentences). Who is this agent in the Keep?

## room

| Field | Value |
|-------|--------|
| room_id | `<room-slug>` |
| room_name | Display name |
| lock_state | `UNFORGED` \| `live` \| `locked` |

## purpose

**One sentence only.** What job does this agent exist to do?

## model_tier

| Field | Value | Notes |
|-------|--------|--------|
| default | `local` | Required default for every new agent |
| allowed | `[local]` or `[local, escalate]` etc. | God mode only with operator intent |
| local_model_hint | e.g. `phi4-mini` / `gemma4` | Preference only; runtime may remap |
| escalate_when | (optional) | When local failed validation / low confidence |
| god_mode | never by default | Explicit operator toggle only; cost shown first |

## tools

List every tool this agent may call. Prefer Keep MCP + existing reclaw-platform reads.

| Tool | Source | Read/Write | Notes |
|------|--------|------------|-------|
| `example_tool` | keep-mcp \| reclaw-platform \| other | read \| write | … |

## skills

| Kind | Name | Notes |
|------|------|-------|
| existing (ClawHub / installed) | … | reuse first |
| forge-must-write | … | quarantine + human approval before install |

## knowledge_seeds

Narrow indexes only (blueprint §3.4 / §4 knowledge layer).

| Index | Allowed? | Scope notes |
|-------|----------|-------------|
| `self` | yes/no | operator decisions, project state, architecture, past specs |
| `domain` | yes/no | proprietary / scraped / harvested data |
| `longtail` | yes/no | obscure manuals, version-specific docs |
| `general` | **no** | skip / bin — do not retrieve what models already know |

Optional: explicit vault paths or topic globs this agent may read (still must map to an allowed index).

## triggers

| Type | Detail |
|------|--------|
| on-demand | yes/no — default for specialists |
| event | e.g. `AgentEvent`, handoff received |
| cron | **avoid paid models**; local only if used; justify |

## handoffs

| Direction | Target agent / room | When | Payload expectations |
|-----------|---------------------|------|----------------------|
| outbound | … | … | … |
| inbound | … | … | … |

## human_gates

Actions that **must not** run without explicit operator approval.

- …
- …

Hard permanent gates (never remove): spending money, installing skills, forging new agents, advancing frozen pipelines, any draft-to-execute path.

## kill_condition

**Mandatory.** When should this agent be retired, locked, or unforged?

Write a concrete, testable condition (not “if unused”). Examples of good form:

- “Retire if three consecutive success-test failures against live RAG.”
- “Retire if monthly attributed cost exceeds $X without operator override.”
- “Retire if purpose overlaps >70% with a newer live agent after human review.”

## success_criteria

How do we know this agent is working? Measurable, preferably runnable tests.

1. …
2. …

## example_queries / test cases

3–5 concrete prompts (or tasks) used to validate the agent.

1. …
2. …
3. …

## notes

Optional: security notes, non-goals, links to related vault docs, Open questions.

---

### Validation checklist (reviewer)

- [ ] purpose is exactly one sentence
- [ ] model_tier.default is `local`
- [ ] kill_condition is present and concrete
- [ ] knowledge_seeds does not include `general`
- [ ] human_gates include permanent hard gates where relevant
- [ ] no draft-to-execute language
- [ ] schema validates (`ajv` / `check-jsonschema` against `schemas/agent-spec.schema.json`)
