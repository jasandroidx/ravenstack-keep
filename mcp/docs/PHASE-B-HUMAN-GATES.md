# Phase B — Human gates

## Inbox
`GET /api/gates` (and MCP `list_pending_gates`) lists pending:

| gate_type | subject | Action |
|-----------|---------|--------|
| `approve_spec` | agent_id | Promote Spec draft → approved on disk |
| `unlock_room` | room_id | Set room `lock_state` → `live` |

Auto-seeded from SOT: draft Specs and UNFORGED rooms.

## Gated writes (confirm=true required)
```bash
curl -X POST http://127.0.0.1:8120/api/approve-spec \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"oracle","confirm":true}'

curl -X POST http://127.0.0.1:8120/api/unlock-room \
  -H 'Content-Type: application/json' \
  -d '{"room_id":"library","confirm":true}'
```

MCP tools: `approve_spec`, `unlock_room`, `list_pending_gates`.

## Map UX
- Gate cards in HUMAN GATES panel; Approve / Unlock buttons.
- Room detail: Approve spec… / Unlock room… with browser confirm.
- Pending gates → occupant chips `waiting_human` (amber).
- Unlock blocked while occupant Spec is still draft.

## SOT rules
1. `approve_spec` does **not** unlock rooms.
2. `unlock_room` requires approved/live occupant when one is set.
3. No gate resolves without `confirm=true`.
