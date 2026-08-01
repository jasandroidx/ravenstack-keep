#!/usr/bin/env python3
"""ravenstack-harvest orchestrator (Phase 4).

Scans sources, runs deterministic package harvest dry-runs, writes status + cost log.
Default mode is dry-run only. Apply is separate (harvest_apply.py) after human gate.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse package harvester from same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_rural_packages(vault: Path) -> list[Path]:
    rd = vault / "Rural Data"
    if not rd.is_dir():
        return []
    out = []
    for p in sorted(rd.glob("*.md")):
        if p.name.startswith("_") or p.name.lower().startswith("county"):
            continue
        # YYYY-MM-DD-county-area.md
        if len(p.stem) >= 10 and p.stem[4] == "-" and p.stem[7] == "-":
            out.append(p)
    return out


def already_harvested(vault: Path, package_stem: str) -> bool:
    dry = vault / "Ravenstack" / "harvest" / "dry-run"
    if not dry.is_dir():
        return False
    for d in dry.iterdir():
        if not d.is_dir():
            continue
        # SOURCE-pkg-*.md or report mentions package
        for s in d.glob("SOURCE-*.md"):
            text = s.read_text(encoding="utf-8", errors="replace")
            if package_stem in text or f"Rural Data/{package_stem}" in text:
                return True
        rep = d / "HARVEST-REPORT.md"
        if rep.is_file() and package_stem in rep.read_text(encoding="utf-8", errors="replace"):
            return True
    # also check applied claims
    claims = vault / "Ravenstack" / "claims"
    if claims.is_dir():
        for c in claims.glob("*.md"):
            if package_stem in c.read_text(encoding="utf-8", errors="replace")[:500]:
                return True
    return False


def run_package_harvest(pkg: Path, out_root: Path) -> dict:
    script = Path(__file__).resolve().parent / "harvest_package.py"
    before = set(out_root.glob("*")) if out_root.exists() else set()
    out_root.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, str(script), "--package", str(pkg), "--out", str(out_root)],
        capture_output=True,
        text=True,
    )
    after = set(out_root.glob("*"))
    new = [p for p in after - before if p.is_dir()]
    run_dir = new[0] if new else None
    if not run_dir:
        # parse last line of stdout
        lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
        if lines:
            cand = Path(lines[0])
            if cand.is_dir():
                run_dir = cand
    return {
        "package": str(pkg),
        "exit_code": proc.returncode,
        "stdout": proc.stdout[-500:],
        "stderr": proc.stderr[-500:],
        "run_dir": str(run_dir) if run_dir else None,
        "ok": proc.returncode == 0 and run_dir is not None,
    }


def list_inbox(vault: Path) -> list[Path]:
    inbox = vault / "Ravenstack" / "inbox"
    if not inbox.is_dir():
        return []
    return [p for p in sorted(inbox.glob("*.md")) if p.name.upper() != "README.MD" and p.name != "README.md"]


def write_status(vault: Path, payload: dict) -> Path:
    ops = vault / "Ravenstack" / "ops" / "harvest"
    ops.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = ops / f"harvest-status-{day}.md"
    cost = payload.get("cost") or {}
    runs = payload.get("runs") or []
    lines = [
        "---",
        f"date: {day}",
        "type: harvest-status",
        "tags: [harvest, status, ops]",
        "ai-first: true",
        f"status: {payload.get('status', 'ok')}",
        "---",
        "",
        "## For future agents",
        f"Harvest orchestrator status for {day}. Dry-run default. Cost is attribution for this run (deterministic extract = $0 unless multi-provider stage ran).",
        "",
        f"# Harvest status — {day}",
        "",
        f"- generated_at: {payload.get('generated_at')}",
        f"- mode: {payload.get('mode')}",
        f"- packages_considered: {payload.get('packages_considered')}",
        f"- packages_harvested: {payload.get('packages_harvested')}",
        f"- packages_skipped_already: {payload.get('packages_skipped')}",
        f"- inbox_notes_seen: {payload.get('inbox_seen')}",
        "",
        "## Cost attribution",
        f"- est_usd_total: {cost.get('est_usd_total', 0)}",
        f"- stages: {json.dumps(cost.get('stages', []))}",
        f"- note: {cost.get('note', 'deterministic local extract')}",
        "",
        "## Runs",
    ]
    for r in runs:
        lines.append(f"- ok={r.get('ok')} package=`{r.get('package')}` run_dir=`{r.get('run_dir')}`")
    if payload.get("failures"):
        lines.append("")
        lines.append("## Failures → tasks")
        for f in payload["failures"]:
            lines.append(f"- {f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_failure_task(vault: Path, msg: str) -> Path:
    ops = vault / "Ravenstack" / "ops" / "harvest" / "tasks"
    ops.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ops / f"task-{ts}.md"
    path.write_text(
        f"""---
date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}
type: task
tags: [task, harvest, failure]
ai-first: true
status: open
---

## For future agents
Harvest orchestrator failure task. Investigate and re-run dry-run.

# Harvest failure

{msg}
""",
        encoding="utf-8",
    )
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default="/root/obsidian_vault")
    ap.add_argument("--mode", default="dry-run", choices=["dry-run"])
    ap.add_argument("--limit", type=int, default=3, help="max new packages this run")
    ap.add_argument("--force-package", default="", help="force one package path even if harvested")
    args = ap.parse_args()
    vault = Path(args.vault)
    out_root = vault / "Ravenstack" / "harvest" / "dry-run"
    out_root.mkdir(parents=True, exist_ok=True)

    packages = list_rural_packages(vault)
    inbox = list_inbox(vault)
    runs = []
    failures = []
    harvested = 0
    skipped = 0

    if args.force_package:
        todo = [Path(args.force_package)]
    else:
        todo = []
        for p in reversed(packages):  # newest first by name sort then reverse
            if already_harvested(vault, p.stem):
                skipped += 1
                continue
            todo.append(p)
            if len(todo) >= args.limit:
                break

    for p in todo:
        if not p.is_file():
            failures.append(f"missing package {p}")
            write_failure_task(vault, f"missing package {p}")
            continue
        result = run_package_harvest(p, out_root)
        runs.append(result)
        if result["ok"]:
            harvested += 1
        else:
            failures.append(f"harvest failed {p}: {result.get('stderr') or result.get('stdout')}")
            write_failure_task(vault, failures[-1])

    payload = {
        "generated_at": utc_now(),
        "mode": args.mode,
        "status": "ok" if not failures else "degraded",
        "packages_considered": len(packages),
        "packages_harvested": harvested,
        "packages_skipped": skipped,
        "inbox_seen": len(inbox),
        "runs": runs,
        "failures": failures,
        "cost": {
            "est_usd_total": 0.0,
            "stages": [
                {"stage": "discover", "model": "none", "est_usd": 0},
                {"stage": "extract", "model": "harvest-v0.2-deterministic", "est_usd": 0},
            ],
            "note": "Phase 4 v0 uses deterministic extract only. Multi-provider stages reserved in HARVEST-ROUTING.md",
        },
    }
    status_path = write_status(vault, payload)
    # cost log JSON append
    cost_dir = vault / "Ravenstack" / "ops" / "harvest"
    cost_log = cost_dir / "cost-log.jsonl"
    with cost_log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": utc_now(), **payload["cost"], "harvested": harvested}) + "\n")
    print(json.dumps({"status_path": str(status_path), "harvested": harvested, "skipped": skipped, "failures": len(failures)}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
