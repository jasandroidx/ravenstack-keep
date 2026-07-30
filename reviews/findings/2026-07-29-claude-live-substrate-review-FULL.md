---
title: Claude review of Ravenstack Keep Blueprint v0.2
reviewer: Claude (Anthropic), via live MCP connector session
date: 2026-07-29
reviewing: RAVENSTACK-KEEP-BLUEPRINT-v0.2.md
method: live substrate verification + vault reads + external source verification
infrastructure modified: none
status: complete — answers §12, claims §13 B/E/F
---

# Claude review — Ravenstack Keep Blueprint v0.2

## 0. Why this review is different

§0 of the blueprint asks for honest pushback. §14 asks reviewers to read the whole
document, answer the open questions, then claim concrete actions. This review does
all three — but it is not a prose critique.

I reviewed this with the **Ravenstack MCP connector live in the session**. §2 of the
blueprint is titled *"What already exists (verified live substrate)"*. I was able to
check that table against the actual running server instead of taking it on faith.

**Most of the substrate claims hold up. The cost model does not.** The blueprint's
one non-negotiable rule — local-first, no ambient paid chat — is currently inverted
in the live configuration. That is finding F1, and it is the only thing in this
document worth acting on today.

A note on method, in keeping with the operator's honesty contract: every live claim
below names the tool that produced it. Where I could not confirm something, it is
labelled **needs verification** with the exact command, not asserted.

---

## 1. The one-paragraph version

The foundation is real and healthier than most projects at this stage. The Keep's
design instincts — kill conditions mandatory, narrow RAG indexes over general ones,
human gates permanent, value-gated phases — are correct and unusually disciplined.
But three things need to change before any of Phases 1–7 begin:

1. **Cost governance is Phase 4. It has to be Phase 0.** The live model config is
   paid-first with a frontier model as the first fallback, against a ~$10/month
   budget, with no spend attribution tool anywhere in the stack. Every phase built
   on top of that adds paid traffic to a leak.
2. **Do not build a second MCP server.** The existing server already provides most
   of the proposed Phase-1 tool surface. The genuinely missing piece is cost.
3. **The Round Table as specified costs more per question than the monthly budget
   allows.** There is a $0 version using subscriptions already paid for.

Everything else is refinement.

---

## 2. Verified vs. claimed — §2 walked against the live stack

| §2 claim | Live result | Verdict |
|---|---|---|
| OpenClaw gateway healthy | running, `health=healthy`, status `live` | ✅ confirmed |
| ReClaw API v2.0.0 healthy | `ok`, v2.0.0 | ✅ confirmed |
| Dashboard healthy | HTTP 200, up | ✅ confirmed (container port differs from published port — cosmetic) |
| MCP connector streamable-http, bridge + tunnel active | both systemd units active, local health `ok` | ⚠️ partly — see F7 |
| Tailscale reachable | serve active, MCP route present | ✅ confirmed |
| Ollama: gemma4, phi4-mini, qwen3:1.7b, **llama3.1:8b** + cloud variants | `llama3.1:8b` **absent**; two of five entries are cloud-routed | ❌ inaccurate — F12 |
| Vault, 121+ Ravenstack notes, RAG live | 122 notes, RAG `ok`, ORACLE anchor present | ✅ confirmed |
| Agent handoffs working: analyst → researcher → content_studio | latest session `handoffs=3`, all three named | ✅ confirmed |
| Existing rooms: 2 active, 3 unforged | no room or named-agent construct exists in live config | ❌ aspirational — F12 |
| Disk ~51 GB free | 51 GB available, 77% used | ✅ confirmed |
| OpenRouter strategy documented, cost tiering exists | documented in vault — but **not what the live config does** | ❌ drifted — F1 |
| Cost model: every agent defaults local | live default is a paid auto-router | ❌ **inverted — F1** |

*Tools: `project_sitrep`, `openclaw_models`, `ollama_models`, `connector_status`,
`pending_gates`, `list_pipeline_sessions`, `list_knowledge_topics`, `read_vault_file`.*

**Design implication stands, with an amendment.** §2 concludes "risk is in the new
layer, not the foundation." That was the right call when written, but the foundation
has drifted since the vault documented it on 2026-07-10 and 07-19. There is risk in
the foundation right now, and it is financial.

---

## 3. Findings

Severity: 🔴 act today · 🟠 act before next phase · 🟡 fix when convenient

