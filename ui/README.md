# Ravenstack Keep — Visual Shell

Phaser 3 fortress map over Keep MCP state. Mystical stone + neon, 48×48 rooms.

## Quick start (laptop)

Terminal 1 — Keep HTTP API (same SQLite as MCP):

```bash
cd ~/ravenstack-keep
export PYTHONPATH="$PWD/mcp/src"
export PATH="$HOME/.local/node/bin:$PATH"   # if node installed to ~/.local/node
.venv/bin/python -m ravenstack_keep_mcp.http_api
# → http://127.0.0.1:8120
```

Terminal 2 — Vite UI (proxies `/api` → 8120):

```bash
cd ~/ravenstack-keep/ui
export PATH="$HOME/.local/node/bin:$PATH"
npm run dev
# → http://127.0.0.1:5173
```

Open **http://127.0.0.1:5173**. You should see 8 rooms from the canonical castle map.

## Live chips (Track 2)

Pending human gates are mirrored into `agent_status` automatically on
`GET /api/castle-map` (and `GET|POST /api/sync-status`):

- pending `approve_spec` → occupant chip `waiting_human` (amber)
- gate resolved → that sync row clears to `idle`

No fake A2A — only real pending-gate truth. Agents can still call
`POST /api/report-status` / Keep MCP `report_agent_status` for working/answering.

```bash
curl -s http://127.0.0.1:8120/api/sync-status
# manual override still works:
curl -s -X POST http://127.0.0.1:8120/api/report-status \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"clawforge","state":"working","task":"building"}'
```

Within one poll (~3s) the map chips update. Gate vignette soft-glows when inbox non-empty.

## Approvals

- **Map:** select room or gate card → confirm dialog → `confirm=true` POST.
- **Grok chat:** Keep MCP tools `approve_spec` / `unlock_room` with `confirm=true`.

## Production serve (single process — Track 1)

Build once, then Keep HTTP serves UI + API from the same port:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ravenstack-keep/ui && npm run build
# → ui/dist/  (index.html, assets/*, favicon.*, pipeline.json)

cd ~/ravenstack-keep
export PYTHONPATH="$PWD/mcp/src"
# laptop loopback:
.venv/bin/python -m ravenstack_keep_mcp.http_api
# → http://127.0.0.1:8120/          (SPA)
# → http://127.0.0.1:8120/api/*     (same SQLite as Keep MCP)
```

Smoke after build/restart:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8120/                 # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8120/favicon.ico      # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8120/pipeline.json    # 200
curl -s http://127.0.0.1:8120/api/health
```

Static files are resolved **at request time** (`ui/dist` preferred, then `ui/public`).
Restart the API after first-ever `npm run build` if the process started with no dist yet;
asset **hashes** do not require a restart (new `index.html` is read per request).

### Hetzner / Tailscale

```bash
cd ~/ravenstack-keep/ui && npm run build
KEEP_HTTP_HOST=0.0.0.0 KEEP_HTTP_PORT=8120 \
  PYTHONPATH=mcp/src .venv/bin/python -m ravenstack_keep_mcp.http_api
# Prefer binding only on tailscale0 (or UFW allow from Tailscale peers only).
# Open: http://100.x.x.x:8120
```

Dev (`npm run dev` on :5173) remains the day-to-day loop; production mode is for laptop
single-port demos and later remote access.

## Art pack (stone + neon)

```bash
# Engine-ready P0 tiles + P1 façades + chips (palette-locked, 48×48 / 16×16):
python3 scripts/generate_keep_art.py

# After dropping Super Grok / Imagine PNGs into public/art/input/:
python3 scripts/process_ravenstack_art.py
```

Assets live under `public/art/`. Direction: [docs/ART-DIRECTION.md](./docs/ART-DIRECTION.md).  
`KeepScene` loads `/art/...` and falls back to solid rectangles if textures missing.

## Contract

See [docs/UI-CONTRACT.md](./docs/UI-CONTRACT.md).
