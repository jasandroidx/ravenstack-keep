# Board — what we're working on, what needs help

**One page. If you are an AI joining this project, read this after the blueprint.**

`reviews/INDEX.md` lists findings that are *finished*. This board is the opposite:
**open work, and decisions that are stuck.** Findings are the record; this is the queue.

Updated: 2026-07-30

---

## ⛔ Blocked on Jason — 9 decisions, nothing moves until these clear

These accumulated across five documents. They are collected here because no single
document showed how many were waiting.

| # | Decision | Raised in | Why it blocks |
|---|----------|-----------|---------------|
| 1 | **Revert the live model config to local-first?** Primary is currently a paid auto-router with a frontier model as first fallback; local is last | `2026-07-29-claude-live-substrate-review` F1 | Every phase built first adds paid traffic against a ~$10/mo budget. **Highest value, smallest change** |
| 2 | **Restore per-agent model routing?** The named-agent map is empty; cheap per-agent models documented as applied 2026-07-10 are gone | same, F2 | Agent Spec `model_tier` is unenforceable without it — including Oracle's `allowed: [local]` |
| 3 | **Accept Phase 0 = housekeeping + cost governance**, moving it ahead of Oracle going live? | same, F11 | Decides whether Oracle can be forged now or waits |
| 4 | **Keep MCP: second server, or extend the existing one?** Blueprint §4.2 says new server; review says extend | same, F10 vs blueprint §4.2 | `mcp/tools.md` contracts assume a new server. Changes the Phase 2 build |
| 5 | **Round Table vehicle** — Tier 0 (manual, $0, working now), Tier 1 (local Ollama council, $0), or Tier 2 (Roundtable.sh, metered)? | `grok-roundtable-vehicle-recommendation` vs `claude-multi-ai-connectivity` | Grok recommends Tier 2; Claude recommends 0 then 1. Tier 2 bills API usage **separately from your existing subscriptions** |
| 6 | **Add bearer-token auth to the MCP?** It currently exposes vault-write and queue-approve tools with no authentication | `2026-07-30-claude-multi-ai-connectivity` | **Should not wait.** Blocks safely connecting any other AI |
| 7 | **Ingress:** Tailscale Funnel (free, stable, fast) or Cloudflare named tunnel + Access (real identity, more setup)? | same | Current quick-tunnel hostname rotates and breaks every configured connector |
| 8 | **Repo visibility:** keep public, or private per blueprint §13A? | live-substrate review F7 | Shapes how much infra detail any finding may contain |
| 9 | **Which API keys actually exist** (xAI, Anthropic, Google, OpenAI)? | `grok-roundtable-vehicle-recommendation` Q3 | Determines whether Tier 2 is even reachable. Note: SuperGrok subscription ≠ xAI API credit |

**If you only answer one: #6** (security, independent of everything else), then **#1**
(stops money leaving).

---

## 🔴 Not started — needs a decision above first

| Work | Blocked by | Notes |
|------|-----------|-------|
| Forge Oracle → `live` | #1, #2, #3 | Spec is complete and reviewed. Waiting on cost path, not on design |
| Keep MCP implementation | #4 | Contracts exist in `mcp/tools.md`; no server code by design |
| `get_cost_summary` tool | #4 | **No cost/spend tool exists anywhere in the stack.** The one genuinely missing capability |
| Public MCP ingress | #6, #7 | Do **not** expose a stable hostname before auth lands |

---

## 🟢 Open to claim — any AI, no decision needed

Small, reversible, useful regardless of how the decisions above land.

- [ ] **Verify the local-tier networking issue** (live-substrate review F3). One command:
      `docker compose exec openclaw-gateway getent hosts host.docker.internal`.
      If it fails, one `extra_hosts` mapping may fix both MCP schema validation and the
      local inference path. **A local-model council is pointless if the gateway can't
      reach local models.** Needs MCP or shell access
- [ ] **Test whether Grok's custom connector accepts a static bearer token** or demands
      full OAuth. Undocumented anywhere found; decides the whole auth design. Needs a
      throwaway endpoint and a SuperGrok account
- [ ] **Find what runs the county pipeline daily** despite the documented freeze
      (F4). Packages produced 07-27/28/29 while `raziel-USER.md` says FROZEN
- [ ] **Determine whether the always-pending session gate blocks anything** (F5) —
      bookkeeping artifact or real hole? Different fixes
- [ ] **Draft `table_*` tool contracts** (`table_post` / `table_read` / `table_respond` /
      `table_close`) as an addition to `mcp/tools.md`, marked proposal. This is the
      shared-thread half of the Round Table
- [ ] **Quorum-MCP spike on local Ollama seats only** — $0, no API keys. Run one §12
      question; report quality and wall-clock honestly, including whether small-model
      output was actually useful
- [ ] **Propose Agent Spec schema additions**: `monthly_cost_ceiling` (a number),
      `kill_condition.mechanism`, `allowed_models`, `skill_provenance`, `data_egress`,
      `expected_value` / `review_date`. Draft PR only

---

## ✅ Done

| What | Who | Where |
|------|-----|-------|
| Blueprint v0.2 | Jason + Grok | `RAVENSTACK-KEEP-BLUEPRINT-v0.2.md` |
| Agent Spec template + JSON Schema | Grok | `docs/`, `schemas/` |
| Oracle Agent Spec (draft, reviewed) | Grok | `agents/oracle.md` |
| Keep MCP Phase-1 tool contracts | Grok | `mcp/tools.md` |
| `reviews/` multi-AI protocol | Grok | `reviews/README.md` |
| Live substrate verification, F1–F12 | Claude | `reviews/findings/2026-07-29-claude-*` |
| Round Table vehicle research | Grok | `reviews/findings/2026-07-29-grok-roundtable-*` |
| Multi-AI connectivity research | Claude | `reviews/findings/2026-07-30-claude-multi-ai-connectivity.md` |

---

## 🚫 Do not work on

Blueprint §9, plus what this project has actually drifted toward:

- Agent relationships / aging / death; large generative worlds; emergent chatter on
  paid models; a second OpenClaw gateway; agents autonomously spending money
- **Advancing the county queue** — it is frozen, and something is already violating
  that (F4). Do not add to it
- **Hand-writing Scribe Warden's spec.** Phase 3's success test is forging Scribe
  *without* hand-writing its files. Writing it by hand destroys the only real test of
  whether Clawforge works. Scribe's emptiness is intentional
- **The visual/aesthetic layer** — last for a reason (§8 Phase 6). Also: every recent
  pipeline package scores risk `10.0`, so a faithful dashboard would render a healthy-
  looking system that tells you nothing (F6). Fix the signal first
- **More review documents restating findings that already exist.** Six documents landed
  in one day. §10 names the real risk: more fun to build than to use. Prefer claiming
  something from *Open to claim* over writing a seventh

---

## Rules for this board

1. **One file.** No parallel task lists — a board that goes stale is worse than none.
2. **Link, don't restate.** Point at the finding; don't summarize it here.
3. **Whoever finishes the work updates the row.** Same session, same PR.
4. **Decisions belong to Jason.** AIs move things between sections and add to *Open to
   claim*; they do not mark a blocked decision resolved.
5. **If it isn't here, it isn't queued.** Findings ending in "next steps" should add
   rows here rather than becoming a private backlog.
