# Agent tooling for this repo

What is installed, what you have to run once, and what each tool is actually for
on **this** codebase. Written 2026-11-24.

Two buckets, because they install in different places:

- **In the repo** (committed, every agent on every machine gets it): `.mcp.json`,
  `skills/keep-world-model/`, `skills/keep-migrations/`, `schemas/keep-world.schema.json`.
- **On a machine** (your Claude Code install): plugins and marketplace entries.

Nothing here contains a key, a token or a host. Context7 works keyless (rate
limited); GitHub MCP authenticates through `/mcp` in a session; Obsidian reads
`$OBSIDIAN_VAULT` (default `/root/obsidian_vault`).

---

## 1. One command block (Claude Code on the box or your laptop)

**Where to run it:** anywhere. Plugins install at account level, not per project,
so the working directory does not matter for anything in this block. The one
directory-bound thing is `.mcp.json`: it only loads for a Claude Code session
started in **this repo's root** (`/root/ravenstack-keep` on the box, or wherever
you cloned it on the PC). So run the block, then:

```bash
cd /root/ravenstack-keep && claude   # approve the project MCP servers on first start
```

```bash
set -uo pipefail

# Claude Code present?
command -v claude >/dev/null || { echo "claude not on PATH — install: npm i -g @anthropic-ai/claude-code"; exit 1; }

# Official marketplace (a fresh shell has not registered it)
claude plugin marketplace add anthropics/claude-plugins-official 2>/dev/null || true
claude plugin marketplace update claude-plugins-official 2>/dev/null || true

# Plugins. One failure does not abort the rest.
for p in typescript-lsp frontend-design code-review pr-review-toolkit \
         commit-commands superpowers security-guidance playwright; do
  claude plugin install "${p}@claude-plugins-official" || echo "  ! skipped: $p (not in this marketplace yet)"
done

# Browser for the Playwright MCP server (once per machine)
npx --yes playwright install chromium >/dev/null 2>&1 || echo "  ! chromium install skipped"

# Show what landed
claude plugin list --enabled
echo
echo "MCP servers for this repo come from ./.mcp.json — start claude here and approve them."
claude mcp list || true
```

Plugins installed this way load on the **next** Claude Code start (or `/reload-plugins`
in an open session). Scopes: no flag = user scope (every project on that machine).

### PowerShell (Windows PC)

Same thing, no bash needed:

```powershell
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace update claude-plugins-official
$plugins = 'typescript-lsp','frontend-design','code-review','pr-review-toolkit','commit-commands','superpowers','security-guidance','playwright'
foreach ($p in $plugins) { claude plugin install "$p@claude-plugins-official" }
npx --yes playwright install chromium
claude plugin list --enabled
cd C:\path\to\ravenstack-keep   # clone root, where .mcp.json lives
claude                          # approve the project MCP servers
```

## 2. MCP servers on a machine _outside_ this repo

`.mcp.json` is project scope, so it only applies when Claude Code runs in this
directory. For a user-wide install:

```bash
claude mcp add --scope user context7      -- npx -y @upstash/context7-mcp
claude mcp add --scope user playwright    -- npx @playwright/mcp@latest --headless
claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest
claude mcp add --scope user --transport http github https://api.githubcopilot.com/mcp/
claude mcp add --scope user obsidian \
  -e OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-/root/obsidian_vault}" \
  -- npx -y obsidian-mcp@2 serve --vault "notes=${OBSIDIAN_VAULT:-/root/obsidian_vault}"
```

Then `claude mcp list` and `/mcp` inside a session to authenticate GitHub.

## 3. What each one buys here

| Tool                    | Concrete use on ravenstack-keep                                                                                                                                                                                                         | Install                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Context7**            | Phaser 3.90 / TanStack Start / Nitro / Better Auth API truth instead of model memory — the SSR crash and the scene API are exactly where stale memory hurts                                                                             | project + user         |
| **Playwright MCP**      | Walk the Hall, measure the 390 px HUD overflow, screenshot talk sheets                                                                                                                                                                  | project + user         |
| **Chrome DevTools MCP** | Console + network + hydration warnings on the built Nitro server; the `Switched to client rendering` class of bug                                                                                                                       | project + user         |
| **GitHub MCP**          | Issue-per-PR discipline, read CI logs, base branch `ravenstack`                                                                                                                                                                         | project + user (OAuth) |
| **Obsidian MCP**        | The vault the AGENTS.md pointer is broken for (`RAVENSTACK-ORACLE.md`, `RAVENSTACK-ARCHITECTURE.md`)                                                                                                                                    | project + user         |
| Tailscale               | **not installed.** No official general-purpose server; the docs MCP at `tailscale.mcp.kapa.ai` is documentation-only, and third-party servers want tailnet credentials next to a model. Read-only `tailscale status` on the box instead | —                      |

Obsidian alternatives, if you would rather keep the Local REST API plugin model:
`obsidian-mcp-server` (needs the _Local REST API_ community plugin +
`OBSIDIAN_API_KEY`). The config above uses `obsidian-mcp@2` in direct-filesystem
mode, which needs no plugin and no running Obsidian.

## 4. Skills

**Account skills** (follow your Freebuff account into every chat, on every device):

`keep-honesty-audit`, `postgres-migration-guard`, `tanstack-start-ssr-audit`,
`phaser-hall-contract`, `ui-regression-triage`, `ravenserve-ops-readonly`.

**Repo skills** (versioned with the code, read by any agent working in the tree):

| Path                                             | Governs                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `skills/keep-world-model/SKILL.md`               | the one room/zone/NPC model, and how drift happened |
| `skills/keep-migrations/SKILL.md`                | the two-runner schema, prefix rules, repair pattern |
| `skills/keep-migrations/references/checklist.md` | copy-paste pre-merge checklist                      |
| `skills/keep-visual-pipeline/` (existing)        | painted art contract                                |
| `skills/keep-presence-reporter/` (existing)      | presence reporting rules                            |

## 5. Links

- Official plugin marketplace: <https://github.com/anthropics/claude-plugins-official>
- Plugin docs: <https://code.claude.com/docs/en/plugins/install>
- Context7: <https://context7.com>
- Playwright MCP: <https://github.com/microsoft/playwright-mcp>
- Chrome DevTools MCP: <https://github.com/ChromeDevTools/chrome-devtools-mcp>
- Obsidian (no plugin needed): <https://github.com/obsidianmd/obsidian-mcp> · (Local REST API route): <https://github.com/cyanheads/obsidian-mcp-server>

## 6. What this does not do

- Does not install anything on the Freebuff side beyond the account skills above.
- Does not give this cloud VM reach to the box, Ollama, Neon, the vault or the
  tailnet. Those stay unverifiable here — see `ravenserve-ops-readonly`.
- Does not add paid services. Context7's key is optional; no search API is wired.
