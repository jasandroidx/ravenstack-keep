# Multi-AI operations — Ravenstack Keep

How Jason + Grok + Claude + Grok Build (+ others) actually run the project without chaos or budget burn.

**Repo:** https://github.com/jasandroidx/ravenstack-keep  
**Branch of truth:** `ravenstack`

---

## 1. Source of truth

| Thing | Where |
|-------|--------|
| Scope | `RAVENSTACK-KEEP-BLUEPRINT-v0.2.md` |
| Collaboration rules | `reviews/README.md` |
| What’s been said | `reviews/INDEX.md` + `reviews/findings/` |
| Round Table policy | `docs/roundtable-v0.md` |
| Phase 1 artifacts | `docs/`, `schemas/`, `agents/`, `mcp/` |

Chat is disposable. **Findings are durable.**

---

## 2. Roles (practical)

| Who | Best used for |
|-----|----------------|
| **Jason (operator)** | Priorities, approvals, live config changes, money, final gate |
| **Grok (partner)** | Architecture, research, protocol, filing others’ work, synthesis |
| **Grok Build** | Scaffolding: schemas, templates, MCP contracts, small code artifacts |
| **Claude** | Live MCP/substrate verification, adversarial review, “is this actually true on the box?” |
| **Gemini / others** | Invited reviews on specific questions; must follow protocol |

---

## 3. How to delegate a task

1. **Pick one action** from blueprint §13 or from an open finding (e.g. Claude F1 verify).
2. **Assign a seat** (who is best).
3. **Give them:**
   - Repo URL + branch `ravenstack`
   - Protocol blurb (`reviews/README.md` rules)
   - Exact question or deliverable
   - Constraint: finding via TEMPLATE, no draft-to-execute, no live config without OK
4. **They produce** a finding (or you/Grok file it for them).
5. **You** mark status on INDEX: `accepted` / reject / ask for revision.
6. **Only then** implementation or config change.

### Example prompts to paste

**To Claude (verify):**  
> Read `reviews/findings/2026-07-29-claude-live-substrate-review.md` on jasandroidx/ravenstack-keep branch ravenstack. Re-check F1 (model routing) and F3 (host.docker.internal) against live MCP. Write a short finding using `reviews/findings/TEMPLATE.md`. Do not change any config.

**To Grok Build (scaffold):**  
> Repo jasandroidx/ravenstack-keep branch ravenstack. Draft only: minimal `get_cost_summary` contract as an extension note under `mcp/` — no server process. Follow blueprint local-first. Open a finding describing what you added.

**To Grok (synthesize):**  
> Read INDEX + latest findings. Propose the single highest-leverage next task under Phase 0 cost discipline. File a finding.

---

## 4. How to see problems

1. Open **`reviews/INDEX.md`** — anything `needs operator decision` is a queue for you.
2. Read **Claude live-substrate** finding for production drift (cost, freeze, gates).
3. Read **Phase 1 session** finding for artifact quality and backlog.
4. Live box: use Ravenstack MCP sitrep / models / gates tools when available — prefer evidence over memory.

---

## 5. Decision loop (keep it small)

```
INDEX shows problem/proposal
    → Operator prioritizes ONE thing
    → Delegate to one AI seat
    → Finding lands on repo
    → Operator accepts / rejects
    → If accept: implement (config or small PR) or assign implementer
    → Update INDEX status
```

Never parallelize five build streams on a solo budget. **One active build thread + background review seats** is enough.

---

## 6. Current priority stack (after Round Table decision)

Suggested order until you reorder:

1. **Phase 0 cost truth** — verify Claude F1/F2/F3; restore local-first if confirmed; get *some* spend visibility path planned
2. **Freeze integrity** — F4 county job: stop or deliberately unfreeze
3. **Oracle** — smoke-test five queries against live RAG while still `draft`
4. **MCP direction** — decide extend-existing vs second Keep MCP (Claude vs earlier blueprint)
5. **Only then** more agents / UI / forge loop

---

## 7. Hard rules (same as Keep)

- Local-first for fortress agents
- Kill conditions mandatory on agent proposals
- No draft-to-execute
- Human is the only merge/config authority on production
- Findings over chat logs
- Paid multi-model API = god-tier only

---

*Many minds. One repo. One chair.*