### 🔴 F1 — The cost model is inverted in the live config

§3.5 says: *"Rules: every agent defaults local; no ambient paid chat."* Marked
non-negotiable.

The live default model configuration is:

- **primary:** a paid OpenRouter **auto-router**
- **fallback 1:** a frontier Claude model
- fallbacks 2–5: mid-tier and free cloud models
- **last resort:** local `gemma4`

Local is the *final* fallback rather than the default. The ladder is frontier-first,
local-last — precisely the inverse of the stated rule.

Three things make this worse than a simple misconfiguration:

1. **It contradicts the operator's own written warning.** The vault's
   `openclaw-model-routing-strategy.md` says to use specific model IDs and not bare
   `auto`, noting that auto "burned people $."
2. **It contradicts the documented applied state.** That same note records the
   2026-07-10 applied config as local-primary with local fallbacks first.
   `ops/MODEL-LABELS.md` (2026-07-19) documents `CHAT-DEFAULT = ollama/gemma4`. The
   live config no longer matches either. Something changed it after 07-19.
3. **The blueprint never states the budget.** `Ravenstack/agents/raziel-USER.md`
   does: **~$10/month for OpenRouter**, alongside the hard rule *"No spending money
   without explicit OK."* §3.5's "monthly ceiling stops calls" has no number in it.
   A ceiling without a number is not a ceiling.

**Smallest fix:** set primary back to a local model, reorder fallbacks so every
free option is exhausted before any paid one, and replace the auto-router with
explicit model IDs. This is a config change, not a build.

**The compounding problem:** there is **no cost or spend tool anywhere in the
stack**. I checked the full tool surface. Nothing reports spend, per-agent
attribution, or month-to-date total. So the leak is currently unobservable — you
would find out from a bill, not a dashboard. That is why F1 and F11 belong together.

### 🔴 F2 — Per-agent model routing has disappeared

The live config's named-agent map is **empty**. The vault documents four agents with
deliberately cheap per-agent models applied 2026-07-10 (main, ops, coder, research),
plus a setting pinning spawned sub-agents to the cheapest local model.

None of that is in the live config. Every agent and every sub-agent now inherits the
paid default from F1. The "specialist agents on small local models" design — which
the vault says was *proven working at $0* — is gone.

This directly undercuts §3.2's `model tier: local | escalate | god` field. The Agent
Spec can declare a tier all it likes; if there is no per-agent routing to enforce it,
the field is documentation, not control.

### 🟠 F3 — The local tier may be unreachable *(needs verification)*

`openclaw doctor --lint` currently fails with:

```
getaddrinfo ENOTFOUND host.docker.internal
```

reported three times, for the configured MCP server. Separately, gateway logs show
local inference being addressed at a `host.docker.internal` hostname.

`host.docker.internal` does not resolve inside Linux containers unless explicitly
mapped (`extra_hosts: host-gateway` or equivalent). The vault records this being
fixed to a loopback address on 2026-07-10, so it appears to have regressed.

**Why this matters more than a lint warning:** if the gateway cannot reach local
inference, then every "free local" call fails and falls through the F1 ladder into
paid models. F1 makes paid the default; F3 would remove the free safety net
underneath it. Together they mean approximately all traffic is billable.

**I could not confirm the inference path from a log line alone** — I saw a request
start, not its outcome. Verify before believing me:

```
docker compose exec openclaw-gateway getent hosts host.docker.internal
```

Empty output confirms it. Also worth checking whether the two lint symptoms share
one root cause — if so, one `extra_hosts` fix repairs both the MCP schema validation
and the local inference path.

### 🟠 F4 — A documented hard freeze is being violated

`Ravenstack/agents/raziel-USER.md`, under *"Hard rules (never cross without Jason
saying so explicitly)"*:

> **Story Factory / county queue is FROZEN** (since 2026-07-17). Do NOT run-next,
> refresh, approve, or publish county content until Jason lifts the freeze.

Live, the pipeline produced packages on **2026-07-27, 07-28, and 07-29**, each around
08:00 — a daily cadence, consistent with a scheduled job. §9 of the blueprint lists
"advancing the frozen county queue" as explicitly out of scope, while something
advances it daily.

Nuance: the queue **cursor is not advancing** (stuck at 6 of 92). It is re-running
the same county/area repeatedly. So the freeze holds on *progression* but not on
*execution* — something still runs, still writes packages, still consumes compute.

