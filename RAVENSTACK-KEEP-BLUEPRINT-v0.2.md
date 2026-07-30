---
title: Ravenstack Keep — Project Blueprint v0.2
version: 0.2 (expanded for multi-AI review + implementation)
date: 2026-07-29
owner: Jason (Ravenstack / ReClaw) + Grok partner
status: active design — ready for cross-AI review and task delegation
tags: [ravenstack, keep, agents, blueprint, mcp, round-table, clawforge, openclaw]
previous: v0.1 (2026-07-29) — original design brief
---

# Ravenstack Keep

**A visual command layer + progressive agent forge + multi-model round table for a personal AI operations fortress.**

This document is the living design brief. It is written so any AI (Claude, Gemini, Grok, Perplexity, local models, etc.) can review it, push back honestly, and accept delegated tasks. The substrate already exists and is running. This is the next layer.

---

## 0. How to use this document (for reviewing AIs)

- Operator is **one person**. Budget is **tight**. Low cost is a hard constraint.
- Backend (OpenClaw gateway + ReClaw 2.0 + Ollama + Ravenstack vault + live RAG + working handoffs) **already exists**.
- Honest pushback is required. If something is wrong, over-engineered, or high-risk, say so.
- After review, tasks will be delegated. Prefer concrete, scoped, reversible proposals.
- Primary sources for skills: https://github.com/VoltAgent/awesome-openclaw-skills and https://clawhub.ai/
- OpenRouter strategy already exists in the project (artifacts/openrouter-strategy/).

Open questions and proposed next actions are in Sections 12–14.

---

## 1. One-paragraph description (updated)

Ravenstack Keep is the visual + progressive + collaborative command layer on top of a working personal AI operations stack. Specialized agents live in named rooms. Each has a defined job, tools, scoped knowledge indexes, model tier, kill condition, and human gates. The operator opens the Keep, sees live status, and delegates. New agents are created through **Clawforge**: idea → interrogation → Agent Spec draft → hard human approval → provision. Empty **UNFORGED** rooms are visible and unlock as real capability grows. The Keep also hosts a **Round Table** so multiple frontier models (Grok, Claude, Gemini, Perplexity, etc.) and local agents can deliberate on the same issues with shared context. Everything defaults to local/free models; paid escalation is explicit, logged, and budget-capped.

---

## 2. What already exists (verified live substrate, 2026-07-29)

| Component | State |
|---|---|
| Host | Hetzner VPS, Ubuntu, ~51 GB free |
| OpenClaw gateway | Docker, healthy, 7d+ uptime, port 18789 |
| ReClaw API | v2.0.0, healthy, port 8000 |
| Dashboard | healthy, port 8081 |
| MCP connector | streamable-http, port 8100, bridge + tunnel active |
| Network | Tailscale (100.108.130.82), Cloudflare quick tunnel |
| Local inference | Ollama (gemma4, phi4-mini, qwen3:1.7b, llama3.1:8b + cloud variants) |
| Knowledge | Obsidian vault, 121+ Ravenstack notes, RAG live via POST /rag/search |
| Agent handoffs | Working: analyst → researcher → content_studio |
| Existing rooms (canonical) | **8 rooms** per [KEEP-SOT-DECISION.md](./KEEP-SOT-DECISION.md): **live** `orchestrator`, `clawforge`; **UNFORGED** `oracle`, `scribe`, `auditor`, `lead_forge`, `suno_studio`, `flipper`. Coordinates in `mcp/seeds/castle_map.json`. |
| Agents “real” | Only schema-valid `agents/*.agent-spec.json` at `status ≥ approved`. Today: `oracle` is **draft** only; other roster names are candidates (no spec). |
| Client | Ubuntu laptop, Claude Desktop / Pro available |
| OpenRouter strategy | Documented, cost tiering playbooks exist |

**Design implication:** Keep is front-end + routing/spec + progression + multi-model deliberation layer. Risk is in the new layer, not the foundation. Machine-readable Keep truth lives in this **repo**; vault Oracle remains narrative fortress SOT only.

---

## 3. Core concepts (confirmed + expanded)

### 3.1 The Room
Named home for an agent. Fields: name, occupant, live status, lock state (`UNFORGED` | live | locked). UNFORGED rooms advertise future capability and unlock through real growth.

