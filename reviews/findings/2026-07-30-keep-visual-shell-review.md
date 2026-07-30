## Summary

The visual shell is largely SOT-aligned: gated POSTs require strict `confirm is True`, cancel never hits the network, `approve_spec` does not unlock, unlock blocks draft occupants, static asset paths are whitelist + `resolve`/`relative_to` hardened, and the UI contract matches live enrichment (`agent_real`, draft/candidate chips, no invented A2A). The main functional defect is selection state owned only by map clicks in `main.ts`, so gate-card selection is overwritten on the next poll. Secondary gaps: unvalidated JSON bodies on gated routes (easy 500s) and `CORSMiddleware(allow_origins=["*"])` on SOT-writing endpoints, which undermines the human-gate model from any browser origin.

## Issues

### Issue 1 -- Severity: bug
- File: /home/sirboydimus/ravenstack-keep/ui/src/main.ts:83
- Description: Poll refresh authority for selection is `selected` in `boot()`, but that variable is only assigned in the map `setRoomClickHandler` (lines 95–98). Gate-card / HUD selection goes through `onSelectRoom` (lines 89–92), which updates the scene and HUD but never sets `selected`. After a map click on room A and a gate click on room B (e.g. Oracle), the next `refresh()` (lines 113–121) rebinds `selected` to A and calls `hud.setSelectedRoom` / `scene.setSelected` for A — undoing gate selection within ~3s. The same clobber runs after a successful gate approve/unlock because `onRefresh` uses the stale `selected`.
- Suggestion: Keep a single source of truth: in `onSelectRoom`, resolve the room from `map.rooms` (or change the callback to pass `RoomChip`) and assign `selected = room`. Optionally have `Hud` call a shared `selectRoom(room)` used by both map and gates.
- Status: open

### Issue 2 -- Severity: bug
- File: /home/sirboydimus/ravenstack-keep/mcp/src/ravenstack_keep_mcp/http_api.py:147
- Description: Gated handlers (`approve_spec` L148, `unlock_room` L166, also `report_status` L119) call `body = await request.json()` then `body.get(...)` with no guard. Invalid JSON / empty body raises and becomes a 500; a non-object JSON body (e.g. `true` or `[]`) raises `AttributeError` on `.get`. Confirm gating never runs cleanly for malformed requests.
- Suggestion: Wrap JSON parse in try/except and return `_err("invalid_body", ..., status=400)` if not `isinstance(body, dict)` before `_require_confirm`.
- Status: open

### Issue 3 -- Severity: bug
- File: /home/sirboydimus/ravenstack-keep/mcp/src/ravenstack_keep_mcp/http_api.py:293
- Description: CORS is fully open (`allow_origins=["*"]`, all methods/headers). Gated SOT writes (`POST /api/approve-spec`, `/api/unlock-room`) only require `confirm: true` in the JSON body — no auth, CSRF token, or Origin check. Any page the operator visits can preflight-success and POST `{confirm:true,...}` to `http://127.0.0.1:8120` (default host) or to a Tailscale/`0.0.0.0` bind, writing Agent Spec status / room lock_state without the map’s `window.confirm`. That bypasses the product’s human-intent gate for browser clients.
- Suggestion: Default CORS to the Vite origin only (`http://127.0.0.1:5173`) or disable CORS when UI is same-origin on `:8120`. For network binds, require a shared secret header / loopback-only gated writes, and document that `KEEP_HTTP_HOST=0.0.0.0` is unsafe without auth.
- Status: open

### Issue 4 -- Severity: suggestion
- File: /home/sirboydimus/ravenstack-keep/ui/src/api.ts:45
- Description: Offline seed fallback sets `agent_state: r.agent_state ?? "idle"` for every room. UI-CONTRACT.md states activity is only from Keep MCP / `report-status` and lists `null` as a valid state; inventing `idle` paints cyan “activity” chips for candidates when the API is down, which is misleading vs “not reporting.”
- Suggestion: Leave `agent_state` undefined/null on seed path; style null like empty/`—` (already partially handled in `styleBundle` / detail).
- Status: open

### Issue 5 -- Severity: suggestion
- File: /home/sirboydimus/ravenstack-keep/ui/src/hud.ts:178
- Description: When unlock is SOT-blocked (draft occupant), the Unlock button stays enabled with only a `title` and hint text (L158–161, L185–188). User can still pass `window.confirm` and receive `spec_not_approved` from the API. Server enforcement is correct; UX invites a dead-end confirm.
- Suggestion: Disable the unlock button when `unlockBlocked` (or hide it) and keep the existing detail hint; still rely on API as source of truth.
- Status: open

### Issue 6 -- Severity: suggestion
- File: /home/sirboydimus/ravenstack-keep/mcp/src/ravenstack_keep_mcp/http_api.py:165
- Description: HTTP `unlock_room` correctly blocks non-approved specs and resolves matching pending gates (L200–202). MCP `server.py` `unlock_room` does not resolve `unlock_room` gates. Same SQLite, two entry points → map inbox can stay “pending” after MCP unlock. Not a UI cancel/SOT bug, but parity noise for the shared control plane.
- Suggestion: Share one unlock helper used by MCP and HTTP (resolve gates + status_summary string), or document intentional difference.
- Status: open

### Issue 7 -- Severity: nit
- File: /home/sirboydimus/ravenstack-keep/ui/src/hud.ts:240
- Description: Gate-card action buttons from `actionsForGate` omit `type="button"` (detail-panel buttons correctly set it at L176). Harmless while not inside a `<form>`, inconsistent with the detail panel markup.
- Suggestion: Add `type="button"` to gate action buttons for consistency.
- Status: open
