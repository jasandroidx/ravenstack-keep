---
title: Jules — operator card (Google async coding agent)
type: ops-sot
status: active
date: 2026-09-03
last_verified: 2026-09-03
note: Distilled from official docs. Docs change. Re-read changelog before trusting versions, limits, or MCP allowlist.
---

# Jules — operator card

**What it is:** Google Labs async coding agent. Not an IDE copilot. You assign work, it clones the repo into a short-lived Ubuntu VM, plans, edits, tests, then you publish a branch/PR.

**Fortress job:** Repo PRs on `jasandroidx/ravenstack-keep` (base `ravenstack`). Claude owns live Hetzner MCP. Jules does not SSH the box and does not invent occupancy.

**Official docs (re-read, do not mirror the site):** https://jules.google/docs/

## How to summon (pick one)

1. **Web:** jules.google.com → repo + branch → specific prompt → Give me a plan → approve.
2. **GitHub issue label:** add label `jules` (case-insensitive) on an issue the Jules GitHub App can see. Jules comments, then links a PR. Default for Keep issues #7–#16.
3. **CLI:** `npm i -g @google/jules` or `npx @google/jules`. `jules remote new --repo owner/repo --session "prompt"`.
4. **API (alpha):** `https://jules.googleapis.com/v1alpha` header `x-goog-api-key`. Sources, Sessions, Activities. Max 3 API keys.
5. **GitHub Action:** `google-labs-code/jules-action`. Secret `JULES_API_KEY`.

Do **not** fire ten issues at once unless quota allows.

## Prompt rules

Good: one scoped change, named files/behaviors, testable done-when.
Bad: “fix everything” / “optimize” / “make this better.”
Images: PNG/JPEG, ≤5MB, initial task only.
Always name: repo, base branch, issue URL, what not to touch.

## Repo files Jules actually reads

| File | Why |
|------|-----|
| **AGENTS.md** (repo root) | Auto-read. Issue #10. |
| README.md | Env setup hints if no script |
| Repo Configuration → Initial Setup | Explicit install/test script |
| Environment snapshot | After **Run and Snapshot** |

Setup script: install + test. No `npm run dev`, watchers, or long-lived servers.
Keep is Bun + ui-v2. Snapshot = `bun install` + the real test command.

## Good at / bad at

**Good:** tests, docs, scoped features, dependency bumps, bugfixes with a failing case, schema tests, UI empty/error states, AGENTS.md.
**Off-limits here:** live `reclaw-mcp-bridge`, Funnel, second gateway, Story Factory / county queue, Oracle go-live, inventing live occupancy, secrets in the repo.

## MCP

Changelog 2026-02-02: allowlist Linear, Stitch, Neon, Tinybird, Context7, Supabase. Settings → MCP → service API key.
Custom fortress URLs are not in that allowlist. Tailscale `:8100` will not work from Jules' VM.
Jules Keep tasks should not need vault writes. Prefer issue + AGENTS.md.

## Limits (verify on docs)

Free 15/day 3 concurrent. Pro 100/15. Ultra 300/60. Rolling 24h. Check https://jules.google/docs/usage-limits/

## Extras

- Suggested Tasks / Proactivity: Pro+Ultra, max 5 repos, starts at `#TODO`.
- Scheduled Tasks: Planning dropdown. Lint/deps only.
- Publish branch/PR mid-task via GitHub icon.
- Does not train on private repo content (docs). Still no secrets in the clone.
- GitHub App: Settings → Applications → Google Labs Jules → configure repos.

## Queue

https://github.com/jasandroidx/ravenstack-keep/issues/6 — start with label `jules` on #7 only.

## Stale rule

Re-read https://jules.google/docs/changelog and usage-limits. This file is not newer than those pages.
