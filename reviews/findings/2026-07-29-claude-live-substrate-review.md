---
date: 2026-07-29
author: Claude (Anthropic) — filed into protocol by Grok
type: finding
topic: Live substrate verification of blueprint v0.2 — cost model, gates, MCP, phase order
status: needs operator decision
blueprint_refs:
  - "§2"
  - "§3.2"
  - "§3.5"
  - "§4.2"
  - "§6"
  - "§7"
  - "§8"
  - "§12"
  - "§13 B/E/F"
files_reviewed:
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
  - "Live Ravenstack MCP / substrate (project_sitrep, openclaw_models, ollama_models, connector_status, pending_gates, list_pipeline_sessions, vault reads)"
  - "Vault: ops/MODEL-LABELS.md, openclaw-model-routing-strategy.md, agent-architecture.md, agents/raziel-USER.md, backlog/skillscan-skill-vetter-phase-a.md"
source_branch: "claude/research-findings-doc-gm4l9y"
source_file: "reviews/2026-07-29-claude.md (full original on that branch)"
---

# Finding: Claude live-substrate review of blueprint v0.2

## Summary

Claude reviewed blueprint v0.2 **against the live Ravenstack MCP / substrate**, not from the document alone. Most substrate claims hold. The **cost model does not**: live default routing is paid-first (OpenRouter auto-router → frontier fallback → local last), against a ~$10/month budget, with **no spend-reporting tool** anywhere in the stack. Claude ranks this as the only thing worth acting on *today*, and recommends moving cost governance from Phase 4 to **Phase 0**, extending the existing MCP instead of building a second Keep MCP, and using already-paid subscription seats for Round Table at $0 marginal cost.

This finding files Claude’s review into the multi-AI protocol. Full original essay remains on branch `claude/research-findings-doc-gm4l9y`.

## What was read / method

- Full blueprint v0.2
- Live tools: `project_sitrep`, `openclaw_models`, `ollama_models`, `connector_status`, `pending_gates`, `list_pipeline_sessions`, `list_knowledge_topics`, vault reads
- External verification of roundtable.sh, Agent Mind Bridge, awesome-openclaw-skills, ClawHub claims
- **No infrastructure modified**; no vault writes; county freeze respected by the reviewer

## Findings (facts) — severity ranked

### 🔴 Act today

**F1 — Cost model inverted in live config**  
Blueprint §3.5: every agent defaults local; no ambient paid chat.  
Live: primary = paid OpenRouter auto-router; fallback 1 = frontier Claude; local `gemma4` is **last** resort. Contradicts vault notes (`openclaw-model-routing-strategy.md`, `ops/MODEL-LABELS.md` applied 2026-07-10 / 07-19). Budget ~$10/month (from `raziel-USER.md`) is not stated as a number in the blueprint ceiling language. **No cost/spend tool exists** in the stack — leak is unobservable until the bill.

**F2 — Per-agent model routing disappeared**  
Named-agent map empty. Vault documented cheap per-agent models (main, ops, coder, research) + cheap sub-agent default. All traffic now inherits the paid default from F1. Agent Spec `model_tier` becomes documentation without enforcement.

### 🟠 Act before next phase

**F3 — Local tier may be unreachable** *(needs verification)*  
`openclaw doctor --lint` fails on `getaddrinfo ENOTFOUND host.docker.internal`. If local inference is addressed via that hostname inside Linux Docker without `extra_hosts: host-gateway`, free path fails and falls through to paid. Verify:
```bash
docker compose exec openclaw-gateway getent hosts host.docker.internal
```

**F4 — Documented hard freeze is being violated**  
`raziel-USER.md`: Story Factory / county queue **FROZEN** since 2026-07-17. Live: packages produced 2026-07-27, 07-28, 07-29 on a daily cadence. Cursor stuck at 6/92 (progression frozen) but **execution still runs**. Writing a kill rule ≠ enforcing it.

**F5 — Human gates appear decorative**  
Recent sessions: `pending=1, grants=3` pattern; packages still produced. A gate that never clears and never blocks is not a gate.

**F6 — Risk scorer does not discriminate**  
Recent packages score risk **10.0** (max) with 39–50 flags; same county recomputed daily. Signal is useless for a future Keep dashboard.

**F7 — Repo is public; §13A said private**  
`ravenstack-keep` is public. Blueprint documents topology. MCP auth posture reported as effectively URL-obscurity. Three separate decisions: (1) public intentional?, (2) ReClaw-2.0 public intentional?, (3) real auth for MCP before external Round Table participants.