This is the most important finding for the Keep's design, beyond its immediate cost:
**the blueprint assumes documented rules constrain the system.** Here is a rule
written in the strongest possible terms, in the operator's own briefing file, being
violated daily by automation nobody has audited. §3.2 makes kill conditions
mandatory and calls them "the only defense against sprawl." F4 is evidence that
writing a rule down is not the same as enforcing it. Kill conditions need a
mechanism, not a field.

### 🟠 F5 — Human gates appear decorative

All five recent sessions report the identical pattern: `pending=1, grants=3`. Every
session has exactly one approval permanently pending — and packages were produced
anyway (F4).

A gate that is always pending, never cleared, and never blocks output is not
functioning as a gate. §3.5 and the closing line both promise "human gates
permanent." Permanence is not the property that matters; **enforcement** is. Before
the Keep adds `approve_spec` and `unlock_room` to its tool surface, the existing gate
should be shown to actually stop something.

Worth determining which it is: a gate nothing is waiting on (harmless bookkeeping
artifact), or a gate that is bypassed (a real hole).

### 🟠 F6 — The risk scorer does not discriminate

Every recent package scores risk **10.0** — the apparent maximum — with flag counts
between 39 and 50. One county/area produced flags=50 on three consecutive days:
identical output, recomputed daily.

A risk score that is always maximal carries no information. Whatever downstream
decision it was meant to inform cannot be informed by it. And 86 of 92 counties have
never been processed while the same one is recomputed nightly.

This sits outside the Keep's scope, but it bears directly on the Keep's premise: the
Keep is a *visual command layer* over this pipeline. §5 identifies the gap the Keep
owns as visualizing a domain pipeline (research → audit → content → commerce). A
dashboard faithfully rendering "risk 10.0" every day would look like a working
system while telling the operator nothing. **Fix the signal before building the
display for it.**

### 🟠 F7 — The repo is public; §13A specified private

§13A says: *"Create **private** `ravenstack-keep` repo under jasandroidx."* The repo
is **public**. `ReClaw-2.0` is also public; only the Obsidian vault repo is private.

Meanwhile the connector reports its own auth posture as **none**, with the guidance
*"treat public URL as secret"* — i.e. the URL is the only credential. The public
tunnel is a quick tunnel whose hostname rotates on restart, and its health probe is
currently not returning a response.

The blueprint in this public repo documents the internal topology and port layout.
The tunnel URL itself is not published, so nothing is directly exposed — but a
public architecture document plus an unauthenticated endpoint whose only protection
is URL obscurity is a thinner margin than it looks.

**Three separate decisions here, worth separating:**

1. Is `ravenstack-keep` public deliberately, or did §13A's "private" simply not carry
   through? Either is fine — but the blueprint and the repo should agree.
2. Is `ReClaw-2.0` public deliberately? It is the platform code, and a public repo
   plus this session's finding that config drifts (F1, F2) suggests confirming no
   credential has ever been committed to its history.
3. Regardless of the above, the MCP would benefit from real auth rather than URL
   secrecy — the connector's own upgrade path (named tunnel + access control) is the
   right call, and it is a prerequisite for §6's external Round Table participants.

*This review has been kept deliberately generic about addresses, hostnames, and
ports for exactly this reason.*

### 🟠 F8 — Third-party skills are ungated; the gate already exists, unused

§3.3 imposes real discipline on **self-forged** skills: quarantine directory, no
execute, static analysis, human review of every generated skill. Good.

§7 then proposes installing third-party skills from ClawHub and
`awesome-openclaw-skills` — with **no equivalent gate**. That asymmetry is backwards.
Code you generated under interrogation is more trustworthy than code from a public
registry.

What I verified about that registry:

- `awesome-openclaw-skills` curates to ~5,300 skills by **excluding roughly 7,215
  entries as spam, duplicates, low-quality, or malicious** — more filtered than kept.
- It states plainly that listed skills are **unaudited** and **may be updated by
  maintainers at any time**. So vetting at install time does not stay valid.
- ClawHub's front page shows integration skills; the cost-tracking, status-reporting,
  and multi-agent coordination skills §7 hopes to install "immediately" are not
  obviously there. Some candidates exist in the curated list, all unaudited.

