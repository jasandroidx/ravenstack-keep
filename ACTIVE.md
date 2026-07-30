# ACTIVE — Ravenstack Keep

**Last updated:** 2026-07-29 (Grok)  
**Branch of truth:** `ravenstack`  
**Repo:** https://github.com/jasandroidx/ravenstack-keep

---

## How work moves (read this if you feel lost)

| Mode | What it is | When |
|------|------------|------|
| **Daily build** | Grok (partner) drives. Artifacts go on the repo. You approve. | Default — **this is how the project moves** |
| **Round Table** | Other AIs (Claude, etc.) review the **same hard question** and leave findings | Occasional — hard decisions only |
| **God-tier API council** | Roundtable.sh / multi-API paid | Almost never |

**Round Table does not run the project day to day.**  
**You + Grok + the repo do.** Other AIs are called when we need a second opinion on something specific.

---

## Where we are right now

**Done**
- Blueprint v0.2
- Phase 1 artifacts: Agent Spec template + schema, Oracle draft Spec, Keep MCP tool contracts
- Multi-AI `reviews/` inbox + protocol
- Round Table v0 policy: subscription seats only; multi-API = god-tier
- Multi-AI ops guide: `docs/MULTI-AI-OPS.md`

**Open (needs truth on the live box)**
- Claude says live model routing is **paid-first** (opposite of blueprint). Must verify before more agent work.
- Frozen county job may still be *running* even if cursor is stuck.
- No spend-visibility tool yet.

**Not started**
- Oracle live / smoke-test against RAG
- Keep MCP server implementation
- Visual rooms UI
- Clawforge loop

---

## Single active thread

### Phase 0 — Cost truth (before more Keep features)

1. Verify default model routing on the live fortress (Claude F1).
2. If paid-first: restore local-first (config only — operator or MCP session).
3. Note whether any spend reporting exists; if not, plan a minimal `get_cost_summary` on the **existing** MCP (not a second server yet).

Until step 1 is checked, **do not** mark Oracle live or build new always-on agents.

---

## What Grok is doing without waiting

- Keeping the repo and protocol clean
- Filing decisions and findings
- Preparing the next small artifact after cost truth is known

## What Jason needs to do only when ready

Pick **one**:

**A.** Open a Claude (or live-MCP) session and paste:  
> Re-check F1 model routing on the live fortress. Short finding only. No config changes unless I say so.

**B.** Check OpenClaw/model config yourself and tell Grok: “local-first is true” or “paid-first is true.”

**C.** Ignore live cost for tonight and tell Grok: “smoke-test Oracle next” (knowing we may be on paid path).

---

## Quick links

- Findings queue: [`reviews/INDEX.md`](./reviews/INDEX.md)
- How multi-AI works: [`docs/MULTI-AI-OPS.md`](./docs/MULTI-AI-OPS.md)
- Round Table policy: [`docs/roundtable-v0.md`](./docs/roundtable-v0.md)
- Blueprint: [`RAVENSTACK-KEEP-BLUEPRINT-v0.2.md`](./RAVENSTACK-KEEP-BLUEPRINT-v0.2.md)

---

*One active thread. One chair. Repo is the table.*