**F8 — Third-party skills ungated; gate already exists**  
Clawforge has quarantine discipline; §7 install list does not. `skillscan` + `skill-vetter` already installed/enabled in vault with `skill_install` requiring approval. Route all third-party installs through that gate. Pin version + hash. **Local-only** analysis for Clawforge output (external scanner uploads packages off-box).

**F9 — Round Table economics vs budget**  
roundtable.sh description is accurate, but multi-frontier multi-round can be ~$1–5/question against ~$10/month. Claude recommends **$0 first path**: SuperGrok + Claude (and other) **subscription seats**, existing MCP as shared context, `save_operator_decision` / vault notes for durable output. Keep roundtable.sh as god-tier for rare paid questions.

**F10 — Do not build a second MCP server**  
Existing server (~44 tools) already covers most proposed Phase-1 surface. Real gaps: **cost attribution**, **agent status write path**, room/spec CRUD. Prefer **extend existing MCP**. `query_scoped_knowledge` = scoping wrapper over existing `query_knowledge`, not a new retrieval stack.

### 🟡 Fix when convenient

**F11 — Phase order**  
Cost governance should be **Phase 0**, not Phase 4, given F1–F3.

**F12 — §2 accuracy**  
- `llama3.1:8b` listed but absent in Ollama  
- Some “local” Ollama entries are cloud-routed  
- Rooms (2 active / 3 unforged) are aspirational, not live config  
- Vault note count 122  
- README previously linked missing v0.1 file (fixed on Claude’s branch)

## Pushback / risks

- Building Phase 1–3 on an inverted cost ladder adds paid traffic to a leak.
- Kill conditions and human gates without **mechanisms** are theater (F4, F5).
- A second MCP before the first fully validates (F3) doubles debug surface.
- Agent Mind Bridge: GPLv3, very early (few commits), 59-tool surface conflicts with project small-context principle — deprioritize or skip for v0.

## Recommendations

1. **Phase 0 first:** revert model config to local-first (explicit IDs, no bare auto); restore per-agent routing from vault-applied state; verify Docker hostname; stop or deliberately unfreeze the county job; decide whether pending gates actually block.
2. **Build `get_cost_summary` (or equivalent) on the existing MCP before more agents.** One honest number > a pretty room.
3. **Extend existing MCP** for status + room/spec; do not stand up a second server in Phase 1.
4. **Round Table v0:** subscription seats + existing MCP + durable vault notes ($0 marginal). roundtable.sh only for rare god-tier questions with cost shown first.
5. **Skills:** route installs through existing skillscan/vetter gate; pin versions; local analysis for forge output; **build** cost-guardian yourself.
6. **Agent Spec schema:** add optional-but-strong fields — `monthly_cost_ceiling` (number), `kill_condition.mechanism`, `allowed_models` allowlist, `skill_provenance`, `data_egress`, `expected_value` / `review_date`.

## Open questions for the operator / other AIs

1. Confirm or refute F1/F2 against current live config (operator or Grok with MCP).
2. Accept Phase 0 = housekeeping **+ cost governance** before Oracle goes live?
3. Keep MCP: second server (blueprint) vs extend existing (Claude) — operator call.
4. Round Table: subscription-seat $0 path first, or proceed with Roundtable.sh install as previously recommended by Grok?
5. Repo visibility: keep public deliberately, or make private per original §13A?

## Concrete next steps (for the next AI)

- [ ] Operator or MCP-capable AI: verify F1 (default model ladder) and F3 (host.docker.internal) and record pass/fail in a short finding.
- [ ] Do **not** mark Oracle `live` or start Keep MCP server implementation until cost path is decided.
- [ ] If operator accepts extend-existing-MCP: draft minimal tool contracts for `get_cost_summary` + `report_agent_status` only (no full server yet).
- [ ] Optional: propose schema additions (ceiling, kill mechanism, allowed_models) as a tiny PR — draft only.
- [ ] Do not merge branch `claude/research-findings-doc-gm4l9y` wholesale; this finding is the protocol-compliant extract.

## Kill conditions / cost notes

- No new agent proposed here.
- Any cost-guardian or status tool must default local and have an explicit kill/disable path.
- Paid Round Table seats require cost preview + monthly ceiling enforcement before use.

---

**Attribution:** Original analysis by Claude (Anthropic), 2026-07-29, live MCP session. Protocol filing and compression by Grok for `reviews/findings/` + INDEX. Full long-form text: branch `claude/research-findings-doc-gm4l9y` → `reviews/2026-07-29-claude.md`.

*Rules without enforcement are soft. One honest number on spend beats a new room.*
