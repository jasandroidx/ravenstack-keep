---
title: Ravenstack Keep — Project Blueprint
version: 0.1 (draft for cross-AI review)
date: 2026-07-29
owner: Jason (Ravenstack / ReClaw)
status: proposal — not yet built
tags: [ravenstack, keep, agents, blueprint, handoff]
---

# Ravenstack Keep

**A visual command layer for a personal AI operations fortress.**

---

## 0. How to use this document

This is a design brief written to be shared with multiple AI assistants
(Claude, Gemini Pro, Grok, Perplexity, local models) via the Ravenstack MCP
connector. Any AI reading this should assume:

- The operator is **one person**, not a team.
- Budget is **tight**. Low cost is a hard design constraint, not a preference.
- The backend **already exists and is running**. This is not greenfield.
- Honest pushback is wanted. If a section is wrong, say so plainly.

Open questions for reviewers are listed in Section 10.

---

## 1. One-paragraph description

Ravenstack Keep is a visual interface to a working personal AI operations
stack. Specialized agents live in named rooms. Each has a defined job, its
own tools, and its own slice of a curated knowledge base. The operator opens
the Keep, sees which agents are live and what they're doing, and delegates
work by talking to the right specialist. Agents run on free local models by
default and escalate to paid frontier models only when a task demands it.
New agents are created through a forge: you bring an idea, the forge
interrogates it, drafts a spec, and — on approval — builds the agent, its
room, its tools, and its knowledge seeds. Empty rooms are visible and
unlocked over time, so the system reads as a place that grows rather than a
dashboard that is merely configured.

---

## 2. What already exists (verified live, 2026-07-29)

This is the substrate. It is running, not planned.

| Component | State |
|---|---|
| Host | Hetzner VPS, Ubuntu, ~51 GB free |
| OpenClaw gateway | Docker, healthy, 7d uptime, port 18789 |
| ReClaw API | v2.0.0, healthy, 9d uptime, port 8000 |
| Dashboard | healthy, port 8081 |
| MCP connector | streamable-http, port 8100, bridge + tunnel active |
| Network | Tailscale (100.108.130.82), Cloudflare quick tunnel |
| Local inference | Ollama, 5 models (gemma4, phi4-mini, qwen3:1.7b, llama3.1:8b, + cloud variants) |
| Knowledge | Obsidian vault, 121 Ravenstack notes, RAG live via POST /rag/search |
| Agent handoffs | Working: analyst → researcher → content_studio |
| Existing rooms | 2 active (Orchestrator, Clawforge), 3 unforged (Oracle, Scribe Warden, Flipper) |
| Client | Ubuntu laptop (fresh install), Claude Desktop available |

**Design implication:** the Keep is a front end plus a routing/spec layer on
top of infrastructure that works. Most of the risk is in the new layer, not
the foundation.

---

## 3. Core concepts

### 3.1 The Room
A room is an agent's home. It has a name, an occupant, a live status, and a
lock state. `UNFORGED` rooms are visible and empty — they advertise what the
system could become.

### 3.2 The Agent Spec
The unit that makes an agent real. Every agent is defined by:

| Field | Purpose |
|---|---|
| name / character | identity |
| room | placement |
| purpose | one sentence; two sentences means two agents |
| model tier | `local` (default) / `escalate` / `god` |
| tools | MCP endpoints, browser, filesystem, APIs |
| skills | existing ClawHub skills vs. skills the forge must write |
| knowledge seeds | which RAG indexes it may query |
| triggers | cron / event / on-demand |
| handoffs | who it passes work to |
| human gates | actions requiring explicit operator approval |
| kill condition | when this agent should be retired |

The kill condition is mandatory. It is the only defense against agent sprawl.

### 3.3 Clawforge
The factory, not a coder. Loop:

1. Operator brings an idea.
2. Forge interrogates: trigger, success criteria, overlap with existing agents.
3. Forge drafts the Agent Spec.
4. Operator approves or edits. **Hard human gate.**
5. Forge writes skills, provisions the room, wires tools, seeds knowledge,
   registers with the Orchestrator.
6. Room transitions `UNFORGED` → live.

**Security note:** an agent that writes and installs skills can write
anything. The forge must draft to disk and wait for approval. Never
draft-to-execute.

---

## 4. The knowledge layer — corrected guidance

The operator's original instinct: *"If I distilled everything about making
games into RAG, wouldn't that agent be a beast at making games?"*

**The instinct is half right, and the correct half matters a lot here.**

### 4.1 What the research actually shows

From *RAG in the Wild* (arXiv 2507.20059), evaluating retrieval across
heterogeneous knowledge sources:

- Retrieval delivers **substantial gains for smaller models**, because they
  have limited capacity to store knowledge internally.
- **Larger models show diminishing returns**, with improvements mostly
  confined to factual lookup tasks.
- For general knowledge already captured in pretraining, **external
  retrieval brings less benefit**.