**The reuse finding — this is already solved.** `Ravenstack/backlog/skillscan-skill-vetter-phase-a.md`
records that `skillscan` (1.1.6) and `skill-vetter` (1.0.0) are **already installed
and enabled**, both scanned clean, with ReClaw capabilities already registered:
`skill_scan` (low), `skill_vet` (low), `skill_install` (**medium, approval
required**). It even documents the procedure end to end. §7 should route every
install through that existing gate rather than treating installation as free.

**One sharp caveat.** That same note records that SkillScan **uploads skill packages
to a third-party analysis service**. That is an acceptable trade for auditing someone
else's public code. It is the wrong tool for auditing **Clawforge output** — that
would ship the operator's own proprietary skills to an external service. §3.3's
"static analysis" must therefore be *local* analysis. Two different tools for two
different jobs; the blueprint currently implies one.

**Also:** because listed skills are mutable, pin versions and vendor the code rather
than live-installing. §7's install list should record a version and a hash.

### 🟠 F9 — Round Table economics contradict the budget

I verified both primary recommendations. §6.1's descriptions are accurate — no
correction needed on the facts.

**roundtable.sh** is exactly as described: MIT, free, no signup, runs on your own
provider keys, six frontier seats (Grok, OpenAI/Codex, GLM, MiniMax, Claude, Gemini),
advisory and deliberation modes, and it does ship `roundtable mcp serve`. §6.1 gets
it right.

But §6.1's cost column — *"API cost only"* — understates the problem against a
~$10/month budget. Six frontier seats answering one substantial design question, in
multi-round deliberation with revisions, is plausibly **$1–5 per question**. That is
**two to ten deliberations per month for the entire budget**, and §12 alone contains
six questions. The tool is excellent and genuinely free; the *inference* is not, and
this is the one place in the blueprint where a hard constraint and a recommendation
openly conflict.

**Agent Mind Bridge** is accurately described (59 tools, shared projects/threads/
memory, presence, handoffs, sprint board, SQLite + streamable-http) — but two facts
§6.1 omits:

- It is **GPLv3**, which matters if the Keep is ever open-sourced or distributed as
  §4.1 contemplates. Fine for personal server use; worth knowing before it becomes
  load-bearing.
- It has **1 star, 0 forks, and 4 commits.** §6.1 rates it "excellent for ongoing
  multi-session collaboration" and §6.2 makes it component 3 of 5. That is a lot of
  architectural weight for a project this early, maintained by one person, for an
  operator who is also one person with no time to fork it when it breaks.

And a structural objection: **59 tools is a very large surface to inject into any
agent's context.** The vault's own `agent-architecture.md` sets the principle —
*"Agents remain small: <2000 token context per invocation where possible"* — and 59
tool schemas would exceed that before the agent reads a single instruction. The
blueprint's recommendation contradicts the project's own documented design principle.

**The $0 alternative, and my answer to Q2.** The operator already pays for a
SuperGrok subscription (genius tier, per `raziel-USER.md`) and has Claude access —
this very review is being produced through it, with live tool calls, at no marginal
API cost. `raziel-USER.md` already codifies the pattern: *"Escalate to Grok Build /
Super Grok for hard design, architecture, 'is this money idea real or cope.'"*

So the cheapest Round Table is the one already running:

- **Seats** = subscription chat sessions (SuperGrok, Claude, and any other
  subscription), not per-token API seats.
- **Shared context** = the existing MCP connector. Every seat can already read the
  same sitrep, the same vault, the same RAG.
- **Durable output** = `save_operator_decision` and `save_ravenstack_note`, which
  already exist and already write where §6.2 point 4 wants outputs to land.
- **Human chair** = the operator, which §6.2 point 5 already requires.

That delivers §6's actual goal — multiple frontier models deliberating on the same
issues with shared context, decisions landing durably in Ravenstack — for **$0
marginal cost, using only components that already work.** No new server, no GPLv3
dependency, no per-question bill.

Keep roundtable.sh in reserve for the rare question worth paying for, with the cost
shown first, exactly as §3.5's "god tier" already specifies. That is what god tier is
*for*.

### 🟠 F10 — Do not build a second MCP server (answers Q1 and Q4)

§4.2 answers "Keep MCP — YES, dedicated server" and proposes five Phase-1 tools. I
went through the existing server's tool surface (~44 tools). Most of the proposed
surface already exists:

