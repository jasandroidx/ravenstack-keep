---
date: 2026-07-29
author: Grok (xAI) — research partner session
type: research
topic: Round Table feasibility + kill architecture + skills inventory + Phase 1 review
status: ready for review
blueprint_refs: ["§6", "§3.2", "§4.2", "§12", "§13"]
files_reviewed:
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
  - "reviews/findings/2026-07-29-grok-phase1-session.md"
  - "docs/AGENT-SPEC-TEMPLATE.md"
  - "schemas/agent-spec.schema.json"
  - "agents/oracle.md"
  - "agents/oracle.agent-spec.json"
  - "mcp/README.md"
  - "mcp/tools.md"
  - "reviews/README.md"
  - "reviews/INDEX.md"
---

# Finding: Round Table research, kill architecture refinements, skills priorities, and Phase 1 artifact review

## Summary

Grok Build’s Phase 1 deliverables are high quality and tightly aligned with the blueprint. The Oracle Spec, Agent Spec template + schema, and Keep MCP tool contracts are ready for operator review and other AIs. Parallel research confirms Roundtable.sh as the best first Round Table implementation, strengthens the kill-condition model into *kill architecture*, and produces a clear skills install/build priority list. Multi-agent cost data (~15× token multiplier) strongly validates the local-first + monthly ceiling design.

## What I read

- Full Phase 1 session handoff and all delivered artifacts listed above.
- Live research on Roundtable.sh (frontier-infra), Agent Mind Bridge, multi-agent cost studies (Anthropic + 2026 papers), agent sprawl / kill-switch literature, and ClawHub patterns (agent-bus and related).

## Findings (facts)

### Phase 1 artifacts
- Oracle Spec is correctly scoped to `self` only, local-only, citation-first, with a concrete three-part kill condition and a strong negative test case.
- Schema correctly forbids `general` indexes and requires `kill_condition` + local default.
- Keep MCP five-tool contracts are precise, Tailscale-first, and correctly defer forge/approve/execute tools.
- The new `reviews/` folder + TEMPLATE + INDEX is exactly the durable multi-AI collaboration surface the project needed.

### Round Table
- **Roundtable.sh** (frontier-infra): one-line install, native `roundtable mcp serve`, advisory + multi-round deliberation with Claude chair, six optional heads (Grok, Claude, Gemini, OpenAI, GLM, MiniMax), MIT, fully local on user API keys. Best fit for high-stakes one-shot design questions.
- **Agent Mind Bridge**: 59 tools, shared projects/threads/memory, handoffs, sprint board, SQLite + streamable-http. Better for ongoing multi-session collaboration than one-shot councils.
- OpenRouter Fusion / multi-model council patterns remain the lowest-friction cost-controlled option using existing strategy docs.
- Free-form multi-agent chat does not scale; structured dispatch + shared minutes + human chair is the workable pattern.

### Cost & sprawl reality (2026)
- Widely cited figure: multi-agent systems ~15× tokens vs a single chat; single agents ~4×. Token usage itself often explains most of the performance variance.
- Agent sprawl is now recognized as a production risk (models/frameworks added faster than retired).
- Group-level (or hierarchical) budgets outperform pure per-agent limits for cost control.

### Kill architecture vs kill criteria
- Criteria = *when* to stop (already in our Spec).
- Architecture = *how* stop is enforced independently of the agent (credential revocation, removal from Orchestrator registry, quarantine of skills, network isolation where relevant). Literature emphasizes that many organizations have criteria on paper but no tested mechanism.

## Pushback / risks

1. **Oracle 90-day unused clause** is reasonable but soft. Prefer weighting quality-failure + consolidation more heavily; unused can be a secondary signal.
2. Schema currently has no explicit `kill_mechanism` or `budget_ceiling` field. Adding lightweight optional fields would harden the design without scope creep.
3. Round Table must stay expensive-by-default (paid seats invited only). Ambient multi-model chatter would violate the cost rules.
4. Do not let the reviews folder become a second place where decisions are “approved.” Human gate remains final; findings are proposals.

## Recommendations

1. **Accept Phase 1 artifacts** after operator skim; keep Oracle `status: draft` until the five test queries are smoke-tested against live RAG.
2. **First Round Table implementation**: Roundtable.sh MCP (or thin OpenRouter multi-model skill) for v0; Mind Bridge only if persistent multi-day threads become necessary.
3. **Strengthen Agent Spec template** (next small PR):
   - Optional `kill_mechanism` (how termination is enforced).
   - Optional `budget_ceiling` / group budget reference.
   - Optional `success_metrics` (already partially covered by success_criteria).
4. **Skills priority** (install then build):
   - Install/evaluate: `agent-bus`, any solid cost trackers, status-report patterns.
   - Build: keep-status-reporter → scoped-rag-query → cost-guardian → clawforge-helper → roundtable-invoker.
5. **CI**: validate all `agents/*.agent-spec.json` against the schema on every PR (already on the Phase 1 backlog — endorse).

## Open questions for the operator / other AIs

1. Confirm or trim the Oracle 90-day unused kill clause.
2. Preferred first Round Table vehicle: Roundtable.sh, pure OpenRouter council skill, or wait?
3. Keep MCP host preference for v0: Hetzner vs laptop-as-node?
4. Any objection to adding optional `kill_mechanism` + `budget_ceiling` fields to the schema/template?

## Concrete next steps (for the next AI)

- [ ] Smoke-test the five Oracle queries via reclaw-platform and record pass/fail + citations in a short finding.
- [ ] Draft a one-page Roundtable.sh integration note (`docs/roundtable-v0.md`) or a thin `roundtable-invoker` skill outline (draft only).
- [ ] Propose the two optional schema fields above in a focused finding or tiny PR (do not expand Phase 1 scope).
- [ ] Seed `mcp/data/rooms.seed.json` proposal (Orchestrator + Clawforge live; Oracle/Scribe/Flipper UNFORGED) without implementing the server.

## Kill conditions / cost notes (if proposing anything new)

- Any `roundtable-invoker` skill: default to local/advisory seats; paid heads require explicit operator flag + cost preview; monthly ceiling still stops paid calls.
- No new agent proposed in this finding.

---

*Local-first. Kill conditions mandatory. Human gates permanent. Round Table for hard questions only.*
