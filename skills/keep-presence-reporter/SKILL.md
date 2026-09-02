---
name: keep-presence-reporter
description: >
  Report live agent presence into Ravenstack Keep so the visual map shows
  sprites, states, and speech bubbles. Use when an agent starts/finishes work,
  moves rooms, or needs the Keep UI updated. Calls Keep MCP report_presence or
  report_agent_status only with real activity — never invent tasks.
metadata:
  short-description: "Publish real agent presence to Keep map"
---

# Keep presence reporter

## When to use

- Agent starts working, becomes idle, or waits on a human gate
- Agent is spatially associated with a Keep room
- Operator asks to “update the map” / “show presence”

## Rules (kill if violated)

1. **Never invent work.** Only report states that match real activity.
2. Prefer **local models**; no paid calls from this skill.
3. Human gates (`approve_spec`, `unlock_room`) are **not** this skill’s job — surface gates only.
4. Unknown `agent_id` must match `agents/*.agent-spec.json`.

## Tools

| Tool | Purpose |
|------|---------|
| `report_presence` | room_id + state + task_summary + optional sprite_hint / agent_id |
| `report_agent_status` | Same backend; optional room_id + sprite_hint |

## Example

```
report_presence({
  room_id: "library",
  agent_id: "oracle",
  state: "answering",
  task_summary: "Vault Q: MCP endpoints",
  sprite_hint: "oracle"
})
```

Idle clear:

```
report_presence({
  room_id: "library",
  agent_id: "oracle",
  state: "idle",
  task_summary: null
})
```

## Kill conditions

- Three false presence reports (fabricated tasks) → retire skill usage for that agent
- Prefer `report_agent_status` if room is unknown