- Current LLMs **struggle to route queries across heterogeneous sources**.
- Rerankers added minimal value; no single retrieval source consistently won.

### 4.2 What this means for the Keep

**Good news:** this architecture runs small local models. RAG helps small
models *most*. Good retrieval is what makes a free 8B model punch above its
weight — which is the entire cost strategy. Investment here is well placed.

**Bad news for the original plan:** indexing "everything about making games"
is low value. General game development knowledge is already in the weights of
every model worth using. Retrieval will mostly duplicate what the model knows
and add noise.

**The high-value targets are things no model can know:**

| Index | Contents | Value |
|---|---|---|
| `self` | Operator's decisions, project state, architecture notes, past agent specs | Highest — unique, unavailable anywhere else |
| `domain` | Scraped county data, public records, harvested datasets | High — proprietary |
| `longtail` | Obscure manuals, out-of-print books, niche PDFs, version-specific engine docs | High — genuinely underrepresented in training data |
| `general` | Mainstream tutorials, popular framework docs, well-known textbooks | **Low — skip this** |

**Reframed principle: don't retrieve what the model already knows. Retrieve
what it can't.**

An agent with RAG over general game-dev books does not become good at making
games. An agent with RAG over *your* codebase, *your* engine version, *your*
past decisions, and the three obscure manuals nobody digitized becomes good
at making **your** game. That is the achievable and more useful version.

### 4.3 Index design

Because models route poorly across mixed sources, **do not build one index.**
Build several narrow ones and let the Agent Spec declare which the agent may
query. Fewer, cleaner, scoped indexes beat one large one.

### 4.4 Ingestion discipline

The operator has large offline archives of books, manuals, and PDFs. Pipeline:

1. **Triage** — is this long-tail or general? General goes in the bin.
2. **Extract** — text + structure preserved.
3. **Distill** — structured notes, not raw dumps. (KARE-RAG, arXiv 2506.02503,
   found structured representations substantially outperform unstructured
   summarization.)
4. **Cite** — every chunk keeps source and date.
5. **Scope** — assign to a named index.

Raw log dumps are not memory. Distillation is the work.

---

## 5. Cost model

Hard constraint: this must stay cheap enough to remain enjoyable.

### 5.1 Three tiers

| Tier | Model | Cost | Use |
|---|---|---|---|
| **Local** (default) | Ollama on Hetzner | $0 marginal | Routine work, triage, drafting, chat, all social/ambient behavior |
| **Escalate** | Cheap API (DeepSeek-class) | Low | Local model failed a check |
| **God mode** | Frontier (Opus / GPT-5 / Gemini Pro) | High | Explicit operator invocation, or high-stakes single tasks |

### 5.2 Escalation pattern

Documented hybrid routing practice: start local; if the local model signals
low confidence, returns malformed output, or fails a validation check,
escalate automatically. You pay for cloud inference only when you actually
need it.

Add to that a **manual god-mode toggle** — a per-task override the operator
triggers deliberately, with the cost shown before it fires.

### 5.3 Non-negotiable cost rules

1. Every new agent defaults to `local`. Escalation is opt-in per spec.
2. No agent chats for ambience on a paid model. Ever.
3. Every paid call is logged with cost attribution per agent.
4. A monthly budget ceiling exists, and crossing it stops paid calls rather
   than warning about them.
5. Cron-triggered agents on paid models are the single biggest silent-bill
   risk. Audit these specifically.

---

## 6. What to fork rather than build

A survey of existing open-source work (July 2026). All of these visualize
real agent activity as characters.

| Project | Take from it |
|---|---|
| `k1dav-c/agent-virtual-office` | **MCP integration path.** Agents connect over MCP, report live status/role/task. Closest wiring match. |
| `FulAppiOS/Agent-Quest` | Building-as-activity mapping (Read→Library, Edit→Forge, Bash→Arena). Fantasy aesthetic. |
| `pixel-agents-hq/pixel-agents` | **Areas** — paint named zones, map folders to them, seat agents inside. Directly maps to rooms. Actively maintained. |
| `gukosowa/agents-in-the-office` | Approval alerts: camera snap + warning sign + red vignette when an agent awaits approval. Solves human-gate UX. Also ships a map editor. |
| `liuyixin-louis/agentroom` | Session search, token dashboards, per-project persistent layouts. Linux-supported. |
| `a16z-infra/ai-town` | MIT-licensed generative-agent engine, PixiJS rendering, **runs on local Ollama**. |
| `rsanandres/aphae` | Godot 4 + local LLM reference. (Skip its life/death/relationship sim — out of scope.) |

**Critical gap identified:** every one of these visualizes *coding agents*
(Claude Code, Codex, Gemini CLI) by watching JSONL transcripts. **None
visualizes a domain pipeline** — research, audit, content, commerce. And all
of them ship a **fixed office**; none support forging new rooms as
progression. Both gaps are open.

### 6.1 Art pipeline (solved, low cost)

