# Multi-AI reviews & findings

**This is the shared inbox for every AI (and human) working on Ravenstack Keep.**

If you are Claude, Gemini, Grok, Perplexity, Cursor, a local model, or another collaborator: **start here after the blueprint**, then leave your findings in this tree so others can review real artifacts — not private chat logs.

---

## Where to look (read order)

| Order | Path | What it is |
|------:|------|------------|
| 1 | [`../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md`](../RAVENSTACK-KEEP-BLUEPRINT-v0.2.md) | Living design brief (source of truth for scope) |
| 2 | This folder — [`findings/`](./findings/) | Dated reviews, pushback, research, Round Table notes |
| 3 | [`../docs/`](../docs/), [`../schemas/`](../schemas/), [`../agents/`](../agents/), [`../mcp/`](../mcp/) | Phase 1 concrete deliverables |
| 4 | [`INDEX.md`](./INDEX.md) | Living table of all findings (newest first) |

---

## Where to put your own findings

1. **Copy** [`findings/TEMPLATE.md`](./findings/TEMPLATE.md).
2. **Save as** `findings/YYYY-MM-DD-<your-name-or-model>-<short-topic>.md`  
   Examples:
   - `2026-07-30-claude-oracle-kill-condition.md`
   - `2026-07-30-gemini-mcp-auth.md`
   - `2026-07-31-local-phi4-roundtable-spike.md`
3. **Add a row** to [`INDEX.md`](./INDEX.md) (top of the table).
4. **Open a PR** (or push to an agreed branch) with a clear title:  
   `Review: <topic> (<model/name>)`.

Do **not** bury findings only in chat. Durable = in this repo.

---

## Rules (non-negotiable — same as the Keep)

- Local / free models by default; paid escalation explicit and cost-aware.
- **Kill condition** mandatory on every agent proposal.
- **No draft-to-execute** — specs and skills land on disk for human approval.
- Prefer small, reviewable files.
- **Do not invent new scope** outside the blueprint without calling it out as a proposal.
- Honest pushback is required. If something is wrong or over-engineered, say so plainly.
- Human (Jason) remains the final gate.

---

## What good findings look like

- **Claim** a blueprint open question (§12) or a Section 13 action.
- **Cite** files you reviewed (`agents/oracle.md`, `mcp/tools.md`, …).
- Separate **fact** (what exists) from **opinion** (what you recommend).
- End with **concrete next steps** another AI can take without re-reading your whole session.
- Optional: cost estimate, kill condition for any new agent/skill you propose.

---

## Round Table (multi-model deliberation)

When several AIs deliberate on one question:

1. Each participant may write a short finding under `findings/`.
2. Optionally add a synthesis file:  
   `findings/YYYY-MM-DD-roundtable-<topic>-synthesis.md`
3. Consensus that should become permanent must be **copied into** the blueprint, Agent Spec, or vault only after **human approval**.

See also: [`findings/2026-07-29-grok-phase1-session.md`](./findings/2026-07-29-grok-phase1-session.md) § Round Table feasibility.

---

## Sessions vs findings

| Kind | Use |
|------|-----|
| **Finding** | Focused review, answer to one question, research note, pushback |
| **Session log** | Longer “what we did this session” handoff (still under `findings/`, marked `type: session`) |

Both live under `findings/` so there is a **single place to scan**.

---

Operator: Jason  
Partner / first session doc: Grok (2026-07-29)
