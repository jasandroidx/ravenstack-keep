# Round Table v0 — Operator Runbook

**Status:** Accepted policy (2026-07-29)  
**Decision record:** [`reviews/findings/2026-07-29-grok-roundtable-v0-decision.md`](../reviews/findings/2026-07-29-grok-roundtable-v0-decision.md)

---

## 1. What Round Table is (v0)

**Default:** Several subscription AI seats (Grok, Claude, Gemini, …) deliberate on the **same hard question** with **shared context** (blueprint + `reviews/findings/` + MCP/vault as available). Each seat writes a **finding**. **Jason chairs** and accepts or rejects.

**Not default:** Multi-frontier **API** councils (Roundtable.sh, N-way OpenRouter fanout, etc.). Those are **god-tier only** — rare, cost shown first, same discipline as god model tier.

**Why:** Parallel paid frontier calls can cost on the order of $1–5 per hard question. That is not sustainable as normal Keep infrastructure on a tight monthly API budget.

---

## 2. When to call the table

Hard design questions only:

- Blueprint open questions (§12)
- Agent Spec / kill-condition / cost debates
- Architecture choices (MCP shape, front-end path, phase order)
- Live-substrate findings that need multi-model pushback

**Not** for status, triage, ambient chat, or routine agent work.

---

## 3. How to run a subscription Round Table

1. **Pick the question** (one sentence + constraints).
2. **Point every seat** at:
   - Repo: `https://github.com/jasandroidx/ravenstack-keep` branch `ravenstack`
   - Blueprint + `reviews/README.md` + `reviews/INDEX.md` + relevant findings
   - The multi-AI protocol (paste if needed)
3. **Each AI** writes a finding under `reviews/findings/` using `TEMPLATE.md` and updates `INDEX.md` (or the partner AI files it for them).
4. **Operator** reads INDEX, decides, and optionally records acceptance in a short finding or vault note.
5. **Only after human approval** may consensus language enter the blueprint, an Agent Spec, or production config.

### Standing seats (suggested)

| Seat | Role |
|------|------|
| Grok (partner) | Architecture, research, protocol, filing |
| Grok Build | Scaffolding, schemas, code-shaped artifacts |
| Claude | Live substrate verification, hard pushback |
| Others (Gemini, …) | By invitation on specific questions |

---

## 4. God-tier multi-API council (optional, rare)

Tools such as [Roundtable.sh](https://roundtable.sh) remain valid **only when**:

- Operator explicitly triggers them
- Cost is previewed and accepted
- Question is high-stakes enough to justify API spend
- Output is still filed as a finding and **not** auto-executed

Do **not** install or cron these for v0 default work.

---

## 5. Cost rules (non-negotiable)

- Default table = **$0 marginal** beyond existing subscriptions
- No ambient multi-model API chatter
- Monthly API ceiling still stops paid traffic when enforced
- Local / free models remain default for agents inside the fortress

---

## 6. Relationship to blueprint Phase 5

Blueprint Phase 5 (“Round Table integration”) is satisfied in **spirit** by this v0 protocol. A visual “table in the Keep UI” and automated multi-API invokers stay later, value-gated, and budget-gated.

---

*Human remains the final gate. Round Table advises; it does not decide.*
