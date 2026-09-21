# Acceptance checklist — Visual Command Layer (items 1–6)

**Live UI:** https://openclaw.tail20a090.ts.net:8120/  
**Hard-refresh:** Ctrl+Shift+R

## 1. Agent presence sprites + live state

- [ ] Sprites for raziel / oracle / clawforge / corvid / scribe load (no broken images)
- [ ] Occupied rooms show agent sprite + status chip
- [ ] Idle agents soft-roam inside the room
- [ ] Working/answering: magenta pulse + speech bubble **only if** `agent_task` is non-empty
- [ ] Empty rooms dimmed; map does not invent tasks

## 2. Keep MCP Phase-1 (+ presence)

```bash
# On openclaw
curl -sS http://127.0.0.1:8120/api/health
curl -sS http://127.0.0.1:8120/api/specs | head
curl -sS http://127.0.0.1:8120/api/cost-summary | head
# MCP tools present: list_rooms, report_agent_status, report_presence,
# get_agent_spec, list_agent_specs, get_room, approve_spec, unlock_room,
# get_cost_summary, get_path, get_castle_map
```

- [ ] `approve_spec` / `unlock_room` refuse without `confirm=true`
- [ ] `report_presence` updates castle-map agent_state/task

## 3. Room activity indicators

- [ ] Activity icon (idle/work/wait) on occupied rooms
- [ ] Model-tier badge (local default) on LIVE rooms
- [ ] Compact status pill: LIVE·real·idle (not long task text on tile)
- [ ] Working rooms magenta halo; gated rooms amber + !

## 4. Clawforge visual flow

- [ ] HUD section **Clawforge loop** with stages
- [ ] Gate stage highlights when approve_spec pending for clawforge
- [ ] No auto-approve / auto-unlock

## 5. Interaction layer

- [ ] Click room → gothic interaction menu
- [ ] Actions: Inspect, Focus, Spec, Approve/Unlock when allowed
- [ ] Confirm dialogs still required for gates

## 6. Mini-map + focus + path

- [ ] Mini-map bottom-left; colored room dots
- [ ] Click mini-map room → camera focuses
- [ ] `/api/path?from=&to=` returns JSON (BFS path cells)
- [ ] Arrow/WASD pan + wheel zoom still work

## Extraction notes

See `docs/EXTRACTION-NOTES-AGENT-TOWN.md`
