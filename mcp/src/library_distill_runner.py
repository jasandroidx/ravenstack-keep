"""Local-batch runner for Ravenstack skills/library-distill.md (SOT).

Implements the skill's "Local cheap batch" + triage path for Keep HTTP:
sample extract → quality gate → pointer | production note | skip.
Does NOT invent a parallel skill. Production gold still may need Grok polish.

Vault root: OBSIDIAN_VAULT (default /root/obsidian_vault).
"""
from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

FORTRESS_KEYWORDS = re.compile(
    r"\b(agent|openclaw|reclaw|ravenstack|mcp|rag|vault|docker|discord|"
    r"gateway|skill|prompt|keep|fortress|oracle|scribe|model|llm|"
    r"security|ops|pipeline|obsidian)\b",
    re.I,
)
ACTION_MARKERS = re.compile(
    r"(^|\n)\s*(- |\* |\d+\. |## |### |Step |When |If |Rule |Never |Always )",
    re.I,
)


def vault_root() -> Path:
    return Path(os.environ.get("OBSIDIAN_VAULT", "/root/obsidian_vault"))


def inbox_dir() -> Path:
    return vault_root() / "Ravenstack" / "incoming" / "library"


def library_dir() -> Path:
    return vault_root() / "Ravenstack" / "library"


def catalog_path() -> Path:
    return library_dir() / "CATALOG.md"


@dataclass
class DistillResult:
    ok: bool
    disposition: str  # production | pointer | skip | error
    score: int = 0
    reason: str = ""
    source_path: str = ""
    source_name: str = ""
    output_path: Optional[str] = None
    output_rel: Optional[str] = None
    catalog_updated: bool = False
    error: Optional[str] = None
    sample_chars: int = 0
    notes: list[str] = field(default_factory=list)


def _slug(name: str) -> str:
    stem = Path(name).stem
    stem = re.sub(r"[^\w\-]+", "-", stem, flags=re.U).strip("-").lower()
    return (stem[:60] or "drop") + ""


def sample_extract(path: Path, max_chars: int = 12000) -> tuple[str, str]:
    """Return (text, method). PDF via pdftotext pages 1–15; text files read head."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        try:
            r = subprocess.run(
                ["pdftotext", "-f", "1", "-l", "15", "-layout", str(path), "-"],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            text = (r.stdout or "").strip()
            if not text and r.stderr:
                return "", f"pdftotext_empty:{r.stderr[:80]}"
            return text[:max_chars], "pdftotext:1-15"
        except FileNotFoundError:
            return "", "pdftotext_missing"
        except Exception as e:  # noqa: BLE001
            return "", f"pdftotext_error:{e}"
    if ext in {".md", ".txt", ".csv", ".json", ".html", ".htm"}:
        try:
            raw = path.read_text(encoding="utf-8", errors="replace")
            return raw[:max_chars], f"text_head:{max_chars}"
        except OSError as e:
            return "", f"read_error:{e}"
    # binary-ish: try utf-8 head
    try:
        raw = path.read_bytes()[: max_chars * 2]
        text = raw.decode("utf-8", errors="replace")
        return text[:max_chars], "bytes_decode"
    except Exception as e:  # noqa: BLE001
        return "", f"unreadable:{e}"


def quality_gate(sample: str, filename: str) -> tuple[int, str]:
    """Score 0–10 per library-distill dimensions (cheap heuristic)."""
    if not sample or len(sample.strip()) < 40:
        return 2, "too little extractable text"

    domain = 0
    hits = len(FORTRESS_KEYWORDS.findall(sample))
    if hits >= 8:
        domain = 3
    elif hits >= 3:
        domain = 2
    elif hits >= 1:
        domain = 1
    # operator notes / own md slightly favored
    if filename.lower().endswith((".md", ".txt")) and hits >= 1:
        domain = max(domain, 2)

    actionable = 0
    acts = len(ACTION_MARKERS.findall(sample))
    if acts >= 12:
        actionable = 3
    elif acts >= 5:
        actionable = 2
    elif acts >= 2:
        actionable = 1
    if "```" in sample or "http" in sample.lower():
        actionable = min(3, actionable + 1)

    # uniqueness: local catalog title clash (cheap)
    unique = 2
    cat = catalog_path()
    title_guess = Path(filename).stem.lower().replace("_", " ")[:40]
    if cat.is_file():
        try:
            body = cat.read_text(encoding="utf-8", errors="replace").lower()
            if title_guess and title_guess in body:
                unique = 1
        except OSError:
            pass

    extract = 0
    printable = sum(1 for c in sample if c.isprintable() or c in "\n\t")
    ratio = printable / max(len(sample), 1)
    if ratio > 0.92 and len(sample) > 400:
        extract = 2
    elif ratio > 0.8 and len(sample) > 80:
        extract = 1

    score = domain + actionable + unique + extract
    reason = (
        f"domain={domain}/3 action={actionable}/3 unique={unique}/2 "
        f"extract={extract}/2 hits={hits} acts={acts}"
    )
    return min(10, score), reason


def _bullets_from_sample(sample: str, limit: int = 12) -> list[str]:
    lines = []
    for line in sample.splitlines():
        s = line.strip()
        if not s or len(s) < 8:
            continue
        if s.startswith(("#", "---", "```")):
            continue
        if s.startswith(("- ", "* ", "• ")):
            lines.append(s.lstrip("-*• ").strip())
        elif re.match(r"^\d+\.\s+", s):
            lines.append(re.sub(r"^\d+\.\s+", "", s))
        elif len(s) < 160 and s[0].isupper():
            lines.append(s)
        if len(lines) >= limit:
            break
    if not lines:
        # fall back: first non-empty sentences
        chunk = re.sub(r"\s+", " ", sample)[:800]
        for part in re.split(r"(?<=[.!?])\s+", chunk):
            if len(part) > 20:
                lines.append(part.strip())
            if len(lines) >= 6:
                break
    return lines[:limit]


def write_outputs(
    path: Path,
    sample: str,
    score: int,
    reason: str,
    method: str,
) -> DistillResult:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = _slug(path.name)
    lib = library_dir()
    (lib / "inbox").mkdir(parents=True, exist_ok=True)
    (lib / "pointers").mkdir(parents=True, exist_ok=True)
    (lib / "processed").mkdir(parents=True, exist_ok=True)

    result = DistillResult(
        ok=True,
        disposition="skip",
        score=score,
        reason=reason,
        source_path=str(path),
        source_name=path.name,
        sample_chars=len(sample),
    )

    bullets = _bullets_from_sample(sample)
    title = Path(path.name).stem.replace("_", " ")[:80]

    if score <= 3:
        result.disposition = "skip"
        result.notes.append("Below gate — catalog skip only")
        _append_catalog(title, path.name, score, "skip", reason)
        result.catalog_updated = True
        _archive_source(path, lib / "processed")
        return result

    if score <= 6:
        out = lib / "pointers" / f"{slug}.md"
        body = f"""# Pointer: {title}

