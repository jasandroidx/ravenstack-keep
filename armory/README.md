# Armory — probe rack (Keep Mechanic v3, Phase 1)

Read-only diagnostic scripts for Valerie's probe rack (`ui-v2/src/lib/keep/probes.ts`,
`ui-v2/src/components/mechanic/mechanic-workbench.tsx`). See
`Ravenstack/keep/specs/mechanic-v3.md` in the vault for the full spec.

This checkout has no filesystem access to the Hetzner box (`/root/ravenstack-armory`
does not exist here — see AGENTS.md: box paths don't exist in the agent VM), so these
files are committed here instead of directly at their box path. **Deploy step, on the
box:**

```bash
mkdir -p /root/ravenstack-armory/workflows/probes
rsync -a armory/workflows/probes/ /root/ravenstack-armory/workflows/probes/
chmod +x /root/ravenstack-armory/workflows/probes/*.sh
install -m 0755 armory/bin/probe /usr/local/bin/probe
```

## What's here

- `workflows/probes/<name>.sh` — one script per probe (`sitrep`, `gateway`, `tailnet`,
  `ollama`, `keep`, `disk-mem`, `crashes`). Each is read-only, finishes in under 30s,
  prints plain text, and ends with exactly one `SUMMARY: OK|WARN|FAIL <reason>` line.
  None of them ever curl `127.0.0.1:8100` — that's the FastMCP bridge, and hitting it
  from a probe script deadlocks it.
- `bin/probe` — the `/usr/local/bin/probe <name>` runner. Validates `name` against
  `^[a-z0-9-]+$`, confirms `<probes-dir>/<name>.sh` exists, then pipes the script's
  output through `raven-drop probe-<name>` so every run also lands in
  `Ravenstack/ops/drops/` + `INDEX.md`.

## How the app calls this

`ui-v2/src/lib/keep/probes.ts` `execFile`s the box's `/usr/local/bin/probe` (path
overridable via `KEEP_PROBE_BIN`, probes dir via `KEEP_PROBES_DIR` — both default to
the real box paths above per the env-var convention in AGENTS.md / `drops.ts`). The
allowlist is exactly the set of `<name>.sh` files it finds in the probes dir, re-read
on every call — never a hardcoded list, and the caller's raw string never reaches argv
except as the already-validated canonical name.
