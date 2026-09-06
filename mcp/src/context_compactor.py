"""
Arcane Library Spatial Context Compactor

Local-first context compaction biased by Keep spatial coordinates.
Primary zone: Library [1, 0]. Stores originals + summaries in SQLite
(sqlite-vec when available) and emits Obsidian notes into the real
Ravenstack vault Graph footprint.

Env:
  OBSIDIAN_VAULT          — vault root (default /root/obsidian_vault)
  KEEP_MCP_DATA           — DB dir (default mcp/data)
  KEEP_COMPACTOR_DB       — override vector DB path
  KEEP_OLLAMA_URL         — default http://127.0.0.1:11434
  KEEP_EMBED_MODEL        — ollama embed model (optional)
  KEEP_SUMMARIZE_MODEL    — ollama chat model (optional)
  KEEP_EMBED_DIM          — embedding dimensions (default 384)
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Keep spatial registry (must match server.SEED_ROOMS / SPATIAL-TELEMETRY)
ROOM_COORDS: dict[str, tuple[int, int]] = {
    "great-hall": (0, 0),
    "library": (1, 0),
    "alchemy-lab": (1, 1),
    "armory": (0, 1),
    "observatory": (1, 2),
    "vault": (-1, -1),
}

ROOM_ALIASES: dict[str, str] = {
    "great hall": "great-hall",
    "library": "library",
    "alchemy lab": "alchemy-lab",
    "armory": "armory",
    "observatory": "observatory",
    "vault": "vault",
    "oracle": "library",
    "scribe": "library",
}

DEFAULT_DIM = int(os.environ.get("KEEP_EMBED_DIM", "384"))
TOKEN_CHAR_RATIO = 4  # rough chars per token estimate


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_room(name: str) -> str:
    key = (name or "").strip().lower().replace("_", "-")
    key = key.replace(" ", "-")
    if key in ROOM_COORDS:
        return key
    return ROOM_ALIASES.get(key.replace("-", " "), ROOM_ALIASES.get(key, key))


def manhattan(a: tuple[int, int], b: tuple[int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // TOKEN_CHAR_RATIO)


def resolve_vault() -> Path:
    for p in (
        os.environ.get("OBSIDIAN_VAULT", ""),
        "/root/obsidian_vault",
        str(Path.home() / "obsidian_vault"),
        str(Path.home() / "Obsidian"),
    ):
        if not p:
            continue
        path = Path(p)
        if path.is_dir():
            return path
    # Never invent a fake vault for production; use keep data shadow only as last resort
    shadow = Path(os.environ.get("KEEP_MCP_DATA", "data")) / "vault_shadow"
    shadow.mkdir(parents=True, exist_ok=True)
    return shadow


def resolve_db_path() -> Path:
    env = os.environ.get("KEEP_COMPACTOR_DB")
    if env:
        p = Path(env)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    data = Path(os.environ.get("KEEP_MCP_DATA", Path(__file__).resolve().parents[1] / "data"))
    data.mkdir(parents=True, exist_ok=True)
    return data / "vector_memory.db"


@dataclass
class ContextSegment:
    text: str
    room_hint: Optional[str] = None
    entities: Optional[list[str]] = None
    age_rank: int = 0  # higher = older
    token_count: int = 0

    def __post_init__(self) -> None:
        if not self.token_count:
            self.token_count = estimate_tokens(self.text)
        if self.entities is None:
            self.entities = extract_entities(self.text)


def extract_entities(text: str) -> list[str]:
    """Cheap entity harvest for wikilinks (no NLP dependency)."""
    found: list[str] = []
    # [[Existing wikilinks]]
    found.extend(re.findall(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]", text))
    # Capitalized multi-word-ish tokens
    for m in re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", text):
        if m.lower() not in ("the", "and", "for", "with"):
            found.append(m)
    # Keep room names mentioned
    low = text.lower()
    for rid, (gx, gy) in ROOM_COORDS.items():
        label = rid.replace("-", " ")
        if label in low or rid in low:
            found.append(rid)
    # Dedupe preserve order
    out: list[str] = []
    seen: set[str] = set()
    for e in found:
        e2 = e.strip()
        k = e2.lower()
        if k and k not in seen:
            seen.add(k)
            out.append(e2)
    return out[:40]


def split_context(context: str, chunk_chars: int = 1200) -> list[ContextSegment]:
    """Split context into ordered segments (oldest first when possible)."""
    text = (context or "").strip()
    if not text:
        return []
    # Prefer blank-line paragraphs
    parts = re.split(r"\n\s*\n+", text)
    segs: list[ContextSegment] = []
    buf = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(buf) + len(p) < chunk_chars:
            buf = f"{buf}\n\n{p}".strip() if buf else p
        else:
            if buf:
                segs.append(ContextSegment(text=buf, age_rank=len(segs)))
            if len(p) <= chunk_chars:
                buf = p
            else:
                for i in range(0, len(p), chunk_chars):
                    segs.append(
                        ContextSegment(text=p[i : i + chunk_chars], age_rank=len(segs))
                    )
                buf = ""
    if buf:
        segs.append(ContextSegment(text=buf, age_rank=len(segs)))
    # age_rank: first chunks older
    for i, s in enumerate(segs):
        s.age_rank = i
    return segs


def spatial_relevance(
    seg: ContextSegment,
    current_room: str,
    current_coords: tuple[int, int],
) -> float:
    """
    Higher = more relevant to keep.
    Blend: inverse distance to current room, recency (inverse age), entity overlap.
    """
    room = normalize_room(seg.room_hint or "")
    if not room or room not in ROOM_COORDS:
        # Infer from text
        for rid in ROOM_COORDS:
            if rid.replace("-", " ") in seg.text.lower() or rid in seg.text.lower():
                room = rid
                break
    if room in ROOM_COORDS:
        dist = manhattan(ROOM_COORDS[room], current_coords)
    else:
        dist = 3  # unknown → medium distance
    dist_score = 1.0 / (1.0 + dist)
    # Recency: newer segments (higher age_rank index late) score higher
    # We don't know total here; caller can normalize. Use inverse age_rank.
    recency = 1.0 / (1.0 + seg.age_rank)
    # Entity overlap with current room name
    ents = {e.lower() for e in (seg.entities or [])}
    room_labels = {current_room, current_room.replace("-", " "), "library", "oracle", "scribe"}
    overlap = 1.0 if ents & room_labels else 0.0
    for e in ents:
        if e in ROOM_COORDS or e.replace(" ", "-") in ROOM_COORDS:
            d = manhattan(ROOM_COORDS.get(e.replace(" ", "-"), current_coords), current_coords)
            overlap = max(overlap, 1.0 / (1.0 + d))
    return 0.5 * dist_score + 0.3 * recency + 0.2 * overlap


def hash_embed(text: str, dim: int = DEFAULT_DIM) -> list[float]:
    """Deterministic local embedding fallback (no network)."""
    vec = [0.0] * dim
    tokens = re.findall(r"[a-z0-9_]+", text.lower())
    if not tokens:
        tokens = ["empty"]
    for t in tokens:
        h = hashlib.sha256(t.encode()).digest()
        for i in range(0, min(len(h) - 1, 32), 2):
            idx = int.from_bytes(h[i : i + 2], "little") % dim
            vec[idx] += 1.0
    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    dot = sum(a[i] * b[i] for i in range(n))
    na = math.sqrt(sum(a[i] * a[i] for i in range(n))) or 1.0
    nb = math.sqrt(sum(b[i] * b[i] for i in range(n))) or 1.0
    return dot / (na * nb)


def ollama_embed(text: str, dim: int = DEFAULT_DIM) -> list[float]:
    url = os.environ.get("KEEP_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("KEEP_EMBED_MODEL", "").strip()
    if not model:
        return hash_embed(text, dim)
    payload = json.dumps({"model": model, "prompt": text[:8000]}).encode()
    req = urllib.request.Request(
        f"{url}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        emb = data.get("embedding") or data.get("embeddings")
        if isinstance(emb, list) and emb and isinstance(emb[0], (int, float)):
            vec = [float(x) for x in emb]
            if len(vec) < dim:
                vec = vec + [0.0] * (dim - len(vec))
            return vec[:dim]
        if isinstance(emb, list) and emb and isinstance(emb[0], list):
            vec = [float(x) for x in emb[0]]
            if len(vec) < dim:
                vec = vec + [0.0] * (dim - len(vec))
            return vec[:dim]
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        pass
    return hash_embed(text, dim)


def ollama_summarize(text: str, room: str, ratio_hint: str = "4x shorter") -> str:
    """Local Ollama summary; falls back to extractive summary."""
    url = os.environ.get("KEEP_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("KEEP_SUMMARIZE_MODEL", "").strip()
    if model:
        prompt = (
            f"You are the Arcane Library compactor for Ravenstack Keep.\n"
            f"Current room: {room}. Summarize the following context {ratio_hint}.\n"
            f"Preserve key entities, room names, decisions, and relationships. "
            f"No invented facts. Plain markdown bullets.\n\n---\n{text[:12000]}\n---"
        )
        payload = json.dumps(
            {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.2},
            }
        ).encode()
        req = urllib.request.Request(
            f"{url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode())
            out = (data.get("response") or "").strip()
            if out:
                return out
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
            pass
    return extractive_summarize(text)


def extractive_summarize(text: str, max_sents: int = 8) -> str:
    """Offline ~4× reduction: keep densest sentences by entity/length score."""
    sents = re.split(r"(?<=[.!?])\s+", text.strip())
    sents = [s.strip() for s in sents if len(s.strip()) > 20]
    if not sents:
        return text[: max(200, len(text) // 4)]
    scored: list[tuple[float, str]] = []
    for s in sents:
        ents = len(extract_entities(s))
        scored.append((ents * 2.0 + min(len(s), 200) / 100.0, s))
    scored.sort(key=lambda x: -x[0])
    keep_n = max(1, min(max_sents, max(1, len(sents) // 4)))
    chosen = [s for _, s in scored[:keep_n]]
    # Preserve original order
    order = {s: i for i, s in enumerate(sents)}
    chosen.sort(key=lambda s: order.get(s, 0))
    return " ".join(chosen)


class ArcaneCompactor:
    """Spatial context compaction for the Keep (Library-first)."""

    def __init__(
        self,
        db_path: Optional[Path] = None,
        vault_root: Optional[Path] = None,
        embed_dim: int = DEFAULT_DIM,
    ) -> None:
        self.db_path = Path(db_path or resolve_db_path())
        self.vault_root = Path(vault_root or resolve_vault())
        self.embed_dim = embed_dim
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._use_vec = False
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS context_chunks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  vector_id TEXT NOT NULL UNIQUE,
                  room TEXT NOT NULL,
                  gx INTEGER,
                  gy INTEGER,
                  token_estimate INTEGER,
                  original_text TEXT NOT NULL,
                  summary_text TEXT NOT NULL,
                  embedding_json TEXT,
                  entities_json TEXT,
                  compaction_ratio REAL,
                  source TEXT,
                  created_at TEXT NOT NULL,
                  note_path TEXT
                );
                CREATE TABLE IF NOT EXISTS compaction_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  room TEXT NOT NULL,
                  gx INTEGER,
                  gy INTEGER,
                  token_before INTEGER,
                  token_after INTEGER,
                  segments_archived INTEGER,
                  note_path TEXT,
                  created_at TEXT NOT NULL,
                  detail_json TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_room ON context_chunks(room);
                CREATE INDEX IF NOT EXISTS idx_events_room ON compaction_events(room);
                """
            )
            # Optional sqlite-vec
            try:
                import sqlite_vec  # type: ignore

                conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                conn.execute(
                    f"""
                    CREATE VIRTUAL TABLE IF NOT EXISTS context_vec USING vec0(
                      vector_id TEXT PRIMARY KEY,
                      embedding float[{self.embed_dim}]
                    );
                    """
                )
                self._use_vec = True
            except Exception:
                self._use_vec = False

    def should_compact(self, current_tokens: int, max_tokens: int, threshold: float = 0.85) -> bool:
        if max_tokens <= 0:
            return False
        return (current_tokens / max_tokens) >= threshold

    def compact(
        self,
        room_name: str,
        current_token_count: int,
        max_tokens: int,
        context: str,
        threshold: float = 0.85,
        force: bool = False,
        source: str = "manual",
    ) -> dict[str, Any]:
        """
        Full workflow: select low spatial-relevance oldest ~25% → summarize
        → archive → inject summary → write Obsidian note.
        """
        room = normalize_room(room_name) or "library"
        coords = ROOM_COORDS.get(room, ROOM_COORDS["library"])
        if not force and not self.should_compact(current_token_count, max_tokens, threshold):
            return {
                "ok": True,
                "compacted": False,
                "reason": "below_threshold",
                "ratio": current_token_count / max_tokens if max_tokens else 0,
                "room": room,
                "coords": list(coords),
            }

        segs = split_context(context)
        if len(segs) < 2:
            # Single blob: still archive a summary of the oldest half by chars
            if not context.strip():
                return {
                    "ok": False,
                    "compacted": False,
                    "error": "empty_context",
                    "code": "invalid_input",
                }
            mid = max(1, len(context) // 4)
            # Take oldest 25% of characters
            cut = max(1, len(context) // 4)
            segs = [
                ContextSegment(text=context[:cut], age_rank=0),
                ContextSegment(text=context[cut:], age_rank=1),
            ]

        # Score relevance; archive lowest-scoring among oldest 50% candidates
        scored: list[tuple[float, ContextSegment]] = []
        for s in segs:
            rel = spatial_relevance(s, room, coords)
            # Prefer archiving old + low relevance → sort key = relevance then -age
            scored.append((rel, s))

        # Target ~25% of tokens
        total_tokens = sum(s.token_count for s in segs) or estimate_tokens(context)
        target = max(1, int(total_tokens * 0.25))
        # Sort: lowest relevance first, then oldest
        ranked = sorted(scored, key=lambda x: (x[0], -x[1].age_rank))
        to_archive: list[ContextSegment] = []
        acc = 0
        for rel, s in ranked:
            if acc >= target and to_archive:
                break
            # Don't archive high-relevance near-room material unless forced mass
            if rel > 0.75 and len(to_archive) > 0:
                continue
            to_archive.append(s)
            acc += s.token_count

        if not to_archive:
            to_archive = [ranked[0][1]]

        archive_text = "\n\n---\n\n".join(s.text for s in to_archive)
        summary = ollama_summarize(archive_text, room=room)
        entities = extract_entities(archive_text + "\n" + summary)
        for rid in ROOM_COORDS:
            if rid not in {e.lower().replace(" ", "-") for e in entities}:
                if rid.replace("-", " ") in archive_text.lower():
                    entities.append(rid)

        tokens_in = estimate_tokens(archive_text)
        tokens_out = estimate_tokens(summary)
        ratio = (tokens_in / tokens_out) if tokens_out else 0.0

        vector_id = f"vec_{uuid.uuid4().hex[:16]}"
        emb = ollama_embed(summary + "\n" + archive_text[:2000], self.embed_dim)
        note_path = self._write_obsidian_note(
            room=room,
            coords=coords,
            vector_id=vector_id,
            summary=summary,
            original=archive_text,
            entities=entities,
            token_density=tokens_in,
            compaction_ratio=ratio,
        )

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO context_chunks (
                  vector_id, room, gx, gy, token_estimate, original_text,
                  summary_text, embedding_json, entities_json, compaction_ratio,
                  source, created_at, note_path
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    vector_id,
                    room,
                    coords[0],
                    coords[1],
                    tokens_in,
                    archive_text,
                    summary,
                    json.dumps(emb),
                    json.dumps(entities),
                    ratio,
                    source,
                    _utc_iso(),
                    note_path,
                ),
            )
            if self._use_vec:
                try:
                    conn.execute(
                        "INSERT INTO context_vec(vector_id, embedding) VALUES (?, ?)",
                        (vector_id, json.dumps(emb)),
                    )
                except sqlite3.Error:
                    pass
            token_after = max(0, current_token_count - tokens_in + tokens_out)
            conn.execute(
                """
                INSERT INTO compaction_events (
                  room, gx, gy, token_before, token_after, segments_archived,
                  note_path, created_at, detail_json
                ) VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (
                    room,
                    coords[0],
                    coords[1],
                    current_token_count,
                    token_after,
                    len(to_archive),
                    note_path,
                    _utc_iso(),
                    json.dumps({"vector_id": vector_id, "ratio": ratio}),
                ),
            )

        # Inject summary: replace archived spans in context with summary block
        new_context = context
        for s in to_archive:
            if s.text in new_context:
                new_context = new_context.replace(
                    s.text,
                    f"\n\n<!-- arcane-compacted {vector_id} -->\n{summary}\n\n",
                    1,
                )
        if new_context == context:
            # Fallback: append summary and drop prefix
            cut = max(1, len(context) // 4)
            new_context = (
                f"<!-- arcane-compacted {vector_id} -->\n{summary}\n\n" + context[cut:]
            )

        return {
            "ok": True,
            "compacted": True,
            "room": room,
            "coords": list(coords),
            "vector_id": vector_id,
            "token_before": current_token_count,
            "token_after": estimate_tokens(new_context),
            "tokens_archived": tokens_in,
            "tokens_summary": tokens_out,
            "compaction_ratio": round(ratio, 2),
            "segments_archived": len(to_archive),
            "note_path": note_path,
            "summary": summary,
            "context_after": new_context,
            "entities": entities,
            "vec_backend": "sqlite-vec" if self._use_vec else "json-cosine",
        }

    def _write_obsidian_note(
        self,
        room: str,
        coords: tuple[int, int],
        vector_id: str,
        summary: str,
        original: str,
        entities: list[str],
        token_density: int,
        compaction_ratio: float,
    ) -> str:
        stamp = _utc_stamp()
        region = room.replace("-", "_").title()
        fname = f"Arcane_Compaction_{stamp}_{region}.md"
        # Living map under Ravenstack/keep/compactions/
        out_dir = self.vault_root / "Ravenstack" / "keep" / "compactions"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / fname

        links = []
        for e in entities[:25]:
            slug = e.strip()
            if not slug:
                continue
            links.append(f"[[{slug}]]")
        # Always link spatial rooms
        for rid in ROOM_COORDS:
            label = rid.replace("-", " ").title()
            if f"[[{label}]]" not in links and f"[[{rid}]]" not in links:
                if rid == room or rid in original.lower() or rid.replace("-", " ") in original.lower():
                    links.append(f"[[{label}]]")
        links.append("[[Library]]" if room == "library" else f"[[{room.replace('-', ' ').title()}]]")
        # Dedupe
        seen: set[str] = set()
        wiki = []
        for w in links:
            if w not in seen:
                seen.add(w)
                wiki.append(w)

        body = f"""---
vector_id: {vector_id}
token_density: {token_density}
spatial_coordinates: [{coords[0]}, {coords[1]}]
room: {room}
compaction_ratio: {round(compaction_ratio, 3)}
related_entities: {json.dumps(entities[:20])}
type: arcane-compaction
created: {_utc_iso()}
---

# Arcane Compaction — {region}

**Room:** [[{room.replace('-', ' ').title()}]] · coords `{list(coords)}`  
**Vector:** `{vector_id}` · ratio ~{compaction_ratio:.1f}×

## Summary

{summary}

## Related

{" ".join(wiki)}

## Spatial neighbors

"""
        # Neighbor rooms by manhattan ≤ 2
        for rid, c in ROOM_COORDS.items():
            d = manhattan(c, coords)
            if d <= 2:
                body += f"- [[{rid.replace('-', ' ').title()}]] (d={d})\n"

        body += f"""

## Archived excerpt (high fidelity, truncated)

```
{original[:4000]}{"…" if len(original) > 4000 else ""}
```

---
*Arcane Library Spatial Context Compactor — Ravenstack Keep*
"""
        path.write_text(body, encoding="utf-8")
        try:
            rel = str(path.relative_to(self.vault_root))
        except ValueError:
            rel = str(path)
        return rel

    def history(self, room_name: Optional[str] = None, limit: int = 20) -> dict[str, Any]:
        room = normalize_room(room_name) if room_name else None
        limit = max(1, min(int(limit or 20), 100))
        with self._connect() as conn:
            if room:
                rows = conn.execute(
                    """
                    SELECT * FROM compaction_events
                    WHERE room = ?
                    ORDER BY id DESC LIMIT ?
                    """,
                    (room, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM compaction_events
                    ORDER BY id DESC LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
        events = [dict(r) for r in rows]
        return {"ok": True, "count": len(events), "events": events, "room": room}

    def query_spatial_memory(
        self,
        query: str,
        room_name: Optional[str] = None,
        top_k: int = 5,
    ) -> dict[str, Any]:
        q = (query or "").strip()
        if not q:
            return {"ok": False, "error": "query required", "code": "invalid_input"}
        top_k = max(1, min(int(top_k or 5), 20))
        room = normalize_room(room_name) if room_name else None
        q_emb = ollama_embed(q, self.embed_dim)
        coords = ROOM_COORDS.get(room or "library", ROOM_COORDS["library"])

        with self._connect() as conn:
            if room:
                rows = conn.execute(
                    "SELECT * FROM context_chunks WHERE room = ? ORDER BY id DESC LIMIT 200",
                    (room,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM context_chunks ORDER BY id DESC LIMIT 400"
                ).fetchall()

        scored: list[tuple[float, dict[str, Any]]] = []
        for r in rows:
            try:
                emb = json.loads(r["embedding_json"] or "[]")
            except json.JSONDecodeError:
                emb = []
            sim = cosine(q_emb, emb) if emb else 0.0
            gx, gy = r["gx"], r["gy"]
            if gx is not None and gy is not None:
                dist = manhattan((int(gx), int(gy)), coords)
                spatial_boost = 1.0 / (1.0 + dist)
            else:
                spatial_boost = 0.5
            # Bias toward current room
            score = 0.7 * sim + 0.3 * spatial_boost
            if room and r["room"] == room:
                score += 0.05
            scored.append(
                (
                    score,
                    {
                        "vector_id": r["vector_id"],
                        "room": r["room"],
                        "coords": [r["gx"], r["gy"]],
                        "score": round(score, 4),
                        "similarity": round(sim, 4),
                        "summary": r["summary_text"][:800],
                        "note_path": r["note_path"],
                        "created_at": r["created_at"],
                    },
                )
            )
        scored.sort(key=lambda x: -x[0])
        hits = [h for _, h in scored[:top_k]]
        return {
            "ok": True,
            "query": q,
            "room_bias": room,
            "coords": list(coords),
            "count": len(hits),
            "hits": hits,
            "vec_backend": "sqlite-vec" if self._use_vec else "json-cosine",
        }


def default_compactor() -> ArcaneCompactor:
    return ArcaneCompactor()