Sprites do not require an artist:

1. Generate with Gemini / Nano Banana 2. Prompt in English, specify "side
   view" explicitly, request a horizontal sprite sheet with transparent
   background and consistent proportions.
2. Raw output is *pixel-art-style illustration*, not true pixel art — uneven
   pixel sizes, too many colors.
3. Run through **Pixel Snapper** (MIT, Rust/WASM, browser-based, from the
   Sprite Fusion project) to snap to grid and quantize colors.
4. For clean extraction: generate on chroma-key green with white sprite
   outlines, then use **content-aware slicing**, not uniform grid division.

Practitioner guidance: prompt for style and design; fix the grid in post.
Do not fight the model for pixel snapping.

---

## 7. Build phases

Each phase must produce something usable. No phase is allowed to be pure
infrastructure.

**Phase 0 — Housekeeping (hours)**
Commit dirty repo and vault (11 uncommitted files). Resolve the FY2025 figure
contradiction in the Pike package. Kill the `double_dip` detection rule
(it flags $400 board stipends as scandals — legally and ethically unsound).

**Phase 1 — Forge one agent (a weekend)**
Write the Agent Spec template. Forge **the Oracle** — RAG already works, so
this is wiring, not building. Success test: ask it something and get an
answer sourced from the vault.

**Phase 2 — Make one room real (a weekend)**
Fork `agent-virtual-office` for MCP wiring. One room, live status driven by
real events. Success test: status changes because something actually ran.

**Phase 3 — The forge loop (1–2 weeks)**
Clawforge interrogates → drafts spec → operator approves → agent exists.
Success test: forge Scribe Warden without hand-writing its files.

**Phase 4 — Cost governance (days)**
Three-tier routing, per-agent cost attribution, budget ceiling, god-mode
toggle with cost preview. Do this **before** adding cron agents.

**Phase 5 — Aesthetic pass (open-ended)**
Sprites, rooms, unlock feel. Deliberately last, because it is the most fun
and therefore the most dangerous to start with.

**Phase 6 — Domain agents (months, one at a time)**
Marketplace scanner, eBay ops, research agent, app/game builder. One at a
time, each with a kill condition, each proving value before the next.

---

## 8. Explicitly out of scope

Named here to prevent scope drift.

| Excluded | Why |
|---|---|
| Agent relationships, aging, death, grief | Operator explicitly not interested. Costs tokens, adds nothing. |
| Recreating FF7 / Suikoden / large game worlds | Asset and API cost make this unaffordable. Revisit only if the Keep itself succeeds. |
| Emergent social chatter | Tokens spent on vibes. If ever added, local models only. |
| A second OpenClaw gateway | Architectural rule. One gateway, on Hetzner. Clients are nodes. |
| Agents autonomously spending money | Hard human gate, permanently. |
| Advancing the frozen county queue | Frozen until the operator says otherwise. |

---

## 9. Feasibility assessment — honest

**Achievable with what exists:**
- Visual room dashboard driven by real agent events — *yes*, mostly wiring.
- Specialized agents with scoped RAG — *yes*, RAG is already live.
- Local-first with escalation — *yes*, documented pattern, 5 models present.
- Forge loop — *yes*, but it is the hardest new component and the one with
  the real security surface.

**Achievable but harder than it sounds:**
- Marketplace/eBay agents — browser automation is historically flaky, and
  platform terms of service must be checked before building.
- Android app/game agent — an agent can accelerate this; it will not do it
  alone.

**Not achievable at this budget:**
- Large explorable game worlds with generative agents. The rendering is
  cheap; the per-agent inference is not.

**Biggest risk:** the Keep is more fun to build than to use. Every phase
above is gated on producing something useful outside itself. If Phase 2
produces a beautiful room the operator never opens again, stop.

---

## 10. Open questions for reviewing AIs

1. Is `agent-virtual-office` the right fork base for MCP-driven room status,
   or is a thin custom front end over the existing ReClaw AgentEvent stream
   simpler? Review both before answering.
2. What is the cheapest reliable way to detect "local model failed" for
   escalation — structured-output validation, self-reported confidence, or a
   small classifier? Evidence preferred over opinion.
3. Chunking and distillation strategy for large offline PDF/book archives,
   optimized for small local models specifically.
4. How should the forge sandbox generated skills before the approval gate?
5. Is there prior art for *progression* in an ops dashboard — unlockable
   capability tied to real system growth? None was found in this survey.
6. Sanity-check Section 4. If the RAG guidance is wrong, say so directly.

---

## 11. Naming

Primary: **Ravenstack Keep** — a keep is the fortified core of a castle, and
"keep" is also what you do with knowledge worth holding.

Alternates: The Keep · Ravenhold · Fortress Keep · Clawforge

---

*Provenance: live `project_sitrep` and vault reads on the reclaw-platform MCP
connector, 2026-07-29. Repository survey and RAG research conducted same day.
No infrastructure was modified in producing this document.*
