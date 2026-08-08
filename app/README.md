# Ravenstack Keep — runtime (`app/`)

Read-only pixel-art observability for the Fortress. **Does not control the Fortress.**

## Paths

| Item | Path |
|------|------|
| Working tree | `/root/ravenstack-keep-app` |
| This runtime | `/root/ravenstack-keep-app/app` |
| GitHub | `jasandroidx/ravenstack-keep` → directory `app/` on a feature branch |

## Phase 0 — serve (Tailscale only)

```bash
# Prefer Tailscale IP (never 0.0.0.0)
systemctl start tailscaled   # if needed
TS_IP=$(tailscale ip -4)
cd /root/ravenstack-keep-app/app
cp -n data/state.example.json data/state.json || true
python3 -m http.server 8090 --bind "$TS_IP"
```

Open: `http://100.108.130.82:8090/web/`

Local-only check: `--bind 127.0.0.1` then SSH tunnel.

### Acceptance test (fake data)

Edit `data/state.json`: set `agents[id=analyst].state` from `working` → `waiting_on_human`.  
Refresh the browser (or wait ≤ poll interval). War Table room should amber + alert marker.

## Phase 1 — poller

```bash
cd /root/ravenstack-keep-app/app
python3 poller/poll.py --config poller/config.example.json
```

Writes `data/state.json` atomically (`.tmp` then rename). Read-only HTTP only.

## Phase 2 — hooks (draft)

See `hooks/keep-event-logger/` — **not auto-installed**. Poller folds `data/events.jsonl` when present; gate truth still from poll.

## Kill (one line)

```bash
fuser -k 8090/tcp 2>/dev/null; pgrep -f 'poller/poll.py' | xargs -r kill; true
```

## Non-negotiables

- No second OpenClaw gateway
- No paid APIs
- County pipeline FROZEN (read status only)
- No draft-to-execute
- Bind Tailscale IP or 127.0.0.1 only
- Keep never writes to Fortress (poller is read-only)
