#!/usr/bin/env python3
"""ravenstack-harvest v0.2 — Rural Data package → AI-First dry-run claims.

Deterministic extract (no paid models). Default output is quarantine dry-run only.
"""
from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from pathlib import Path


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    block = text[3:end]
    body = text[end + 4 :]
    out: dict[str, str] = {}
    for line in block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().strip("'\"")
    return out, body


def extract_insights(body: str) -> list[tuple[str, str, str | None]]:
    """Return list of (title, claim_text, hook)."""
    items: list[tuple[str, str, str | None]] = []
    # Split on ### under Insights section
    m = re.search(r"## Insights.*?\n(.*?)(?=\n## |\Z)", body, re.S | re.I)
    if not m:
        return items
    section = m.group(1)
    parts = re.split(r"\n### ", section)
    for part in parts:
        part = part.strip()
        if not part or part.startswith("Insights"):
            continue
        lines = part.splitlines()
        title = lines[0].strip()
        rest = "\n".join(lines[1:]).strip()
        hook = None
        hm = re.search(r"\*\*Content angle:\*\*\s*(.+)", rest)
        if hm:
            hook = hm.group(1).strip()
        # collapse near-duplicate highway fund titles
        if re.search(r"highway/road funds", title, re.I):
            title = "Pike highway/road certified funds (collapsed multi-year mentions)"
        claim = re.sub(r">\s*\*\*Content angle:\*\*.*", "", rest, flags=re.S).strip()
        claim = re.sub(r"\n{3,}", "\n\n", claim)
        if len(claim) < 20:
            continue
        items.append((title, claim[:1200], hook))
    # dedupe by normalized title key
    seen: set[str] = set()
    deduped: list[tuple[str, str, str | None]] = []
    for t, c, h in items:
        key = re.sub(r"[^a-z0-9]+", "", t.lower())[:48]
        if "highwayroad" in key:
            key = "highwayroadfunds"
        if key in seen:
            continue
        seen.add(key)
        deduped.append((t, c, h))
    return deduped


def extract_high_flags(body: str) -> list[tuple[str, str, bool]]:
    """Return (title, claim, sensitive)."""
    items: list[tuple[str, str, bool]] = []
    m = re.search(r"## Red Flags.*?\n(.*?)(?=\n## |\Z)", body, re.S | re.I)
    if not m:
        return items
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line.startswith("- **[HIGH]"):
            continue
        sensitive = bool(re.search(r"salary_shock|double_dip|compensation|\$", line, re.I))
        # title from rule name
        rm = re.search(r"\*\*\[HIGH\]\s*([a-z_]+):\*\*\s*(.+)", line, re.I)
        if not rm:
            continue
        rule, rest = rm.group(1), rm.group(2)
        title = f"{rule}: {rest[:80]}"
        items.append((title, line.lstrip("- ").strip(), sensitive))
    return items[:12]


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "claim"


def write_claim(
    out_dir: Path,
    *,
    package_id: str,
    county: str,
    area: str,
    as_of: str,
    run_id: str,
    source_path: str,
    title: str,
    claim: str,
    evidence: list[str],
    section: str,
    confidence: str,
    authority: str,
    sensitive: bool,
    hook: str | None,
    harvested_at: str,
) -> str:
    cid = "claim-" + slugify(title)
    tags = ["claim", county.lower(), str(area).lower().replace(" ", "-")]
    if sensitive:
        tags.append("sensitive")
    hook_block = f"\n## Content hook (draft only)\n- {hook}\n" if hook else "\n"
    evid = "\n".join(f"- {e}" for e in evidence)
    text = f"""---
date: {as_of}
type: claim
tags: {tags}
ai-first: true
claim_id: {cid}
package_id: {package_id}
county: {county}
area: {area}
authority: {authority}
freshness: {as_of}
confidence: {confidence}
status: draft
sensitive: {"true" if sensitive else "false"}
provenance:
  source_path: "{source_path}"
  source_section: "{section}"
  model: harvest-v0.2-deterministic
  harvested_at: {harvested_at}
  run_id: {run_id}
---

## For future agents
Claim from package {package_id} ({county}/{area}). Confidence={confidence}. Sensitive={"true" if sensitive else "false"}. Do not publish without human gate. Re-check numbers against the source package.

# {title}

## Claim
{claim}

## Evidence
{evid}

## Counter-evidence / open questions
- TBD
{hook_block}
## Links
- [[{source_path.replace('.md', '')}]]
"""
    path = out_dir / "claims" / f"{cid}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return cid


