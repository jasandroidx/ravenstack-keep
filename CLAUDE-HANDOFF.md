# Claude handoff — Suikoden HQ Keep (2026-08-14)

Jason asked Grok to go. This is what landed in `jasandroidx/ravenstack-keep` and what you do on the **fortress** so live `:8120` is not a purple void.

## What Wake / Tour actually were

They were poorly named. Relabeled in the UI:

| Button | Old name | What it does |
|---|---|---|
| **⚡ Rally** | Wake | Writes real presence: Clawforge working in Alchemy Lab, Oracle + Scribe idle in Library. Then walks Raziel Great Hall → Library → home. Proof the Keep is alive. |
| **🚶 Tour** | Tour | Same Raziel pipe-walk only. No presence writes. A castle tour. |
| **✧ Compact** | Compact | Arcane Library context compaction (token meter). Not a visual mode. |

Jason grew up on **Suikoden 2**. The Keep is now an HQ that grows.

## What Grok changed (repo)

- Pulled **live** UI source out of `:8120` source map (GitHub `ravenstack` was behind).
- Added HQ rank, Suikoden talk box + officer portraits (Raziel, Oracle, Scribe, Clawforge, Corvid).
- New UNFORGED wings in `mcp/src/server.py` seed (upsert, does not wipe live rooms):
  - `round-table` (2,1)
  - `clock-tower` (0,2)
  - `kitchen` (-1,0)
  - `roost` (2,0) — Corvid
  - `gatehouse` (0,-1)
- Art pack: `ui/scripts/generate_keep_world.py` + portraits under `ui/public/art/portraits/`.
- Existing six interiors copied into `ui/public/art/rooms/`.
- Rally / Tour copy made human. Talk is the first room action.

**Do not** fork Star-Office. Stone + neon. Human gates stay human.

## What you do on the fortress (openclaw)

Work from the Keep checkout, not ReClaw.

```bash
cd ~/ravenstack-keep   # or wherever live Keep is
git fetch origin
git checkout ravenstack   # or the branch Grok pushed
git pull

# Art (needs Pillow)
cd ui
python3 scripts/generate_keep_world.py
python3 scripts/generate_keep_art.py   # chips / 48px fallbacks

# Build SPA
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run build
# → ui/dist/

# Restart Keep HTTP so it serves new dist + new rooms
# (service name may be keep-http / ravenstack-keep — check systemd)
sudo systemctl restart keep-http || true
# or the process that runs:
#   PYTHONPATH=mcp/src .venv/bin/python -m ravenstack_keep_mcp.http_api
```

New rooms appear on next `init_db()` because seed now **inserts missing** room_ids. Existing live rooms stay as they are.

Hard-refresh `:8120` (Ctrl+Shift+R). You should see:

- Stone floor, room interiors, agent chips
- HQ rank pill
- Rally / Tour / Talk
- Five new sealed wings on the map

## Do not

- Unlock new rooms without Jason.
- Mark specs live.
- Merge `:8443` Office into Keep.
- Replace portraits with cute office sprites.
- Invent agent work. Rally only writes the presence labels already in `main.ts`.

## If the map is still purple

1. `curl -sI https://127.0.0.1:8120/art/rooms/room_great-hall.png` → 200
2. `curl -sI https://127.0.0.1:8120/art/agents/agent_raziel.png` → 200
3. Confirm `ui/dist/art/...` or `ui/public/art/...` is what http_api serves.
4. Hard refresh. Old hashed JS (`index-BwDMsyUJ.js`) will ignore new files.

## Later (not this deploy)

- Combat (Jason said eventually, for fun).
- Round Table live multi-model (room exists; council wiring is separate).
- Clock Tower cron visualization.
- Kitchen = local model hearth meters.
- Gatehouse = Papers Please stamp desk on the Windows node.

Grok can keep building locally. You ship to Hetzner.
