---
date: 2026-07-29
author: Grok (xAI) + operator Jason
type: finding
topic: Round Table v0 decision — subscription seats, not multi-API default
status: accepted
blueprint_refs: ["§6", "§3.5", "§8 Phase 5", "§12.Q2", "§13.D"]
files_reviewed:
  - "reviews/findings/2026-07-29-claude-live-substrate-review.md"
  - "reviews/findings/2026-07-29-grok-roundtable-vehicle-recommendation.md"
  - "docs/roundtable-v0.md"
  - "RAVENSTACK-KEEP-BLUEPRINT-v0.2.md"
supersedes: "reviews/findings/2026-07-29-grok-roundtable-vehicle-recommendation.md"
---

# Finding: Round Table v0 decision (accepted)

## Summary

**Operator decision (2026-07-29):** The default Ravenstack Keep Round Table is **not** a multi-frontier API council (Roundtable.sh / parallel paid heads). That pattern is unaffordable as normal infrastructure on a ~$10/month API budget.

**Round Table v0 = subscription seats + shared repo/MCP context + durable findings + human chair.**  
**Roundtable.sh / multi-API parallel deliberation = god-tier only** (rare, cost shown first, same discipline as god model tier).

This aligns the blueprint’s goal (multi-model deliberation with shared context and durable decisions) with the cost model’s non-negotiable rules.

## What I read

- Claude live-substrate review (F9 Round Table economics)
- Prior Grok Roundtable.sh vehicle recommendation
- Blueprint §6 / §3.5 / Phase 5 placement
- Today’s actual multi-AI work (Grok + Claude + Grok Build via repo findings)

## Findings (facts)

- Multi-API multi-round councils can cost on the order of **$1–5 per hard question**.
- Against a tight monthly API budget, that is not a sustainable default feature.
- Subscription seats (SuperGrok, Claude, etc.) + GitHub `reviews/findings/` + existing Ravenstack MCP already delivered real multi-model review today at **$0 marginal** inference cost beyond subscriptions already paid.
- The *goal* of Round Table is deliberation + shared truth + durable minutes + human gate — not a specific CLI.

## Decision (binding until operator revises)

| Layer | v0 rule |
|-------|--------|
| **Default Round Table** | Subscription AI seats (Grok, Claude, Gemini, …) given the same question + blueprint/findings context; each writes a finding under `reviews/findings/`; operator chairs |
| **Shared context** | Repo (`ravenstack` branch) + existing MCP / vault reads — not a new multi-model server |
| **Durable output** | `reviews/findings/` + INDEX; vault notes only after human approval |
| **Paid multi-API council** (Roundtable.sh, OpenRouter N-way fanout, etc.) | **God-tier only** — explicit operator trigger, cost preview, no cron, no ambient use |
| **Agent Mind Bridge** | Not in v0 (license / maturity / tool-surface cost); revisit only if multi-day shared threads become necessary |

## Pushback / risks

- Async subscription tables are slower than one-shot API councils — acceptable trade for cost.
- Operator must still **paste protocol** and **point AIs at the repo**; process discipline is the product.
- Do not let “Round Table” become an excuse for ambient multi-AI chatter on paid APIs.

## Recommendations

1. Treat this finding as **accepted** policy for Keep Round Table v0.
2. Update `docs/roundtable-v0.md` to the subscription-seat runbook (companion commit).
3. Mark the earlier Roundtable.sh-as-first-vehicle finding **superseded**.
4. Do **not** install Roundtable.sh until a specific god-tier question is approved with a cost preview.
5. Continue multi-AI work via the existing `reviews/` protocol (see multi-AI ops note in companion docs / operator handoff).

## Open questions for the operator / other AIs

1. Confirm monthly API ceiling number to publish in blueprint/cost docs (Claude cited ~$10/month from vault).
2. Which subscription seats are in the standing table? (Proposed default: Grok partner, Claude, Grok Build for scaffolding; others by invitation.)

## Concrete next steps (for the next AI)

- [x] Record this decision on `ravenstack`.
- [ ] Update `docs/roundtable-v0.md` to match (subscription-first).
- [ ] Do not implement Roundtable.sh install tasks from older findings.
- [ ] Next real work: operator priorities among Phase 0 cost verification (Claude F1) vs Oracle smoke-test vs MCP direction (extend existing vs second server).

## Kill conditions / cost notes

- Any future `roundtable-invoker` skill that calls paid multi-API heads: default off; requires explicit operator flag + cost preview; monthly ceiling still stops paid calls.
- If subscription-seat process is ignored and paid APIs become ambient, treat as process failure and tighten gates.

---

*Round Table advises. Human decides. Budget is a hard wall.*