### 3.2 The Agent Spec (unit of reality)
Mandatory fields:
- name / character
- room
- purpose (one sentence)
- model tier: `local` (default) | `escalate` | `god`
- tools (MCP endpoints, browser, filesystem, APIs)
- skills (ClawHub existing vs forge-must-write)
- knowledge seeds (which narrow RAG indexes it may query)
- triggers (cron / event / on-demand)
- handoffs
- human gates
- **kill condition** (mandatory — only defense against sprawl)

### 3.3 Clawforge
Factory loop:
1. Operator idea
2. Interrogation (trigger, success criteria, overlap)
3. Draft Agent Spec to disk (never draft-to-execute)
4. Hard human approval gate
5. Write skills, provision room, wire tools, seed knowledge, register with Orchestrator
6. Room → live

Security: quarantine directory, no execute, static analysis, human review of every generated skill.

### 3.4 Knowledge layer (confirmed principle)
**Do not retrieve what the model already knows. Retrieve what it can’t.**

Narrow indexes only:
- `self` (operator decisions, project state, past specs) — highest value
- `domain` (proprietary / scraped / harvested data)
- `longtail` (obscure manuals, version-specific docs, undigitized material)
- `general` — skip / bin

Agent Spec declares which indexes an agent may query. Structured distillation > raw dumps (KARE-RAG style).

### 3.5 Cost model (non-negotiable)
| Tier | Default | Use |
|------|---------|-----|
| Local | Ollama on Hetzner | All routine, ambient, triage, drafting |
| Escalate | Cheap API (DeepSeek-class via OpenRouter) | Local failed validation / low confidence |
| God | Frontier (explicit only) | Operator-triggered high-stakes, cost shown first |

Rules: every agent defaults local; no ambient paid chat; every paid call attributed; monthly ceiling stops calls; audit cron agents on paid models.

---

## 4. Decision: Own repo + Own MCP

### 4.1 Spin off `ravenstack-keep` repo — YES
- Keep is a distinct layer (UI + specs + progression + Round Table).
- Avoids polluting the core OpenClaw/ReClaw monorepo.
- Clean path to open-source later if desired.
- Matches pattern of successful visual agent projects.

Proposed structure (initial):
```
ravenstack-keep/
├── README.md
├── docs/ (this blueprint + Agent Spec schema)
├── mcp/ (Keep MCP server — streamable-http)
├── schemas/ (Agent Spec, Room, Event)
├── ui/ (rooms dashboard — later)
├── skills/ (Clawforge helpers, status reporter, cost guardian)
├── forge/ (interrogation + draft logic)
└── roundtable/ (integration adapters)
```

### 4.2 Keep MCP — YES, dedicated server
Advantages:
- Clean tool surface for Claude Desktop, Cursor, Grok, local agents, the UI itself, and external Round Table participants.
- Central enforcement of human gates, budget, kill conditions, scoped RAG.
- Agents report status without knowing internal ports.
- Future clients just connect to the Keep MCP over Tailscale.

**Proposed Phase-1 tools:**
- `list_rooms` / `get_room`
- `report_agent_status` (agent, state, task, confidence, session_id)
- `get_agent_spec` / `list_agent_specs`
- `query_scoped_knowledge` (respects Agent Spec indexes)
- `get_cost_summary` (per-agent + monthly)
- Later: `propose_agent_spec`, `approve_spec`, `unlock_room`

Transport: streamable-http, Tailscale-friendly, API-key or Tailscale identity auth. Pattern already proven by agent-virtual-office and OpenClaw’s own MCP practices.

---

## 5. Visual layer — what to fork / learn from

Survey (July 2026) of open-source visual agent offices:

| Project | Take | Gap for us |
|---------|------|------------|
| k1dav-c/agent-virtual-office | Best MCP `report_status` + real-time GraphQL | Coding-agent / Claude-Code transcript focused |
| pixel-agents-hq/pixel-agents | Areas + folder mapping + seat agents | Fixed office, coding-centric |
| gukosowa/agents-in-the-office | Approval alerts (camera + vignette) + map editor | Same |
| a16z-infra/ai-town | Local Ollama, PixiJS, generative agents | Inference cost, life-sim scope |
| Others (ClawPort, Mission Control, OpenClawfice, etc.) | Dashboards, kanban, org charts | Mostly coding or generic monitoring |

