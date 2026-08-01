#!/usr/bin/env python3
"""Full nightly harvest pipeline (Phase 4 complete).

Phases inspired by obsidian-second-brain 'Harvest' nightly agent:
1) discover + package extract (deterministic)
2) ops source distill (decisions/briefs/inbox)
3) multi-provider stages (fail-soft)
4) reconcile contradictions
5) freshness scan
6) graph gardener
7) status + cost ledger
8) optional Keep status ping

Default remains dry-run for new package extracts; apply is separate gated command.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def run(cmd: list[str]) -> dict:
    p = subprocess.run(cmd, capture_output=True, text=True)
    return {"cmd": cmd, "code": p.returncode, "stdout": p.stdout[-2000:], "stderr": p.stderr[-2000:]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()
    vault = Path(args.vault)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-nightly"
    py = sys.executable
    steps = []

    steps.append(("orchestrator", run([py, str(HERE / "harvest_orchestrator.py"), "--vault", str(vault), "--limit", str(args.limit)])))
    steps.append(("ops_sources", run([py, str(HERE / "distill_ops_sources.py"), "--vault", str(vault), "--run-id", run_id])))
    steps.append(("sessions", run([py, str(HERE / "distill_sessions.py"), "--vault", str(vault), "--run-id", run_id])))
    steps.append(("multi_provider", run([py, str(HERE / "multi_provider_stages.py"), "--vault", str(vault), "--run-id", run_id])))
    steps.append(("reconcile", run([py, str(HERE / "reconcile_claims.py"), "--vault", str(vault)])))
    steps.append(("freshness", run([py, str(HERE / "freshness_scan.py"), "--vault", str(vault)])))
    steps.append(("graph", run([py, str(HERE / "graph_gardener.py"), "--vault", str(vault)])))

    # Phase 7: cost summary + disk hygiene (report-only, fail-soft)
    cost_g = HERE.parent / "ravenstack-cost-guardian"
    if (cost_g / "cost_summary.py").is_file():
        steps.append(("cost_summary", run([py, str(cost_g / "cost_summary.py"), "--vault", str(vault)])))
    if (cost_g / "disk_hygiene.py").is_file():
        steps.append(("disk_hygiene", run([py, str(cost_g / "disk_hygiene.py"), "--vault", str(vault)])))

    # Phase 8: daily cadence stamp (idempotent; weekly/monthly left to explicit timers)
    cadence = HERE.parent / "ravenstack-cadence" / "run_cadence.py"
    if cadence.is_file():
        steps.append(
            (
                "cadence_daily",
                run([py, str(cadence), "--vault", str(vault), "--period", "daily", "--no-tools"]),
            )
        )

    # master status
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ops = vault / "Ravenstack" / "ops" / "harvest"
    ops.mkdir(parents=True, exist_ok=True)
    ok = all(s[1]["code"] == 0 for s in steps)
    status_path = ops / f"nightly-{day}.md"
    body_steps = "\n".join(
        f"- {name}: exit={res['code']}" for name, res in steps
    )
    status_path.write_text(
        f"""---
date: {day}
type: harvest-nightly
tags: [harvest, nightly]
ai-first: true
status: {"ok" if ok else "degraded"}
run_id: {run_id}
---

## For future agents
Full nightly harvest pipeline status. Aligns with second-brain Harvest phases adapted to Fortress (packages + ops sources + multi-provider fail-soft + reconcile + freshness + graph).

# Nightly harvest — {day}

run_id: `{run_id}`

## Steps
{body_steps}

## Artifacts
- dry-run packages under `Ravenstack/harvest/dry-run/`
- ops source distill under dry-run `{run_id}/ops-sources/`
- multi-provider under dry-run `{run_id}/multi-provider/`
- reconcile/freshness/graph under `Ravenstack/ops/harvest/`
- cost: `Ravenstack/ops/harvest/cost-log.jsonl`

## Gate
Apply still requires `harvest_apply.py --confirm` after human review.
""",
        encoding="utf-8",
    )
    print(json.dumps({"ok": ok, "run_id": run_id, "status": str(status_path), "steps": [(n, r["code"]) for n, r in steps]}, indent=2))
    # dump failures
    for name, res in steps:
        if res["code"] != 0:
            print("FAIL", name, res["stderr"] or res["stdout"])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
