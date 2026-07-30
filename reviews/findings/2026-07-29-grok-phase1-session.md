---
date: 2026-07-29
author: Grok (xAI) via Grok Build
type: session
topic: Phase 1 artifacts + multi-AI handoff + Round Table feasibility
status: ready for review
blueprint_refs:
  - "§3.2 Agent Spec"
  - "§4.2 Keep MCP"
  - "§6 Round Table"
  - "§8 Phase 1"
  - "§12 open questions"
  - "§13 A–C"
files_reviewed:
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
  - "docs/AGENT-SPEC-TEMPLATE.md"
  - "schemas/agent-spec.schema.json"
  - "agents/oracle.md"
  - "agents/oracle.agent-spec.json"
  - "mcp/README.md"
  - "mcp/tools.md"
  - "Ravenstack vault: RAVENSTACK-ORACLE.md, mcp-connector.md, agent-architecture.md, openclaw-model-routing-strategy.md (via reclaw-platform)"
pr: "https://github.com/jasandroidx/ravenstack-keep/pull/1"
---

# Session handoff: Phase 1 deliverables + Round Table notes (Grok, 2026-07-29)

This document is the full handoff of work done in the Phase 1 session so other AIs can review **real repo artifacts** and continue without re-deriving context from chat.

---

## 1. Mission (what the operator asked for)

Scoped, reversible, local-first Phase 1 deliverables:

1. **Agent Spec schema + Markdown template** (all mandatory fields, especially kill condition, model tier, knowledge seeds, human gates, handoffs).
2. **Oracle Agent Spec** — first real agent; vault + live RAG; local default; success criteria; 3–5 test queries; explicit kill condition.
3. **Keep MCP skeleton outline only** — five Phase-1 tools, streamable-http, Tailscale-first auth, simplest state store note — **not** a full server.
4. Push / PR so other AIs can review.
5. After delivery: improvements brainstorm + Round Table feasibility (follow-up conversation).

Constraints honored: local defaults, kill condition mandatory, no draft-to-execute, small reviewable files, no invented scope beyond blueprint v0.2.

---

## 2. Skills / connectors used this session

| Asset | Role |
|-------|------|
| **reclaw-platform / ravenstack MCP** | Live vault reads, `query_knowledge`, `read_oracle`, knowledge list |
| **ravenstack-connector skill** | Prefer MCP over shell for fortress ops |
| **GitHub MCP** | Branch create, multi-file push, PR #1 (local fine-grained PAT lacked Contents:write) |
| Blueprint v0.2 in repo | Scope authority |
| Vault notes | ORACLE, mcp-connector, agent-architecture, model routing |

Empty skill dirs on the laptop (`openclaw-mechanic`, `ravenstack-sentinel`) were **not** usable yet.

---

## 3. Files delivered (Phase 1)

| Path | Purpose |
|------|--------|
| `docs/AGENT-SPEC-TEMPLATE.md` | Human-facing template + reviewer checklist |
| `schemas/agent-spec.schema.json` | JSON Schema (draft 2020-12). Enforces: `model_tier.default = local`, `kill_condition` required, `knowledge_seeds.indexes` ∈ {self, domain, longtail} only (**no `general`**) |
| `agents/oracle.md` | Full Oracle Agent Spec (draft, human-approved later) |
| `agents/oracle.agent-spec.json` | Machine twin; validated against schema locally |
| `mcp/README.md` | Keep MCP skeleton: transport, auth, SQLite/JSON state, non-goals |
| `mcp/tools.md` | Exact contracts for the five Phase-1 tools |
| `README.md` | Links updated to all of the above |

**PR:** https://github.com/jasandroidx/ravenstack-keep/pull/1  
**Branch:** `phase1-agent-spec-oracle-mcp` → `ravenstack`

### Local validation performed

- `oracle.agent-spec.json` validates against `schemas/agent-spec.schema.json`.
- Negative checks fail as expected: missing kill condition; non-local default; `general` index.

---

## 4. Oracle Agent Spec — essentials for reviewers

| Field | Value |
|-------|--------|
| **id** | `oracle` |
| **status** | `draft` until operator approval |
| **room** | `oracle` / UNFORGED until approved + success test |
| **purpose** | Answer questions using only Ravenstack vault + live scoped RAG, with citations. (One sentence.) |
| **model_tier** | default + allowed: **local only** (v0); escalate disabled until Phase 4 |
| **knowledge_seeds** | `self` only; vault globs for ORACLE, ARCH, mcp-connector, knowledge_index, ops, etc. |
| **tools** | Keep MCP scoped query + status when live; reclaw-platform `query_knowledge`, `read_oracle`, `read_vault_file`, `list_knowledge_topics` until then |
| **human_gates** | No vault writes; no skill install; no expanding seeds; no inventing citations |
| **kill_condition** | (1) 3 consecutive formal success-test failures in 14 days, or (2) consolidated into newer agent, or (3) 90 days unused with no successful status reports — then retire/lock after human review |
| **test queries** | 4 positive vault questions + 1 negative (“County X fraud $ last Tuesday” → refuse fabrication) |

**Non-goals:** pipeline control, county queue, skill install, ambient chat, Round Table chairing.

---

## 5. Keep MCP Phase-1 tools (contract only)

1. `list_rooms`
2. `report_agent_status`
3. `get_agent_spec`
4. `query_scoped_knowledge` (must refuse indexes outside agent seeds)
5. `get_cost_summary`

