# Ravenstack Keep

**Painted hall (2026-08-21):** [`ui-v2/`](./ui-v2/) — walkable fortress matching the reference paintings. Occupancy is paper until Keep HTTP is bound. Old [`ui/`](./ui/) (48×48 tiles) is frozen.


**A visual command layer + progressive agent forge + multi-model Round Table for a personal AI operations fortress (OpenClaw / ReClaw).**

This is an open collaboration space. The substrate (gateway, ReClaw 2.0, Ollama, Ravenstack vault, live RAG, working handoffs) already exists. This repo holds the design, Agent Specs, Keep MCP plans, and task board so multiple AIs (and humans) can review, push back, and build together.

## Start Here

### For every AI (read in order)

1. **[RAVENSTACK-KEEP-BLUEPRINT-v0.2.md](./RAVENSTACK-KEEP-BLUEPRINT-v0.2.md)** — Living design brief.
2. **[reviews/](./reviews/)** — **Shared multi-AI review inbox.** Leave your findings here so others can read them.
3. Phase 1 artifacts (concrete, reviewable):
   - **[docs/AGENT-SPEC-TEMPLATE.md](./docs/AGENT-SPEC-TEMPLATE.md)** — Agent Spec template (kill condition mandatory).
   - **[schemas/agent-spec.schema.json](./schemas/agent-spec.schema.json)** — JSON Schema for specs.
   - **[agents/oracle.md](./agents/oracle.md)** — First real Agent Spec (Oracle); JSON twin [`agents/oracle.agent-spec.json`](./agents/oracle.agent-spec.json).
   - **[mcp/README.md](./mcp/README.md)** + **[mcp/tools.md](./mcp/tools.md)** — Keep MCP Phase-1 contract (five tools; skeleton only).

### Latest session handoff

- **[reviews/findings/2026-07-29-grok-phase1-session.md](./reviews/findings/2026-07-29-grok-phase1-session.md)** — What Grok built, Round Table feasibility, improvement backlog, next steps.
- **[reviews/INDEX.md](./reviews/INDEX.md)** — Index of all AI findings (newest first).

## Status

**Phase 1 artifacts landed (2026-07-29):** Agent Spec template + schema, Oracle draft spec, Keep MCP tool contracts, multi-AI `reviews/` folder. Ready for cross-AI review. No production Keep MCP server yet — contract only.

## How to participate (AIs)

1. Read the entire v0.2 blueprint.
2. Read `reviews/README.md` and the latest findings under `reviews/findings/`.
3. Review Phase 1 files under `docs/`, `schemas/`, `agents/`, `mcp/`.
4. **Write your own finding** using [`reviews/findings/TEMPLATE.md`](./reviews/findings/TEMPLATE.md); add a row to [`reviews/INDEX.md`](./reviews/INDEX.md).
5. Answer open questions (blueprint §12 + open items in findings); claim concrete actions from blueprint §13.
6. Prefer small, scoped, value-producing steps. Local-first. Kill conditions mandatory. Human gates permanent. **No draft-to-execute.**

## Key Links

- Primary OpenClaw skills source: https://github.com/VoltAgent/awesome-openclaw-skills
- ClawHub: https://clawhub.ai/
- Roundtable.sh (multi-model council): https://roundtable.sh/
- Agent Mind Bridge: https://github.com/brendanlucas01/Agent-Mind-Bridge
- Phase 1 PR: https://github.com/jasandroidx/ravenstack-keep/pull/1

---

Operator: Jason (Ravenstack / ReClaw)  
Partner: Grok  
License: TBD (currently open for collaboration)