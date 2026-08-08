---
name: keep-event-logger
description: "DRAFT — append Keep edge events to events.jsonl (not installed)"
metadata:
  {
    "openclaw":
      {
        "emoji": "🏰",
        "events": ["command", "message:sent", "message:received", "agent:bootstrap", "gateway:startup"],
        "homepage": "https://github.com/jasandroidx/ravenstack-keep"
      }
  }
---

# keep-event-logger (DRAFT — do not auto-install)

**Status:** draft on disk for Jason review. Not enabled in OpenClaw.

## Purpose

Append one JSON line per relevant OpenClaw internal hook event to:

`/root/ravenstack-keep-app/app/data/events.jsonl`

Line shape:

```json
{"ts":"2026-08-05T04:00:00Z","source":"hook","agent_id":"raziel","type":"command","payload":{"action":"new"}}
```

## Why draft-only

- Keep may not mutate Fortress without approval.
- Live OpenClaw (2026.7.1) has **no native "gate pending" internal hook**.
- Gate correctness remains with the poller (pending gates / healing).
- Enabling this hook requires Jason: copy into OpenClaw hooks dir + `openclaw hooks enable keep-event-logger`.

## Handler

See `handler.js` in this directory (Node, no deps).

## Fallback

If hooks are not enabled, poller uses 2s gate interval and still heals drift. Correctness over sub-poll latency.
