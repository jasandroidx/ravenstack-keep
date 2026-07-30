# Chrome DevTools MCP failure — root cause (2026-07-30)

## Symptom

Fresh Grok session:

```
chrome-devtools handshake failed: Broken pipe (os error 32)
  when send initialize request
```

Tools (`list_pages`, `take_screenshot`, …) never appear.

## Evidence

Grok MCP stderr (`~/.grok/logs/mcp/chrome-devtools.stderr.log`):

```
env: 'node': No such file or directory
env: use -[v]S to pass options in shebang lines
```

## Cause

Config used:

```toml
command = "/home/sirboydimus/.local/node/bin/npx"
```

`npx` is a script with shebang `#!/usr/bin/env node`. Grok’s MCP spawn PATH is
minimal (`/usr/bin:/bin`) and does **not** include `~/.local/node/bin`, so
`env node` fails. Child dies immediately → broken pipe on initialize.

Chrome itself is fine (151.x, headless screenshots worked via CLI).

Reproduce:

```bash
# fails (exit 127)
env -i HOME=$HOME PATH=/usr/bin:/bin \
  ~/.local/node/bin/npx -y chrome-devtools-mcp@1.6.0 --help

# works
env -i HOME=$HOME PATH=/usr/bin:/bin \
  ~/.local/node/bin/node \
  ~/.local/node/lib/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js --help
```

## Fix applied (`~/.grok/config.toml`)

- `command` = absolute `node`
- `args[0]` = absolute path to globally installed `chrome-devtools-mcp@1.6.0` entry
- `env.PATH` includes `~/.local/node/bin`

Verified:

```bash
grok mcp doctor chrome-devtools
# ✓ handshake OK · 29 tools discovered
```

## Required next step

**Open a new Grok chat** (or restart Grok Build). This session still has the
dead connection from boot; config reload does not re-attach mid-session.

## Not the cause

- Fresh vs old chat (red herring)
- Chrome sandbox (we use `--no-sandbox` + system Chrome)
- Plugin package itself (works when node is reachable)
