# Keep visual shell — session 2 notes (2026-07-30)

## Chrome DevTools MCP status

**Not available in this Grok session.** Session start reported:

```
chrome-devtools handshake failed: Broken pipe (os error 32)
```

`search_tool` for chrome-devtools tools returned nothing useful (no `list_pages` / `navigate_page` / `take_screenshot` from that server).

Config in `~/.grok/config.toml` looks correct (npx `chrome-devtools-mcp@1.6.0`, headless, system Chrome).  
**Workaround used:** system Chrome headless screenshot + puppeteer-core against `/usr/bin/google-chrome-stable`.

If tools are still missing after a **brand-new chat**, try:

1. Confirm plugin list includes `chrome-devtools-mcp`
2. Raise `startup_timeout_sec` (already 90)
3. Run once:  
   `npx -y chrome-devtools-mcp@1.6.0 --headless --executablePath=/usr/bin/google-chrome-stable --chromeArg=--no-sandbox`
4. Check Grok MCP server logs for the broken pipe

## Runtime (verified live)

| Service | URL | Status |
|---------|-----|--------|
| Keep HTTP API | http://127.0.0.1:8120 | ok (`/api/health`, 8 rooms, SOT CANONICAL) |
| Vite UI | http://127.0.0.1:5173 | LIVE · SOT CANONICAL · canvas present |

## Polish shipped this session

1. **favicon** — `public/favicon.ico` + keep-themed `favicon.svg`; linked from `index.html`. No more favicon 404.
2. **Room / gate selection**
   - Gate card click → detail panel + map selection + camera pan
   - Labels/sublabels on map are clickable
   - Active gate card highlight when related room selected
3. **Gated actions (SOT-safe)**
   - `window.confirm` with explicit SOT copy
   - Cancel → toast `Cancelled — no SOT change` (verified; gate still pending)
   - POST always sends `confirm: true` only after dialog OK
   - Detail panel shows unlock blocked hint when occupant is draft
4. **Map poll flicker** — incremental `applyMap` when room id set is stable

## API gate checks (no SOT write)

```
POST /api/approve-spec {confirm:false} → confirm_required
POST /api/unlock-room  {confirm:false} → confirm_required
POST /api/unlock-room  {confirm:true}  (oracle still draft) → spec_not_approved
```

## Puppeteer pass

- `LIVE · SOT CANONICAL`, 8 rooms, 1 gate (oracle approve_spec)
- Gate click → Oracle detail + Approve/Unlock buttons
- Confirm cancel leaves SOT untouched
- Console errors: **none**
- Failed requests / favicon fails: **none**
- Screenshot: `ui/debug-screenshot.png`

## Still open / next

1. Get chrome-devtools MCP tools attached in a future session
2. Optional: custom confirm modal (vs `window.confirm`) for map aesthetic
3. Hetzner/Tailscale serve after `npm run build`
4. Aesthetic pack (48×48 stone+neon) only after status/gates stay solid
5. Skills that call `report_agent_status` so chips move without manual curl
6. Do **not** auto-approve oracle from map without explicit human intent

## Do not

- Fork pixel-agents / virtual-office
- Invent A2A
- Second OpenClaw gateway
- Merge reclaw-platform ops into Keep map