def main() -> None:
    ap = argparse.ArgumentParser(description="Harvest one Rural Data package to dry-run claims")
    ap.add_argument("--package", required=True, help="Path to package .md")
    ap.add_argument("--out", required=True, help="Output directory (run subdir created)")
    ap.add_argument("--run-id", default="", help="Optional run id")
    args = ap.parse_args()

    pkg = Path(args.package)
    text = pkg.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)
    package_id = fm.get("id", "pkg-unknown")
    county = fm.get("county", "Unknown")
    area = fm.get("primary_area", fm.get("area", "Unknown"))
    as_of = fm.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    harvested_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    run_id = args.run_id or (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + f"-{county.lower()}-{str(area).lower().replace(' ', '-')}"
    )
    source_path = f"Rural Data/{pkg.name}"
    out = Path(args.out) / run_id
    out.mkdir(parents=True, exist_ok=True)

    source_note = f"""---
date: {as_of}
type: source
tags: [source, rural-data, {county.lower()}]
ai-first: true
package_id: {package_id}
county: {county}
area: {area}
source_path: "{source_path}"
status: draft
provenance:
  model: harvest-v0.2-deterministic
  harvested_at: {harvested_at}
  run_id: {run_id}
---

## For future agents
Source pointer for Rural Data package {package_id}. Full text remains at source_path. Dry-run only.

# Source — {county} / {area} / {package_id}

- Path: [[{source_path.replace('.md','')}]]
- approval_status: {fm.get('approval_status', 'unknown')}
- risk_score: {fm.get('risk_score', 'TBD')} flags: {fm.get('flags', 'TBD')}
"""
    (out / f"SOURCE-{package_id}.md").write_text(source_note, encoding="utf-8")

    claim_ids: list[str] = []
    for title, claim, hook in extract_insights(body):
        cid = write_claim(
            out,
            package_id=package_id,
            county=county,
            area=str(area),
            as_of=as_of,
            run_id=run_id,
            source_path=source_path,
            title=title,
            claim=claim,
            evidence=[f"From Insights in {source_path} (as of {as_of})"],
            section="Insights",
            confidence="high",
            authority="analysis",
            sensitive=False,
            hook=hook,
            harvested_at=harvested_at,
        )
        claim_ids.append(cid)

    for title, claim, sensitive in extract_high_flags(body):
        cid = write_claim(
            out,
            package_id=package_id,
            county=county,
            area=str(area),
            as_of=as_of,
            run_id=run_id,
            source_path=source_path,
            title=title,
            claim=claim,
            evidence=[f"From Red Flags HIGH in {source_path} (as of {as_of})"],
            section="Red Flags",
            confidence="stated",
            authority="gateway",
            sensitive=sensitive,
            hook=None,
            harvested_at=harvested_at,
        )
        claim_ids.append(cid)

    report = f"""---
date: {as_of}
type: harvest-report
tags: [harvest, dry-run]
ai-first: true
run_id: {run_id}
package_id: {package_id}
status: dry-run
---

## For future agents
Deterministic dry-run harvest report. No production apply. Human reviews before Class B apply to Ravenstack/claims/.

# HARVEST REPORT — {run_id}

## Input
- package: `{source_path}`
- package_id: `{package_id}`
- extractor: harvest-v0.2-deterministic

## Counts
- claims: {len(claim_ids)}
- sensitive: see claim frontmatter

## Claims
{chr(10).join(f"- `{c}`" for c in claim_ids)}

## Apply checklist
- [ ] Review claims
- [ ] Drop/anonymize sensitive if needed
- [ ] Copy to Ravenstack/claims/
- [ ] knowledge_index + rag_sync_vault
"""
    (out / "HARVEST-REPORT.md").write_text(report, encoding="utf-8")
    print(str(out))
    print(f"claims={len(claim_ids)}")


if __name__ == "__main__":
    main()
