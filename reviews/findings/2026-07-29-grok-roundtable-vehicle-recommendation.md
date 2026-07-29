---
date: 2026-07-29
author: Grok (xAI) — research partner
type: research
topic: First Round Table vehicle recommendation (Roundtable.sh)
status: needs operator decision
blueprint_refs: ["§6", "§8 Phase 5", "§12.Q2", "§13.D"]
files_reviewed:
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
  - "reviews/findings/2026-07-29-grok-phase1-session.md"
  - "reviews/findings/2026-07-29-grok-research-roundtable-kill-skills.md"
  - "https://github.com/frontier-infra/roundtable"
  - "https://roundtable.sh"
  - "AGENTS.md from frontier-infra/roundtable"
---

# Finding: First Round Table vehicle — recommend Roundtable.sh (frontier-infra)

## Summary

After deeper research, the recommended **first Round Table vehicle** for Ravenstack Keep is **Roundtable.sh** from frontier-infra (https://github.com/frontier-infra/roundtable). It is a local, MIT-licensed CLI + MCP that fans a single question to a configurable subset of frontier models (Grok, Claude, Gemini, OpenAI/Codex, GLM, MiniMax), supports advisory (parallel independent) and multi-round deliberation with a Claude chair, and requires only the operator’s own API keys. It is the lowest-friction path to a real multi-model council that still respects local-first cost discipline.

A concrete integration path and first design question are included below. Operator decision required before any install or paid calls.

## What I read

- Blueprint §6 (Round Table) and §13.D
- Prior findings on Round Table feasibility
- Official source: https://github.com/frontier-infra/roundtable + AGENTS.md + roundtable.sh docs
- Comparison notes against Agent Mind Bridge, OpenRouter Fusion patterns, persona-style “roundtable” skills, and multi-coding-assistant routers (different projects, same name)

## Findings (facts)

### What Roundtable.sh actually is
- One binary / CLI that convenes **Grok · Claude · Gemini · OpenAI/Codex · GLM · MiniMax**.
- **Advisory mode** (default): heads answer independently (blind), results side-by-side + synthesis.
- **Deliberation mode** (`--rounds N`): heads see prior answers and revise; Claude acts as chair and emits `VERDICT: CONSENSUS` or `CONTINUE` with named dissent.
- Fully local. MIT. No hosted account. Cost = only the underlying provider API calls for the heads you enable.
- Missing keys → that head is silently skipped; council still runs on the available subset.

### Install & config (verified from source)
```bash
curl -fsSL https://roundtable.sh/install.sh | bash
# or: pip install roundtable | uv tool install roundtable | brew install frontier-infra/tap/roundtable

roundtable auth          # interactive, masked, stores ~/.config/roundtable/config.env (chmod 600)
roundtable doctor        # which heads are configured + reachability
roundtable mcp serve     # stdio MCP; tool: roundtable(question, heads?, rounds?, research?)
roundtable mcp config    # prints JSON block for manual MCP wiring
roundtable install       # auto-wires Claude Code / Cursor / Codex when present
```

Key flags: `--heads grok,claude,gemini`, `--rounds 3`, `-c context.md`, `--research`, `--out file.md`.

### Why this beats the alternatives *for v0*
| Option | Fit for first Keep Round Table | Notes |
|--------|--------------------------------|-------|
| **Roundtable.sh (frontier-infra)** | **Best** | Real multi-frontier models, MCP, advisory + deliberation, local, cost = keys only |
| Agent Mind Bridge | Later | Excellent for persistent shared threads/memory over days; heavier than needed for first experiments |
| OpenRouter multi-model / Fusion skill | Strong runner-up | Already in our cost strategy; easier if we want everything through one key; less structured chair/consensus |
| Persona “roundtable” skills (risingdream etc.) | Different job | Debate among fictional strategists, not live frontier models |
| Multi-coding-assistant routers (askbudi etc.) | Different job | Delegates coding tasks across Claude/Cursor/Codex, not design deliberation |

### Cost reality
- Parallel frontier calls ≈ N × one hard question. Acceptable for architecture / Agent Spec / kill-condition debates.
- Unacceptable for status, triage, or ambient chat.
- Enforce: default to 2–3 heads; paid heads only when explicitly invited; monthly ceiling still stops paid traffic.

## Pushback / risks

1. Requires at least one (ideally 2–3) real API keys. Without them the council is empty.
2. Deliberation chair is Claude — if Anthropic key is missing, deliberation mode is weaker.
3. Name collision: several unrelated projects are also called “Roundtable.” Always specify **frontier-infra/roundtable** or **roundtable.sh**.
4. Do not auto-wire into production agents or cron. Human must invoke the table for high-stakes questions only.
5. Output is not automatically durable. Minutes must be explicitly written to Ravenstack / reviews/ after human approval.

## Recommendations

**Primary recommendation:** Adopt Roundtable.sh as the **first Round Table vehicle**.

### Concrete integration path for the Keep (v0)

1. **Operator install (laptop or Hetzner — operator choice)**  
   ```bash
   curl -fsSL https://roundtable.sh/install.sh | bash
   roundtable auth          # add at least XAI + Anthropic + one more if available
   roundtable doctor
   ```

2. **MCP exposure (optional but useful)**  
   - Run `roundtable mcp serve` under a supervised process, or  
   - Wire via `roundtable install` on the machine where Claude Desktop / Cursor / coding agents run.  
   - Later: thin Keep skill `roundtable-invoker` that calls the CLI or MCP and writes a structured note.

3. **Keep policy (non-negotiable)**  
   - Table is invoked only for hard design questions (blueprint open questions, Agent Spec debates, kill conditions, architecture).  
   - Default heads: `grok,claude,gemini` (or whatever keys exist).  
   - Deliberation: `--rounds 2` or `3` max for v0.  
   - Every run: save output with `--out` and copy a summary into `reviews/findings/` or a Ravenstack note **only after human review**.  
   - No ambient or cron use of paid heads.

4. **First real question to put on the table** (ready to run once keys exist)  
   > “For Ravenstack Keep Phase 2, should we build a thin custom front-end over the existing ReClaw AgentEvent stream + Keep MCP, or fork agent-virtual-office more heavily for the visual room layer? Constraints: solo operator, tight budget, local-first, domain pipeline (not pure coding agents), unlockable UNFORGED rooms. Give a clear recommendation with the main risks of each path.”

5. **Docs to add (small, reversible)**  
   - `docs/roundtable-v0.md` — short operator runbook (install, auth, example command, cost rules, how to turn minutes into a finding).  
   - Optional later: `skills/roundtable-invoker` outline (draft only).

### When to reach for the other tools
- **OpenRouter multi-model skill**: if we want everything billed through the existing OpenRouter key and strategy.
- **Agent Mind Bridge**: when we need multi-day shared threads between Claude / Gemini / Grok sessions, not one-shot councils.
- **OpenClaw agent-bus / mesh**: local agent ↔ local agent zero-marginal-cost messaging.

## Open questions for the operator

1. Approve Roundtable.sh as the first vehicle? (yes / no / prefer OpenRouter-only)
2. Where should it be installed first — laptop or Hetzner?
3. Which API keys are already available (XAI, Anthropic, Google, OpenAI, etc.) so we know the realistic head set?
4. Want me (or Grok Build) to draft `docs/roundtable-v0.md` immediately after approval?

## Concrete next steps (for the next AI or operator)

- [ ] Operator: decide on recommendation above.
- [ ] If approved: install + `roundtable auth` + `roundtable doctor`.
- [ ] Run the Phase 2 front-end question (or another §12 question) with `--rounds 2 --out reviews/raw/…` and then distill into a finding.
- [ ] Draft `docs/roundtable-v0.md` runbook (keep it short).
- [ ] Do **not** auto-execute any council verdict; human remains the final gate.

## Kill conditions / cost notes

- Roundtable itself is not an agent; it is a tool.  
- Any future `roundtable-invoker` skill must: default to advisory + limited heads, require explicit flag for paid deliberation, respect the monthly ceiling, and never run on cron.  
- If the tool starts being used for low-value questions, treat that as a process failure and tighten the invocation gate.

---

*Round Table for hard questions only. Local-first. Human chair permanent.*