**Status:** not distilled (quality {score}/10)  
**Last Updated:** {day}  
**Source:** `Ravenstack/incoming/library/{path.name}` (sample via {method})

## Why pointer only
- Gate: {reason}
- Local-batch runner (library-distill skill) — promote with Grok for gold note.

## Topics / hooks
{chr(10).join(f"- {b}" for b in bullets[:8]) or "- (thin sample)"}

## Next
- [ ] Human or Grok: full distill if still relevant
- [ ] Or mark skip in catalog
"""
        out.write_text(body, encoding="utf-8")
        result.disposition = "pointer"
        result.output_path = str(out)
        result.output_rel = f"Ravenstack/library/pointers/{out.name}"
        _append_catalog(title, path.name, score, "pointer", reason)
        result.catalog_updated = True
        _archive_source(path, lib / "processed")
        return result

    # score 7–10 → production-shaped note in library/inbox (uncertain domain)
    out = lib / "inbox" / f"{slug}.md"
    body = f"""# {title}

**Local-batch distill (library-distill skill).** Last Updated: {day}. Relevant to: fortress / review.

## Principles
{chr(10).join(f"- {b}" for b in bullets[:5]) or "- (sparse sample — polish with Grok)"}

## Frameworks & Decision Trees
### From sample structure
1. Review bullets below; promote only what is actionable for Ravenstack.
2. Do not treat this note as whole-book truth.

## Tactics & Patterns
{chr(10).join(f"- **Extract:** {b}" for b in bullets[5:10]) or "- Add tactics on Grok polish pass."}

## Red Flags
- **[NOTE]** This note was produced by the Keep local-batch runner (heuristic gate + extract). High scores still benefit from a human/Grok pass before hard doctrine.

## ReClaw Applications & Examples
- Staged via Keep Library chamber; Scribe presence job completed local-batch path.