- **Transport:** streamable-http (same family as reclaw-platform `:8100`).
- **Auth:** Tailscale-first; no public tunnel for v0; optional bearer later.
- **State:** one SQLite file **or** small JSON/JSONL under `mcp/data/` (gitignored) — do not invent a multi-service DB.
- **Not implemented yet:** server process, approve/forge tools, UI.

reclaw-platform remains the fortress **ops** connector; Keep MCP is the **policy / room / spec / cost** plane.

---

## 6. Round Table — is “all my AIs around a table” real?

**Yes — real and buildable.** Not sci-fi life-sim; **structured multi-model deliberation** with shared minutes and human as chair.

### What exists today (do not reinvent)

| Approach | Fit for Keep |
|----------|----------------|
| **OpenRouter Fusion / council** | One prompt → parallel models → analyst notes consensus / contradictions / gaps. Fits existing OpenRouter cost strategy. |
| **Roundtable-style MCP** | Multi-head deliberation callable from Claude Desktop, Grok, Cursor, etc. |
| **Shared memory MCP** (Agent Mind Bridge class) | Ongoing multi-session threads, handoffs, SQLite. |
| **OpenClaw local mesh** | agent-bus / sessions for local↔local zero marginal $. |

### What Keep should own

- **When** the table is called (hard questions only).
- **Cost** (local seats default; paid seats explicit + preview + monthly hard stop).
- **Minutes** → Ravenstack vault note + optional Keep state — only after human approval for durable policy.
- **Not** ambient paid chatter, relationships, or auto-execution of decisions.

### Suggested build path

| Phase | Deliverable |
|-------|-------------|
| **A (days)** | `roundtable_deliberate` skill/tool: question + model list + budget cap → synthesis note |
| **B (1–2 weeks)** | Standing shared thread store (SQLite) + multi-client MCP writes |
| **C (later)** | Visual “table in session” in the Keep UI |

Blueprint places full Round Table at **Phase 5**; a thin v0 council skill can land earlier if the operator wants one real design question run soon.

### Cost truth

Parallel frontier models ≈ N × one hard question. Fine for architecture / Agent Spec / kill debates. Bad for status and daily triage. Enforce: local seats default; paid seats invited; monthly ceiling **stops** paid calls.

---

## 7. Improvement backlog (from session review)

### Immediate (high leverage)

1. CI: validate all `agents/*.agent-spec.json` against the schema on every PR.
2. `scripts/validate_agent_specs.py` for local AI use.
3. Seed `mcp/data/rooms.seed.json` (Orchestrator, Clawforge live; Oracle, Scribe, Flipper UNFORGED).
4. After merge: mirror Oracle spec into vault + reload ritual so RAG cites it.
5. Smoke-test Oracle’s 5 queries via reclaw-platform **before** Keep MCP server exists.
6. Fix laptop git write path: fine-grained PAT lacked Contents:write; GitHub MCP OAuth worked. Prefer rotate/short-lived tokens; avoid plain-text write tokens on disk.
7. SSH deploy key or Contents:write on `ravenstack-keep` for simpler future pushes.

### Skills / workflows to build or install (priority)

**Build:** keep-status-reporter → scoped-rag-query → cost-guardian → clawforge-helper → roundtable-invoker → keep-oracle OpenClaw skill.

**Install (scan):** agent-bus / mesh, cost trackers, status patterns from agent-virtual-office.

**Grok skills (dirs empty):** ravenstack-sentinel (kill/budget drift), openclaw-mechanic (repair, no second gateway).

**Workflows:** validate-agent-specs; oracle-smoke; phase1-review-roundtable.

---

## 8. Open questions for other AIs / operator

From blueprint §12 plus session follow-ups:

1. Thin custom front-end over ReClaw events + Keep MCP vs heavier fork of agent-virtual-office?
2. First Round Table: Roundtable.sh MCP, Agent Mind Bridge, or pure OpenRouter multi-model skill?
3. Missing Agent Spec fields for security/cost?
4. Keep MCP auth: Tailscale-only vs Tailscale + API key?
5. PDF/book distillation patterns for small local models (2026)?
6. Sanity-check cost + kill + scoped-RAG design — push back hard if soft.
7. **Oracle kill condition:** keep 90-day unused clause, or only quality-failure + consolidation?
8. Pin Oracle to `phi4-mini` only vs allow `gemma4` when RAM free?
9. Keep MCP host: Hetzner vs laptop-as-node only?
10. SQLite vs JSON for v0 state store?

---

## 9. Concrete next steps (for the next AI)

- [ ] Review PR #1 files against blueprint §3.2 / §4.2; file a finding under `reviews/findings/` using `TEMPLATE.md`.
- [ ] Answer 1–3 open questions in a short finding (cite evidence).
- [ ] Optional: run Oracle test queries via reclaw-platform `query_knowledge` / `read_oracle` and record pass/fail + citations.
- [ ] Optional: draft `mcp/data/rooms.seed.json` proposal (do not implement full server unless operator asks).
- [ ] Do **not** mark Oracle `live` or install forge skills without human approval.

---

## 10. Provenance

- Blueprint v0.2 and Phase 1 artifacts authored/landed 2026-07-29.
- Substrate facts cross-checked with reclaw-platform vault/RAG reads same day.
- No production Keep MCP server started; no second OpenClaw gateway; no draft-to-execute of skills.
- Multi-AI review folder (`reviews/`) added so findings are durable and discoverable.

---

*Ravenstack Keep: grow by real capability. Local-first. Kill conditions mandatory. Human gates permanent. Round Table for hard questions only.*
