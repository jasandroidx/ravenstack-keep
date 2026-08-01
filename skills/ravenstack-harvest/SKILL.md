---
name: ravenstack-harvest
description: >
  Nightly harvest pipeline: package dry-run, ops distill, multi-provider free stages,
  reconcile, OKM freshness, graph gardener. Apply is gated. OSB Harvest + OKM aligned.
---

# ravenstack-harvest

## Upstream
- OSB Harvest / catchup / reconcile / freshness-policy / link_graph
- Shared lib: `skills/lib/osb_patterns.py`, `free_sources.py`

## Nightly (dry-run default)

```bash
python3 nightly_harvest.py --vault /root/obsidian_vault --limit 5
```

Steps: orchestrator → ops_sources → sessions → multi_provider → reconcile → freshness → graph

## Apply (human gate)

```bash
python3 harvest_apply.py --run-dir /root/obsidian_vault/Ravenstack/harvest/dry-run/<id> \
  --vault /root/obsidian_vault --confirm
```

Without `--confirm` the script refuses (WRITE-GATES Class B).

## Report-only tools
- `freshness_scan.py` — FRESH-1/2; re-observe | convert | retire
- `graph_gardener.py` — hubs, orphans, dangling, typed reciprocal gaps
- `reconcile_claims.py` — numeric conflicts; no auto-resolve

## Non-regressions
fail-soft multi-provider · free multi-source gap_web · cost-log fail-soft · never silent delete · apply requires confirm