## Sources & Provenance
- Distilled from `{path.name}`, quality score {score}/10 ({reason}).
- Sample method: {method}; sample_chars={len(sample)}.
- Skill SOT: `Ravenstack/skills/library-distill.md` v1.2 local batch.
"""
    out.write_text(body, encoding="utf-8")
    result.disposition = "production"
    result.output_path = str(out)
    result.output_rel = f"Ravenstack/library/inbox/{out.name}"
    _append_catalog(title, path.name, score, "partial", reason + " → library/inbox")
    result.catalog_updated = True
    _archive_source(path, lib / "processed")
    return result


def _archive_source(path: Path, processed: Path) -> None:
    try:
        dest = processed / path.name
        if dest.exists():
            dest = processed / f"{path.stem}_{datetime.now(timezone.utc).strftime('%H%M%S')}{path.suffix}"
        path.rename(dest)
    except OSError:
        pass


def _append_catalog(
    title: str, source_name: str, score: int, distill: str, notes: str
) -> None:
    cat = catalog_path()
    cat.parent.mkdir(parents=True, exist_ok=True)
    if not cat.is_file():
        cat.write_text(
            "# Library catalog — Keep drops\n\n"
            "| Title | Type | Topics | Future agents | Quality | Distill | Source | Notes |\n"
            "|-------|------|--------|---------------|---------|---------|--------|-------|\n",
            encoding="utf-8",
        )
    q = "high" if score >= 7 else "medium" if score >= 4 else "low"
    ext = Path(source_name).suffix.lstrip(".") or "bin"
    row = (
        f"| {title[:40]} | {ext} | keep-drop | Scribe, Oracle | {q} | {distill} | "
        f"`incoming/{source_name[:40]}` | score {score}/10; {notes[:80]} |\n"
    )
    with cat.open("a", encoding="utf-8") as f:
        f.write(row)


def distill_file(path: Path | str) -> DistillResult:
    p = Path(path)
    if not p.is_file():
        return DistillResult(
            ok=False, disposition="error", error=f"not a file: {p}", source_path=str(p)
        )
    sample, method = sample_extract(p)
    if not sample:
        r = DistillResult(
            ok=False,
            disposition="error",
            error=method or "empty sample",
            source_path=str(p),
            source_name=p.name,
        )
        return r
    score, reason = quality_gate(sample, p.name)
    return write_outputs(p, sample, score, reason, method)


def host_path_to_rag_path(path: Path | str) -> str:
    """Map host vault path → path inside reclaw-api container (/vault/...)."""
    p = Path(path).resolve()
    try:
        rel = p.relative_to(vault_root().resolve())
        return f"/vault/{rel.as_posix()}"
    except ValueError:
        # Already container-style?
        s = str(path)
        if s.startswith("/vault/"):
            return s
        return s


def rag_ingest_production(path: Path | str, title: Optional[str] = None) -> dict[str, Any]:
    """POST /rag/ingest for a production note only (library-distill step 9).

    Uses container /vault path. Never dump raw PDF trees — only distilled MD notes.
    """
    import json
    import urllib.error
    import urllib.request

    p = Path(path)
    rag_path = host_path_to_rag_path(p)
    gateway = os.environ.get("RECLAW_GATEWAY", "http://127.0.0.1:8000").rstrip("/")
    payload = json.dumps(
        {
            "source_path": rag_path,
            "source_type": "markdown",
            "title": title or p.stem[:80],
        }
    ).encode()
    req = urllib.request.Request(
        f"{gateway}/rag/ingest",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return {"ok": True, "rag_path": rag_path, **json.loads(r.read().decode())}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:400]
        return {"ok": False, "rag_path": rag_path, "error": f"HTTP {e.code}: {body}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "rag_path": rag_path, "error": str(e)}


def rag_sync_vault_full() -> dict[str, Any]:
    """Full vault reindex — slow; prefer per-note ingest after distill."""
    import json
    import urllib.error
    import urllib.request

    gateway = os.environ.get("RECLAW_GATEWAY", "http://127.0.0.1:8000").rstrip("/")
    req = urllib.request.Request(
        f"{gateway}/rag/vault/sync",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return {"ok": True, **json.loads(r.read().decode())}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:400]
        return {"ok": False, "error": f"HTTP {e.code}: {body}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def distill_inbox(
    *,
    names: Optional[list[str]] = None,
    limit: int = 10,
    rag_ingest: bool = True,
) -> dict[str, Any]:
    """Distill pending files in incoming/library (not under processed/)."""
    root = inbox_dir()
    root.mkdir(parents=True, exist_ok=True)
    # Ensure container user reclaw can traverse/read new tree
    try:
        for d in (
            library_dir(),
            library_dir() / "inbox",
            library_dir() / "pointers",
            library_dir() / "processed",
            root,
        ):
            d.mkdir(parents=True, exist_ok=True)
            os.chmod(d, 0o755)
    except OSError:
        pass

    files: list[Path] = []
    if names:
        for n in names:
            cand = root / Path(n).name
            if cand.is_file():
                files.append(cand)
    else:
        for p in sorted(root.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and not p.name.startswith("."):
                files.append(p)
            if len(files) >= limit:
                break

    results: list[dict[str, Any]] = []
    for p in files:
        r = distill_file(p)
        row: dict[str, Any] = {
            "ok": r.ok,
            "disposition": r.disposition,
            "score": r.score,
            "reason": r.reason,
            "source_name": r.source_name,
            "output_rel": r.output_rel,
            "error": r.error,
        }
        # library-distill step 9: production notes only
        if rag_ingest and r.ok and r.disposition == "production" and r.output_path:
            try:
                os.chmod(r.output_path, 0o644)
            except OSError:
                pass
            row["rag"] = rag_ingest_production(
                r.output_path, title=f"distill:{r.source_name}"
            )
        results.append(row)
    return {
        "ok": True,
        "skill": "library-distill",
        "mode": "local-batch",
        "inbox": str(root),
        "count": len(results),
        "results": results,
        "rag_policy": "ingest production notes only (not pointers/skips/raw PDFs)",
    }
