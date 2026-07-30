# Keep visual shell — session 4 (review + Track 2)

## A. Local code review

- Diff scope: Keep visual shell (`ui/`, `http_api.py`, session findings)
- Full notes: `reviews/findings/2026-07-30-keep-visual-shell-review.md`
- Scratch: `/tmp/grok-1000/grok-review-b9ce8a20.md`

| Severity | Count | Fixed this session? |
|----------|-------|---------------------|
| bug | 3 | yes |
| suggestion | 3 | yes (unlock disabled, seed null, MCP unlock gate resolve) |
| nit | 1 | yes (`type="button"`) |

### Bugs fixed

1. **Selection poll clobber** — `main.ts` now keeps `selectedId` shared by map + gate cards.
2. **Invalid JSON → 500** — `_json_body()` on gated/report POSTs → 400.
3. **CORS `*`** — default origins Vite localhost only; override via `KEEP_HTTP_CORS_ORIGINS`.

## B. Track 2 — live chips from real gates

`sync_status_from_gates()` on `GET /api/castle-map` (+ `/api/sync-status`):

- pending `approve_spec` → `waiting_human` + gate summary (`detail=sync:pending_gate`)
- gate gone → clear those rows to `idle`
- no invented A2A

Verified live:

- Oracle chip: `waiting_human` / “Draft Agent Spec… awaits human approval”
- Manual `report-status` still works (clawforge → working)
- Gate still pending (no auto-approve)
- Gate select sticks past 3s poll; unlock button disabled while draft

## Do not

- Auto-approve oracle without human yes
- Fake A2A
- Second OpenClaw gateway
