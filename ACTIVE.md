# ACTIVE — Ravenstack Keep

**Last updated:** 2026-08-15 (Grok Build)

**Canonical visual fortress:** `:8120` Keep. Dashboard `:8081` is ops status, not the castle map. One room model: the six Keep rooms.  
**Branch of truth:** `ravenstack`  
**Repo:** https://github.com/jasandroidx/ravenstack-keep

---

## Open this (not the other dashboard)

```
https://openclaw.tail20a090.ts.net:8120/
```

Vault one-pager: `Ravenstack/ops/OPEN-THE-KEEP.md`  
Human desk is **Obsidian Sync** (`Desktop/Ravenstack`) — daily / dashboard / Raziel sidebar. Keep stays the Phaser map. Do not rebuild the vault in the castle.

| Wrong | Right |
|-------|--------|
| `:8443` Office (React / Vite fortress) | **`:8120` Phaser Keep** |
| MCP `:8110` alone | Browser shell is HTTP **8120** |

---

## Live status (verified 2026-08-12)

**Running on openclaw**
- `ravenstack-keep-http.service` — UI + API `127.0.0.1:8120` (Tailscale Serve HTTPS)
- `ravenstack-keep-mcp.service` — MCP spatial / gates / presence
- OpenClaw sync → Raziel in Great Hall on map poll

**Art:** `ui/docs/KEEP-ART-PLAYBOOK.md` — Imagine + Gemini. Agents display at 32px.

**Shipped this session**
- **⚡ Wake** button — real `report-presence` for clawforge/oracle/scribe + Raziel pipe-walk
- Boot toast: living roster from API (not a dead poster)
- Meta line shows “N working”
- Dist deployed: `ui/dist` → production (bundle `index-B2-0SDWx.js`)

**Already built earlier (use it)**
- Room click → RPG interaction menu → chamber command
- Tour (pipe-walk only), minimap, audio, gates HUD
- Dispatch / recall presence, library upload + Arcane compact

---

## How work moves

| Mode | What | When |
|------|------|------|
| **Daily** | You open Keep + Grok reports presence | Default |
| **MCP** | Grok Build / SuperGrok `report_presence` | When agents actually work |
| **Round Table** | Multi-AI review in `reviews/` | Hard decisions only |

---

## Single active thread

### Make the map *worth opening* (habit, not features)

1. Open **`:8120`** when starting a fortress session.
2. Hit **⚡ Wake** if chips look stale.
3. Grok Build reports **clawforge → Alchemy Lab** when online (presence skill).
4. Next fun product slice (optional): Observatory “Arena bout” chip — only after Wake is a habit.

**Not the thread:** rural-data, second gateway, reinventing library-distill.

---

## Quick links

- Operator open: vault `ops/OPEN-THE-KEEP.md`
- UI README: `ui/README.md`
- Presence skill: `skills/keep-presence-reporter/SKILL.md`
- Blueprint: `RAVENSTACK-KEEP-BLUEPRINT-v0.2.md`

---

*One map. One URL. Wake it or it sleeps.*
