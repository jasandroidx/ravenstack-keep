# Keep visual shell — session 3 notes (2026-07-30)

## Chrome DevTools MCP

**Working in this session.** Tools present (`list_pages`, `navigate_page`, `take_screenshot`, …).

Prior root cause (PATH/`env node` on npx shebang) remains fixed via absolute `node` + absolute `chrome-devtools-mcp.js` in `~/.grok/config.toml`.

Screenshot path: MCP `filePath` under repo was denied once; saved to `/tmp/keep-debug-screenshot.png` then copied to `ui/debug-screenshot.png`.

## Status table (end of session)

| Check | Result |
|-------|--------|
| chrome MCP | OK (~29 tools) |
| API :8120 | LIVE, SOT CANONICAL, 8 rooms |
| UI Vite :5173 | LIVE · SOT CANONICAL |
| UI prod :8120 | SPA + assets + favicon after build |
| gates | 1 pending: oracle `approve_spec` |
| console | Clean of app errors (headless WebGL warn only) |
| favicon | 200 on both :5173 and :8120 |
| gate → Oracle detail | OK (JS click); SOT unlock-blocked hint shown |
| confirm Cancel | Toast `Cancelled — no SOT change`; gate still pending |

## Shipped this session

1. **Chrome DevTools pass** on both `:5173` and production `:8120`.
2. **Gate cancel re-verified** — dismiss dialog leaves draft + pending gate.
3. **Gate card a11y** — removed nested `role="button"` on `<article>` that wrapped a real button; `aria-label` on card.
4. **Track 1 — deploy prep**
   - `npm run build` → `ui/dist/`
   - `http_api.py` now serves at request time:
     - `/` → `ui/dist/index.html`
     - `/assets/{path}` → hashed Vite assets
     - `/favicon.ico`, `/favicon.svg`, `/pipeline.json`, `/castle_map.json`, `/icons.svg`
   - Prior gap: index returned 200 but assets/favicon 404 until Mount/routes fixed + API restart.
5. **README** — production single-process serve + smoke curls + Tailscale note.

## API SOT checks (no human approve)

```
POST approve-spec confirm:false → confirm_required
POST unlock-room confirm:true (oracle draft) → spec_not_approved
GET gates → still pending oracle approve_spec
```

## Files touched

- `ui/src/hud.ts` — gate card a11y
- `ui/README.md` — production serve docs
- `mcp/src/ravenstack_keep_mcp/http_api.py` — robust static SPA serve
- `ui/dist/*` — build output
- `ui/debug-screenshot.png` — refreshed

## Still open / next

1. Track 2 — wire real `report_agent_status` sources so chips move without manual curl (no fake A2A).
2. Track 3 — aesthetic 48×48 stone+neon (only after status/gates stay solid).
3. Optional custom confirm modal (window.confirm still OK).
4. Do **not** auto-approve oracle without explicit human intent.

## Do not

- Fork pixel-agents / virtual-office
- Invent A2A
- Second OpenClaw gateway
- Merge reclaw-platform ops into Keep map