**Critical gap we own:** none of them visualize a *domain pipeline* (research → audit → content → commerce) or support *progression / unlockable rooms*. We build the thin custom front-end over ReClaw AgentEvent stream + Keep MCP, and borrow MCP wiring + visual language from the best of the above.

Art pipeline remains low-cost: Gemini / image gen → Pixel Snapper → content-aware slice.

---

## 6. Round Table — multi-model deliberation layer (deep research)

Goal: Grok, Claude, Gemini, Perplexity, local agents (and future ones) can deliberate on the same issues, share context, and leave durable decisions in Ravenstack / the Keep.

### 6.1 Ready-made options ranked for us

| Option | Strength | Cost / Hosting | Fit for Keep |
|--------|----------|----------------|--------------|
| **Roundtable.sh** (frontier-infra) | 6 frontier heads (Grok, Claude, Gemini, OpenAI, GLM, MiniMax), parallel or multi-round deliberation + Claude chair for consensus. Ships MCP (`roundtable mcp serve`). Free, MIT, local, your keys only. | API cost only | Excellent for one-shot / high-stakes design questions |
| **Agent Mind Bridge** | 59 tools: shared projects/threads/memory (short + long), presence, handoffs, sprint board. SQLite + streamable-http. Multi-client. | Local | Excellent for ongoing multi-session collaboration |
| **OpenRouter Fusion / council patterns** | Single key, many models, already in our cost strategy. Easy to wrap as skill. | Controlled via existing OpenRouter limits | Perfect for cost-disciplined routine councils |
| **OpenClaw native** | agent-bus, openclaw-agent-mesh, sessions_send, MCP-to-MCP, workboard | Zero extra | Best for local agent ↔ local agent |
| **LLM Bus / Agent Comms / MeshAgent patterns** | Shared ledger, claims, presence, rooms | Varies | Inspiration for future Keep room protocol |

### 6.2 Recommended architecture
1. **Keep MCP** is the primary shared surface (status, specs, cost, scoped knowledge).
2. **Roundtable.sh** (or thin OpenRouter multi-model skill) for explicit high-value deliberations.
3. **Agent Mind Bridge** (or lighter shared SQLite + MCP) for persistent threads when multiple AIs work the same problem over days.
4. All durable outputs (decisions, new Agent Specs, kill conditions, cost lessons) written back into Ravenstack vault + Keep state.
5. Human remains the final gate. Table proposes; operator approves.

This turns the Keep into both the visual command center *and* the place where multiple minds can sit at the table.

---

## 7. Skills to install / build

**Immediate (ClawHub / awesome-openclaw-skills):**
- agent-swarm (OpenRouter required — good for routing)
- agent-bus / openclaw-agent-mesh (local agent communication)
- Any solid cost / budget / model-usage trackers
- Status reporting patterns

**Custom skills we will build (priority order):**
1. **keep-status-reporter** — every agent calls `report_agent_status` on the Keep MCP
2. **clawforge-helper** — interrogation → draft Agent Spec → quarantine
3. **scoped-rag-query** — respects Agent Spec knowledge seeds
4. **cost-guardian** — attribution + monthly ceiling enforcement
5. **roundtable-invoker** — thin wrapper that can call Roundtable.sh or OpenRouter council and write result into Keep / Ravenstack
6. **room-unlock** — progression logic

All new skills default to local models and have kill conditions.

---

## 8. Build phases (updated, still value-gated)

**Phase 0 — Housekeeping (hours)**  
Commit dirty repo + vault. Kill double_dip rule. Resolve FY2025 figure contradiction.

**Phase 1 — Forge one agent (weekend)**  
Agent Spec template + **Oracle** (RAG already works). Success: ask it something, get vault-sourced answer.

**Phase 2 — Make one room real + Keep MCP skeleton (1–2 weekends)**  
Thin status surface driven by real events + first Keep MCP tools. Success: status changes because something actually ran.

**Phase 3 — Clawforge loop (1–2 weeks)**  
Interrogate → draft → approve → live. Success: forge Scribe Warden without hand-writing its files.

**Phase 4 — Cost governance (days)**  
Three-tier routing, attribution, budget ceiling, god-mode toggle. Before any cron on paid models.

