# Phase A — Living status

## How chips update
Every `GET /api/castle-map` (UI poll ~3s) runs `openclaw_sync.sync_openclaw_status()`:

1. Reads OpenClaw `agents/main/sessions/sessions.json`
2. Maps primary session status → Keep state:
   - `running` / recent activity → `working`
   - `done` → `idle`
   - `failed` / `timeout` (≤3 min) → `failed`
3. Writes Keep `report_agent_status` for agent_id **`raziel`**
4. Ensures Great Hall occupant = `raziel`

## Mapping
| OpenClaw | Keep agent | Room |
|----------|------------|------|
| `main` | `raziel` | Great Hall |

## Manual
```bash
curl -sS -X POST http://127.0.0.1:8120/api/report-status \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"raziel","state":"working","task":"demo"}'
curl -sS http://127.0.0.1:8120/api/sync-openclaw | jq .
```

## Truth rule
No ambient invent. Only session truth + explicit report-status.