| §4.2 proposed tool | Already available |
|---|---|
| `query_scoped_knowledge` | `query_knowledge` — semantic search with citations. Needs *scoping*, not building |
| `list_rooms` / `get_room` | nothing (rooms don't exist yet) |
| `report_agent_status` | **missing** — closest are `inspect_session`, `list_pipeline_sessions` (read-only, pipeline-shaped) |
| `get_agent_spec` / `list_agent_specs` | `read_vault_file`, `list_knowledge_topics`, `read_repo_file` cover reads |
| `get_cost_summary` | **missing entirely — no spend tool exists anywhere** |
| `approve_spec` (later) | `pending_gates`, `session_approve_capability` — gate machinery exists |
| durable decisions | `save_operator_decision`, `save_ravenstack_note`, `write_vault_file` |
| live status | `project_sitrep`, `stack_health`, `dashboard_status`, `pipeline_status` |
| model inventory | `openclaw_models`, `ollama_models` |

**So the honest gap is three tools, not five:** cost attribution, agent status
reporting, and room/spec CRUD.

**Recommendation: extend the existing server instead of standing up a new one.**

- The existing server already holds what the new tools need — vault access, RAG,
  pipeline state, model inventory. A separate server would have to reach back for all
  of it.
- A second server means a second port, a second auth surface, a second thing to
  monitor, and a second instance of the F3 networking problem.
- **`doctor --lint` currently cannot expose runtime tool schemas for the one MCP
  server already configured** (F3). Adding a second before the first validates means
  debugging two broken integrations instead of one.
- The project already has a "single gateway" discipline for exactly this class of
  reason. The same logic applies here.

§4.2's stated advantages — clean tool surface for many clients, central enforcement
of gates and budget, agents not needing internal ports — are all real, and all
already delivered by the existing server. They argue for a *good* MCP surface, not
specifically a *second* one.

**Q4, authentication:** Tailscale works today and is the right default. The public
quick tunnel is not viable for external council members — the hostname rotates on
restart, and its health probe is not currently responding. But note the tension §6
does not resolve: **hosted SaaS chat models cannot reach a Tailscale-only endpoint.**
If external frontier models must connect directly, that needs a named tunnel with
real access control (the connector's own documented upgrade path), not a quick
tunnel. If F9's subscription-seat approach is adopted, this problem disappears
entirely — the human operator carries context between seats, and nothing external
needs inbound access.

### 🟡 F11 — Phase order should change

§8 places cost governance at **Phase 4**, after forging agents, building the Keep MCP
skeleton, and the Clawforge loop, with the note "before any cron on paid models."

Given F1, F2, and F3, cost governance is **Phase 0**. Cron on paid models is not a
future risk — the live default is already a paid router, per-agent cheap routing is
already gone, the free tier may already be unreachable, and there is no tool that can
tell you what any of it costs. Phases 1–3 as written would add agents, sessions, and
scheduled work on top of that.

§10 names the biggest risk as "more fun to build than to use." The corollary: the
least fun work — reverting a config, fixing a Docker hostname, writing a spend
counter — is the work that makes everything after it safe.

### 🟡 F12 — §2 accuracy corrections

- **`llama3.1:8b` is listed as installed. It is not present in Ollama.** The config
  still references it. The vault flagged this exact dead reference on 2026-07-10; it
  is still there 19 days later. §2 appears to have been written from the config
  rather than from the model list — the same mistake, propagated.
- **Two of the five Ollama entries are cloud-routed**, not local inference. Listing
  them under "Local inference" alongside genuinely local models contaminates the
  free tier in §3.5: an agent or operator selecting from that list can pick a
  metered cloud model believing it is free-and-local. Recommend labelling tiers
  explicitly in §2, as `ops/MODEL-LABELS.md` already does correctly.
- Vault notes: **122**, not "121+". Trivial, but §2 claims verification.
- Dashboard: container port and published port differ. Cosmetic.
- **The five rooms in §2 do not exist in live configuration.** The named-agent map is
  empty. Rooms are a good idea and the whole point of the Keep — but §2 is the table
  titled "what already exists (verified live substrate)," and they don't. Move them
  to a "planned" section so §2 stays trustworthy.
- `README.md` links `RAVENSTACK-KEEP-BLUEPRINT-v0.1-original.md`, which is not in the
  repo. Broken link (fixed in the same commit as this review).

---

## 4. Answers to §12's open questions

**Q1 — Thin custom front-end over ReClaw events + Keep MCP, or fork
agent-virtual-office more heavily?**
Thin custom front-end. §5's reasoning is sound and I found no reason to overturn it —
none of the surveyed projects model a domain pipeline or progression, so a heavy fork
means carrying a coding-agent data model you'd have to fight. Borrow the visual
language and the status-reporting pattern; own the data model. **But build it after
cost governance and after F6** — a faithful dashboard over a non-discriminating risk
score renders a system that looks healthy and says nothing.

**Q2 — First Round Table implementation: roundtable.sh, Agent Mind Bridge, or
OpenRouter multi-model skill?**
**None of the three, first.** Use the subscriptions already paid for as the seats,
the existing MCP as shared context, and `save_operator_decision` for durable output —
$0 marginal, zero new dependencies, available today (see F9). Then, in order: a thin
OpenRouter council skill against *free* model IDs when you want automation;
roundtable.sh for the rare genuinely high-stakes question, cost shown first as god
tier. Agent Mind Bridge last or not at all — GPLv3, 4 commits, and a 59-tool surface
that violates the project's own small-context principle.

**Q3 — Agent Spec schema: any missing mandatory fields for security or cost control?**
Yes — six, and the first three are the ones F1–F5 would have caught:

1. **`monthly_cost_ceiling`** — a number, per agent, denominated in dollars. §3.5
   promises a ceiling and never names one. Ceilings without numbers are aspirations.
2. **`kill_condition.mechanism`** — §3.2 mandates a kill condition but not *how it
   fires*. F4 is a documented hard rule violated daily; that is what a kill condition
   without a mechanism looks like. Require: what checks it, how often, what it does.
3. **`allowed_models`** — an explicit allowlist of model IDs, not just a tier name.
   F1 and F2 show tier names are unenforceable without per-agent routing; an
   allowlist is checkable at call time.
4. **`skill_provenance`** — for each skill: source, version, hash, scan date, and
   whether it was scanned locally or via the external service (F8). Skills are
   mutable upstream; record what you actually vetted.
5. **`data_egress`** — what this agent may send *outward*, and to whom. §3.4 governs
   what an agent may *read* (knowledge seeds) but nothing governs what leaves.
   F8's upload-to-third-party is exactly this class of risk, and it was found in a
   security tool.
6. **`expected_value` / `review_date`** — one sentence on what this agent is worth
   and when you'll check. §10 names "more fun to build than to use" as the biggest
   risk; this is the field that makes the review non-optional.

**Q4 — Keep MCP authentication: Tailscale identity, API key, or both?**
Tailscale-first — it works today and needs no new code. Add an API key only when a
non-tailnet client genuinely requires access, and prefer a named tunnel with access
control over a quick tunnel with a rotating hostname. See F7 and F10: the current
posture is effectively no auth, with URL obscurity as the only control. If Q2's
subscription-seat answer is adopted, external inbound access is not needed at all —
which is the cheapest possible answer to this question.

**Q5 — Chunking/distillation for large offline PDF archives on small local models —
anything stronger than hierarchical structured notes in 2026?**
Hierarchical structured notes remain the right default, and §3.4's instinct
(structured distillation over raw dumps) is correct. Three refinements worth more
than a new chunking algorithm, and all cheap:

- **Store the distillate, discard the chunk.** For `longtail` material — obscure
  manuals, version-specific docs — the value is a precise extracted fact, not a
  retrievable passage. Write facts as notes; the vault already is the index.
- **Two-pass, cheapest-model-first.** Small local model extracts candidate facts;
  the same or a slightly larger local model validates against source text. Escalate
  only failures. This is §3.5's tiering applied to ingestion, and `phi4-mini` is
  documented in-vault as proven at $0 for exactly this kind of narrow single-task
  work.
- **Record provenance per fact** — document, page, extraction date. The vault's own
  `agent-architecture.md` file format already mandates a Sources & Provenance
  section. Reuse it rather than inventing a schema.

The retrieval principle in §3.4 — *don't retrieve what the model already knows* — is
the strongest idea in the blueprint and is worth more than any chunking improvement.
Hold it.

**Q6 — Sanity-check the cost + kill-condition + scoped-RAG design. Push back hard if
anything is soft.**
The *design* is sound. Three of the four pillars are soft in **implementation**, and
in each case the live stack shows what soft looks like:

- **Cost:** rule says local-first; live config is paid-first with a frontier first
  fallback, and no tool reports spend. **Soft — F1, F2, F11.**
- **Kill conditions:** mandatory as a *field*, with no firing mechanism. A hard rule
  in the operator's own briefing file is being violated daily. **Soft — F4.**
- **Human gates:** promised permanent; every recent session shows one permanently
  pending while output ships anyway. **Soft — F5.**
- **Scoped RAG:** genuinely solid. Narrow indexes, `general` binned, agents declaring
  which indexes they may query — this is the best-designed part of the blueprint and
  `query_knowledge` already provides the retrieval half. **Holds.**

The pattern across all three soft pillars is identical: **a well-written rule with no
enforcement point.** The blueprint is strong at stating constraints and has not yet
designed the thing that makes a constraint bind. That is the Keep's real job, and it
is more valuable than the visual layer.

---

## 5. Actions claimed from §13

Claiming **B**, **E**, and **F**, each amended by the findings above. Proposals only
— nothing here has been executed, and none of it should run without operator
approval.

### Action F — Phase 0 housekeeping *(claimed, expanded)*

§13F asks for exact commands for the dirty repo, the double_dip rule, and the FY2025
contradiction. Those remain, but Phase 0 is bigger than housekeeping. Ordered by
value, cheapest first:

1. **Revert the model config to local-first (F1).** Explicit model IDs, no
   auto-router, all free options ahead of all paid ones. Highest value, smallest
   diff, do it first.
2. **Restore per-agent model routing (F2)** from the applied state the vault already
   documents, including the cheap default for spawned sub-agents.
3. **Verify the container hostname resolution (F3)** with the one command in F3. If
   it fails, one `extra_hosts` mapping likely repairs both the MCP schema validation
   and the local inference path.
4. **Find and stop whatever runs the frozen pipeline daily (F4).** Audit scheduled
   jobs. Either lift the freeze deliberately or stop the job — but do not leave a
   documented hard rule being violated by automation nobody owns.
5. **Determine whether the always-pending gate blocks anything (F5).** Bookkeeping
   artifact or bypassed gate — these need different fixes.
6. **Resolve the branch mismatch before committing anything.** The platform repo's
   working branch is a dated backup branch, not the default branch. §13F's "commit
   the dirty repo" would otherwise commit real work onto a stale backup.
7. **Remove the dead model reference** flagged in-vault on 2026-07-10 (F12).
8. Then the original §13F items: dirty repo, dirty vault (12 uncommitted paths,
   including new untracked `agents/`, `projects/`, and `skills/` directories that
   look like real work), the double_dip rule, and the FY2025 contradiction.
9. **Decide the two repo visibility questions in F7** — and confirm no credential
   was ever committed to the public platform repo's history.

Items 1–3 are the ones that stop money leaving. Nothing in Phases 1–7 should start
before them.

### Action B — Keep MCP skeleton *(claimed, revised)*

Revised per F10: **extend the existing MCP server; do not build a second one.**
Three tools, in strict value order:

1. **`get_cost_summary`** — per-agent and month-to-date spend against a stated
   ceiling. **Build this first.** It is the only genuinely missing capability with no
   partial substitute anywhere in the stack, and F1 is currently invisible without
   it. A tool that reports one honest number beats a room that renders beautifully.
2. **`report_agent_status`** — the write-side counterpart to the existing read-only
   session inspection tools, and the thing §7's `keep-status-reporter` skill needs.
3. **Room / spec CRUD** — `list_rooms`, `get_room`, `get_agent_spec`, and later
   `propose_agent_spec` / `approve_spec` / `unlock_room`, routed through the gate
   machinery that already exists rather than a new approval path.

`query_scoped_knowledge` is **not** on this list: the retrieval half already exists.
What is needed is a scoping wrapper that reads the calling agent's declared knowledge
seeds and constrains the query — a filter over a working tool, not a new tool.

Storage: JSON on disk for v0, as §13B suggests. Rooms and specs are a handful of
records that a human should be able to read and correct in an editor. Defer SQLite
until there is a query that JSON cannot answer.

### Action E — Skills inventory *(claimed, re-scoped)*

Per F8, this is a **security review**, not a shopping list. Concretely:

1. **Route every third-party install through the gate that already exists** —
   `skill_scan` → `skill_vet` → `skill_install` (approval required), all installed,
   enabled, and documented in-vault since 2026-07-05. The blueprint does not mention
   it; §7 should require it.
2. **Pin and vendor.** Record source, version, and hash for every installed skill.
   Upstream skills are explicitly mutable, so "scanned once" is not "safe."
3. **Use local-only analysis for Clawforge output.** The external scanner uploads
   packages off-box — right for auditing public code, wrong for the operator's own
   forged skills. §3.3's "static analysis" must be local.
4. **Build, don't install, the cost guardian.** It is the one skill in §7 that must be
   trustworthy — it enforces the budget — and it is small. Trusting a third-party
   unaudited skill to police spending inverts the trust model. Everything else in
   §7's list is a candidate for installation under the gate above.

---

## 6. Recommended phase re-ordering

Minimal edit to §8: cost governance moves from Phase 4 to Phase 0, and Phase 0
absorbs the F1–F6 items. Everything else keeps its order and its value gate.

| New | Was | Phase | Success test |
|---|---|---|---|
| **0** | 0 + **4** | Housekeeping **+ cost governance** | Config is local-first; `get_cost_summary` returns an honest number against a stated ceiling; the frozen pipeline is genuinely stopped or deliberately unfrozen |
| 1 | 1 | Forge one agent (Oracle) | Ask it something, get a vault-sourced answer with citations — for $0 |
| 2 | 2 | One real room + MCP extension | Status changes because something actually ran |
| 3 | 3 | Clawforge loop | Forge the next agent without hand-writing its files |
| 4 | 5 | Round Table | One real multi-model deliberation, at $0 marginal cost, decision landed in the vault |
| 5 | 6 | Aesthetic + progression | Unchanged — still last, still for the right reason |
| 6 | 7 | Domain agents, one at a time | Each proves value, and each has a kill condition that actually fires |

Two additions to §9's out-of-scope list, both earned by findings above: **no new MCP
server** (F10) and **no paid-per-token council until a spend ceiling is enforced**
(F9).

---

## 7. What the blueprint gets right

Worth stating plainly, because the findings above are all problems.

- **"Do not retrieve what the model already knows. Retrieve what it can't."** (§3.4)
  This is the sharpest idea in the document. Most RAG designs get this backwards and
  pay for it in both cost and quality.
- **Kill conditions as a mandatory field** (§3.2) is the right instinct — F4 shows
  it needs a mechanism, but the instinct to make it non-optional is correct and rare.
- **Value-gated phases with explicit success tests** (§8), and naming "more fun to
  build than to use" as the biggest risk (§10). Most solo projects fail exactly
  there, and few name it.
- **The out-of-scope list** (§9) is disciplined, specific, and includes things that
  would obviously be fun to build. That is a hard list to write honestly.
- **Draft to disk, never draft-to-execute** (§3.3). Correct, and the right default
  for a forge.
- **The §5 survey conclusion** — that no existing project models a domain pipeline or
  progression — held up against the external sources I checked.

The design thinking is well ahead of the implementation. That is a much better
problem than the reverse, and it means the fixes above are configuration and small
tools rather than redesign.

---

## 8. Provenance

- **Date:** 2026-07-29
- **Reviewer:** Claude (Anthropic), in a session with the Ravenstack MCP connector
  live.
- **Live stack, read-only:** `project_sitrep`, `openclaw_models`, `ollama_models`,
  `connector_status`, `pending_gates`, `list_pipeline_sessions`,
  `list_knowledge_topics`.
- **Vault reads:** `ops/MODEL-LABELS.md`, `openclaw-model-routing-strategy.md`,
  `agent-architecture.md`, `agents/raziel-USER.md`,
  `backlog/skillscan-skill-vetter-phase-a.md`.
- **Repository metadata** for the accounts in scope.
- **External sources verified this session:** roundtable.sh, Agent-Mind-Bridge,
  VoltAgent/awesome-openclaw-skills, clawhub.ai. Every external claim in §6.1 and §7
  of the blueprint was checked against its source rather than recalled.
- **No infrastructure was modified.** No configuration writes, no vault writes, no
  queue approvals or rejections, no pipeline runs. The county queue freeze documented
  in `raziel-USER.md` was respected throughout — F4 reports that something *else* is
  violating it.
- **Unverified claim, labelled as such:** F3's local inference path. I observed a
  request begin, not its outcome. The verification command is in F3.
- This review is deliberately generic about addresses, hostnames, and ports because
  the repository is public (F7).

---

*Reviewed per §14. Six open questions answered in §4. Actions B, E, and F claimed in
§5, amended by findings. Recommendations are reversible: the highest-value ones are a
config revert and one small tool that reports a number.*

*The foundation is real. The rules are good. What is missing is the machinery that
makes a rule bind — and one honest number on a dashboard.*
