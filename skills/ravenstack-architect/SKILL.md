---
name: ravenstack-architect
description: >
  Codebase -> vault architecture notes. Deterministic scan + sentinel-safe refresh
  (OSB /obsidian-architect). Never invents modules; never clobbers @user blocks.
---

# ravenstack-architect

## Upstream
`/obsidian-architect` + `scripts/architect_scan.py` + FORK_INSIGHTS sentinel primitive.

## Run

```bash
# Facts only (JSON)
python3 architect_scan.py --path /root/ravenstack-keep

# Write/refresh notes under Ravenstack/architecture/<name>/
python3 architect_refresh.py --path /root/ravenstack-keep --vault /root/obsidian_vault

# ADR candidates from git log
python3 mine_commit_decisions.py --repo /root/ravenstack-keep --json
```

## Sentinel contract
- Machine prose lives in `<!-- @generated:start -->` ... `<!-- @generated:end -->`
- Human prose in `<!-- @user:start -->` ... `<!-- @user:end -->`
- Refresh **replaces generated only**

## Anti-fabrication
Describe only scan JSON + verified commit subjects. Mark personas/inferred rationale `confidence: speculation`.