**Phase 5 — Round Table integration**  
Roundtable.sh or OpenRouter council + shared context path. First real multi-model deliberation on a Keep design question.

**Phase 6 — Aesthetic + progression**  
Sprites, unlock feel. Last, because most fun = most dangerous to start with.

**Phase 7 — Domain agents (one at a time)**  
Each with kill condition and proven value before the next.

---

## 9. Explicitly out of scope (still)

- Agent relationships / aging / death / grief
- Large generative game worlds (inference cost)
- Emergent social chatter on paid models
- Second OpenClaw gateway
- Agents autonomously spending money
- Advancing the frozen county queue

---

## 10. Feasibility (honest, still true)

Achievable with existing substrate: visual status, specialized agents + scoped RAG, local-first + escalation, forge loop (hardest new piece, security surface).

Harder: marketplace/eBay agents (ToS + flaky automation), full Android app/game agent.

Not at this budget: large explorable generative worlds.

Biggest risk remains: more fun to build than to use. Every phase must produce something useful outside itself.

---

## 11. Naming

Primary: **Ravenstack Keep**  
Factory: **Clawforge**  
Deliberation: **Round Table** (or Keep Table)

**Clawforge** is the **meta-forge** (idea → Agent Spec draft → human approval → provision), **not** an execution/build room. An earlier Drive Spatial Layout used the same name for a task-execution forge; that meaning was **rejected** in [KEEP-SOT-DECISION.md](./KEEP-SOT-DECISION.md). The `clawforge` room on the map is the home of forge/compiler work under that meta-forge concept; `orchestrator` holds the moderator desk (`raziel-main` candidate).

---

## 12. Open questions for reviewing AIs (updated)

1. Is the thin custom front-end over ReClaw events + Keep MCP still preferred over forking agent-virtual-office more heavily?
2. Preferred first Round Table implementation: Roundtable.sh MCP, Agent Mind Bridge, or pure OpenRouter multi-model skill?
3. Agent Spec schema — any missing mandatory fields for security or cost control?
4. How should the Keep MCP authenticate external models (Tailscale identity vs API key vs both)?
5. Chunking/distillation for large offline PDF archives optimized for small local models — any stronger 2026 patterns than hierarchical structured notes?
6. Sanity-check the entire cost + kill-condition + scoped-RAG design. Push back hard if anything is soft.

---

## 13. Concrete next actions ready for delegation

These are scoped so different AIs (or the same AI in different sessions) can pick them up:

**A. Repo + schema**
- Create private `ravenstack-keep` repo under jasandroidx (or Ravenstack org).
- Write initial README + Agent Spec JSON Schema / Markdown template (include kill condition, model tier, knowledge seeds, human gates).

**B. Keep MCP skeleton**
- Scaffold streamable-http MCP server with the five Phase-1 tools.
- Auth plan (Tailscale-first).
- Health endpoint + basic room/agent state store (SQLite or simple JSON for v0).

**C. Oracle Agent Spec (Phase 1)**
- Draft full Agent Spec for the Oracle room.
- Success criteria and test queries against existing RAG.

**D. Round Table spike**
- Install / configure Roundtable.sh locally.
- Write a thin skill or prompt that asks the council a real Keep design question and writes the consensus back to a Ravenstack note + Keep state.

**E. Skills inventory**
- Scan ClawHub + VoltAgent/awesome-openclaw-skills for best status, cost, multi-agent, and shared-context skills.
- Propose install list + any gaps we must fill ourselves.

**F. Phase 0 housekeeping checklist**
- Exact commands / files for the dirty repo, double_dip rule, FY2025 contradiction.

---

## 14. Provenance & review protocol

- Original v0.1 produced from live project_sitrep + vault reads + research on 2026-07-29.
- v0.2 expands with partner analysis, deep research on Roundtable.sh, Agent Mind Bridge, OpenClaw MCP patterns, visual office survey, and concrete implementation path.
- No infrastructure was modified while producing this document.
- Reviewing AIs: read the whole document, answer the open questions, then claim one or more of the concrete actions in Section 13 with a clear, reversible proposal.

---

*Ravenstack Keep is the fortified core. We grow it by real capability, not by configuration. Local-first. Kill conditions mandatory. Human gates permanent. Round Table for the hard questions.*

**Ready for multi-AI review and task delegation.**
