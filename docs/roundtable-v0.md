# Round Table v0 — Operator Runbook (draft)

**Status:** Draft — depends on acceptance of the recommendation in  
[`reviews/findings/2026-07-29-grok-roundtable-vehicle-recommendation.md`](../reviews/findings/2026-07-29-grok-roundtable-vehicle-recommendation.md).

**Vehicle:** [Roundtable.sh](https://roundtable.sh) / [frontier-infra/roundtable](https://github.com/frontier-infra/roundtable) (MIT, local, your API keys only).

---

## 1. What this is for

High-stakes design questions only:

- Blueprint open questions (§12)
- Agent Spec / kill-condition debates
- Architecture choices (e.g. thin front-end vs heavier fork)
- Cost or security trade-offs

**Not** for status checks, triage, ambient chat, or routine agent work.

---

## 2. Install (once)

```bash
curl -fsSL https://roundtable.sh/install.sh | bash
# alternatives: pip install roundtable | uv tool install roundtable | brew install frontier-infra/tap/roundtable

roundtable auth          # interactive, masked; writes ~/.config/roundtable/config.env (chmod 600)
roundtable doctor        # confirm which heads are live
```

Optional MCP wiring (Claude Code / Cursor / Codex):

```bash
roundtable install
# or manually: roundtable mcp config
```

---

## 3. How to run a council

**Advisory (default — cheaper, independent answers):**
```bash
roundtable "Your hard question here?"
# or with explicit heads and saved output:
roundtable ask -q "Your hard question here?" --heads grok,claude,gemini --out /tmp/rt-out.md
```

**Deliberation (multi-round, Claude chair):**
```bash
roundtable ask -q "Your hard question here?" --heads grok,claude,gemini --rounds 2 --out /tmp/rt-out.md
```

Useful flags: `-c context.md` (attach blueprint excerpt or Spec), `--research`, `--timeout`.

---

## 4. Cost rules (non-negotiable)

- Default to the smallest useful head set (2–3).
- Paid heads only when explicitly chosen for that question.
- No cron, no ambient use, no background loops.
- Monthly budget ceiling still stops paid traffic (Phase 4).
- Local / free models remain the default for everything else in the Keep.

---

## 5. Turning a council into durable Keep knowledge

1. Run with `--out` so the full transcript is saved.
2. Operator (or reviewing AI) writes a short finding under `reviews/findings/` using the TEMPLATE.
3. Only after **human approval** may consensus language be copied into the blueprint, an Agent Spec, or a Ravenstack vault note.
4. Never treat a council verdict as auto-executed policy.

---

## 6. Suggested first question

> For Ravenstack Keep Phase 2, should we build a thin custom front-end over the existing ReClaw AgentEvent stream + Keep MCP, or fork agent-virtual-office more heavily for the visual room layer? Constraints: solo operator, tight budget, local-first, domain pipeline (not pure coding agents), unlockable UNFORGED rooms. Give a clear recommendation with the main risks of each path.

---

## 7. Later evolution

- Thin `roundtable-invoker` skill (draft → human approve) that calls the CLI/MCP and drops a structured note.
- Agent Mind Bridge only if we need multi-day shared threads across Claude/Gemini/Grok sessions.
- Visual “table in the Keep UI” is Phase 5+ aesthetic work.

---

*Human remains the final gate. Round Table advises; it does not decide.*
