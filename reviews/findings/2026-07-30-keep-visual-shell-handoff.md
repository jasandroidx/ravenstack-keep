# Handoff — Ravenstack Keep visual shell (2026-07-30)

**Status:** Working on laptop. Continue in a **new Grok Build session** so `chrome-devtools` MCP tools attach.

## What we shipped

| Piece | Path / how to run |
|-------|-------------------|
| Phaser 3 fortress map + gate HUD | `ui/` |
| Keep HTTP API (same SQLite as MCP) | `python -m ravenstack_keep_mcp.http_api` → `:8120` |
| UI contract | `ui/docs/UI-CONTRACT.md` |
| Pipeline edges (UI-only) | `ui/public/pipeline.json` |
| Architecture plan | session plan (hybrid thin shell; no office forks) |

### Run (two terminals)

```bash
# 1 — API
cd ~/ravenstack-keep
export PYTHONPATH="$PWD/mcp/src"
.venv/bin/python -m ravenstack_keep_mcp.http_api
# http://127.0.0.1:8120

# 2 — UI
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ravenstack-keep/ui && npm run dev
# http://127.0.0.1:5173
```

### Verified (Chrome headless)

- Boot OK (fixed Phaser race: wait for scene ready; no more `scene is null`)
- `LIVE · SOT CANONICAL`, 8 rooms, canvas present
- Gate inbox shows Oracle `approve_spec`
- Screenshot: `ui/debug-screenshot.png`
- Harmless 404: `/favicon.ico` (svg exists)

### Locked product decisions

1. **Engine:** Phaser 3  
2. **Host:** laptop first → later Hetzner/Tailscale  
3. **Approvals:** map **and** Grok Keep MCP (`confirm=true`)  
4. **No** OpenClaw session clutter — rooms/agents only  
5. **UNFORGED** = sealed empty rooms OK; Lead Forge stays sealed (gates = inbox, not a fake agent)  
6. **Art later** — solid 48×48 blocks now; upgrade path open  
7. Aesthetic: mystical stone + neon, 48×48  

### Chrome DevTools MCP (for new session)

Config already in `~/.grok/config.toml`:

```toml
[mcp_servers.chrome-devtools]
command = "/home/sirboydimus/.local/node/bin/npx"
args = [
  "-y",
  "chrome-devtools-mcp@1.6.0",
  "--no-usage-statistics",
  "--headless",
  "--executablePath=/usr/bin/google-chrome-stable",
  "--chromeArg=--no-sandbox",
  "--viewport=1280x720",
]
enabled = true
startup_timeout_sec = 90
```

Chrome binary: `/usr/bin/google-chrome-stable` (installed).  
Plugin: `chrome-devtools-mcp` enabled under `[plugins]`.

**Old sessions do not see these tools** — must start a new chat after config.

### Suggested first prompt in new chat

```
Continue Ravenstack Keep visual shell from reviews/findings/2026-07-30-keep-visual-shell-handoff.md.

1. Confirm chrome-devtools MCP tools are available.
2. Open http://127.0.0.1:5173/ (start API+Vite if down).
3. Screenshot + list console errors.
4. Then improve UX: favicon.ico 404, room click selection polish, ensure approve_spec from map works end-to-end without breaking SOT rules.
```

### Next work (priority)

1. DevTools pass: console clean, click room → detail, gate approve dry-run  
2. Optional: `favicon.ico` or link svg in `index.html`  
3. Hetzner/Tailscale serve after `npm run build`  
4. Aesthetic pack only after status/gates feel solid  
5. Skills that call `report_agent_status` so rooms move without manual curl  

### Do not

- Fork pixel-agents / virtual-office as product core  
- Invent A2A/roundtable activity  
- Merge reclaw-platform ops into Keep map  
- Second OpenClaw gateway  

### Related SOT

- `KEEP-SOT-DECISION.md` — canonical rooms  
- `mcp/seeds/castle_map.json` — coordinates  
- Keep MCP tools — `approve_spec` / `unlock_room` gated  
