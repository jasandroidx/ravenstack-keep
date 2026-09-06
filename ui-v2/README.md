# Ravenstack Keep — painted hall (ui-v2)

Walkable Phaser command layer. This is the Grok Build hall that matches the
reference paintings. Occupancy is **paper** until you point it at Keep HTTP.

Old `ui/` (48×48 tiles) is frozen. Do not mix the two art pipelines.

## Run (laptop / box)

```bash
cd ui-v2
cp .env.example .env
# VITE_AUTH_ENABLED=false
# KEEP_PULSE_URL=http://127.0.0.1:8120/api/castle-map   # after Keep HTTP is up
npm ci
npm run dev
# http://127.0.0.1:8080
```

Keep MCP / specs stay in repo root (`mcp/`, `agents/`). This folder is the skin.

See [HANDOFF.md](./HANDOFF.md) and `skills/keep-visual-pipeline/SKILL.md`.
