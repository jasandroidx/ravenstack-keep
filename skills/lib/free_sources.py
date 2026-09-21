"""Free key-less research sources (OSB research toolkit free mode).

Sources: wikipedia, hackernews, reddit, arxiv, duckduckgo(+searxng fallback).
Parallel aggregate with per-source fail-soft, 24h file cache, overall timeout.
Optional keyed Tavily/Brave when env set (same join pattern as OSB research.py).
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from html import unescape
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse

import cache as research_cache

OVERALL_TIMEOUT = 30
UA = "ravenstack-research/1.0 (+https://github.com/eugeniughelbur/obsidian-second-brain free-mode port)"
DEFAULT_TTL = 24
_DEFAULT_SEARXNG = [
    "https://searx.be",
    "https://search.brave4u.com",
    "https://priv.au",
]

DDG_RESULT_RE = re.compile(
    r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)</a>'
    r'.*?<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
    re.DOTALL,
)


def _get(url: str, *, timeout: int = 15, headers: dict | None = None) -> tuple[int, str]:
    hdrs = {"User-Agent": UA, **(headers or {})}
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", errors="replace")


def _get_json(url: str, *, timeout: int = 15, headers: dict | None = None) -> Any:
    status, body = _get(url, timeout=timeout, headers=headers)
    if status != 200:
        raise RuntimeError(f"HTTP {status}")
    return json.loads(body)


def wikipedia(query: str, n: int = 5) -> list[dict]:
    cached = research_cache.get("wikipedia", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    out: list[dict] = []
    # Path 1: opensearch
    try:
        url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            {
                "action": "opensearch",
                "search": query[:80],
                "limit": n,
                "namespace": 0,
                "format": "json",
            }
        )
        data = _get_json(url, timeout=20)
        titles = data[1] if isinstance(data, list) and len(data) > 1 else []
        descs = data[2] if isinstance(data, list) and len(data) > 2 else []
        links = data[3] if isinstance(data, list) and len(data) > 3 else []
        for i, t in enumerate(titles):
            out.append(
                {
                    "source": "wikipedia",
                    "title": t,
                    "url": links[i] if i < len(links) else "",
                    "snippet": descs[i] if i < len(descs) else "",
                }
            )
    except Exception:
        out = []
    # Path 2: query list=search (more reliable for long rural queries)
    if not out:
        try:
            url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
                {
                    "action": "query",
                    "list": "search",
                    "srsearch": query[:80],
                    "srlimit": n,
                    "format": "json",
                }
            )
            data = _get_json(url, timeout=20)
            for h in (data.get("query") or {}).get("search") or []:
                title = h.get("title") or ""
                slug = title.replace(" ", "_")
                out.append(
                    {
                        "source": "wikipedia",
                        "title": title,
                        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(slug)}",
                        "snippet": re.sub(r"<[^>]+>", "", h.get("snippet") or ""),
                    }
                )
        except Exception:
            pass
    research_cache.put("wikipedia", query, out)
    return out


def hackernews(query: str, n: int = 8) -> list[dict]:
    cached = research_cache.get("hackernews", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode(
            {"query": query[:100], "hitsPerPage": min(n, 50), "tags": "story"}
        )
        data = _get_json(url)
        out = []
        for h in data.get("hits") or []:
            out.append(
                {
                    "source": "hackernews",
                    "title": h.get("title") or "",
                    "url": h.get("url")
                    or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                    "snippet": (h.get("story_text") or "")[:280],
                    "points": h.get("points"),
                    "comments": h.get("num_comments"),
                    "posted_at": h.get("created_at"),
                }
            )
        research_cache.put("hackernews", query, out)
        return out
    except Exception:
        return []


def reddit(query: str, n: int = 8) -> list[dict]:
    cached = research_cache.get("reddit", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        time.sleep(0.5)  # polite throttle (OSB)
        url = "https://www.reddit.com/search.json?" + urllib.parse.urlencode(
            {"q": query[:100], "limit": min(n, 25)}
        )
        data = _get_json(url, headers={"User-Agent": UA})
        out = []
        for child in (data.get("data") or {}).get("children") or []:
            d = child.get("data") or {}
            out.append(
                {
                    "source": "reddit",
                    "title": d.get("title") or "",
                    "url": f"https://www.reddit.com{d.get('permalink', '')}",
                    "snippet": (d.get("selftext") or "")[:280],
                    "points": d.get("score"),
                    "comments": d.get("num_comments"),
                    "extra": {"subreddit": d.get("subreddit")},
                }
            )
        research_cache.put("reddit", query, out)
        return out
    except Exception:
        return []


def arxiv(query: str, n: int = 5) -> list[dict]:
    cached = research_cache.get("arxiv", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        time.sleep(1.0)  # polite (OSB default ~3s; we use 1s for dual-track budget)
        url = "http://export.arxiv.org/api/query?" + urllib.parse.urlencode(
            {"search_query": f"all:{query[:80]}", "start": 0, "max_results": n}
        )
        _, xml = _get(url, timeout=20)
        entries = re.findall(r"<entry>(.*?)</entry>", xml, re.DOTALL)
        out = []
        for e in entries[:n]:
            title = re.search(r"<title>(.*?)</title>", e, re.DOTALL)
            link = re.search(r"<id>(https?://arxiv\.org/abs/[^<]+)</id>", e)
            summary = re.search(r"<summary>(.*?)</summary>", e, re.DOTALL)
            out.append(
                {
                    "source": "arxiv",
                    "title": (title.group(1).strip() if title else "").replace("\n", " "),
                    "url": link.group(1) if link else "",
                    "snippet": (summary.group(1).strip()[:300] if summary else "").replace(
                        "\n", " "
                    ),
                }
            )
        research_cache.put("arxiv", query, out)
        return out
    except Exception:
        return []


def _strip_ddg_redirect(raw_url: str) -> str:
    if "uddg=" in raw_url:
        qs = parse_qs(urlparse(raw_url).query)
        if "uddg" in qs:
            return unquote(qs["uddg"][0])
    return raw_url


def duckduckgo(query: str, n: int = 8) -> list[dict]:
    cached = research_cache.get("duckduckgo", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    results = _try_ddg(query, n)
    if not results:
        results = _try_searxng(query, n)
    research_cache.put("duckduckgo", query, results)
    return results


def _try_ddg(query: str, n: int) -> list[dict]:
    try:
        url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
        _, html = _get(url, timeout=15, headers={"Accept-Language": "en-US,en;q=0.9"})
        out: list[dict] = []
        for m in list(DDG_RESULT_RE.finditer(html))[:n]:
            raw_url, title, snippet = m.group(1), m.group(2), m.group(3)
            clean_snippet = re.sub(r"<[^>]+>", "", snippet).strip()
            out.append(
                {
                    "source": "duckduckgo",
                    "title": unescape(title).strip(),
                    "url": _strip_ddg_redirect(raw_url),
                    "snippet": unescape(clean_snippet) or "",
                }
            )
        return out
    except Exception:
        return []


def _try_searxng(query: str, n: int) -> list[dict]:
    raw = os.environ.get("RESEARCH_SEARXNG_INSTANCES", "").strip()
    instances = (
        [s.strip() for s in raw.split(",") if s.strip()] if raw else list(_DEFAULT_SEARXNG)
    )
    for inst in instances:
        try:
            url = f"{inst.rstrip('/')}/search?" + urllib.parse.urlencode(
                {"q": query, "format": "json"}
            )
            data = _get_json(url, timeout=12)
            out = []
            for item in (data.get("results") or [])[:n]:
                out.append(
                    {
                        "source": "searxng",
                        "title": item.get("title") or "",
                        "url": item.get("url") or "",
                        "snippet": item.get("content") or "",
                    }
                )
            if out:
                return out
        except Exception:
            continue
    return []


def tavily(query: str, n: int = 5) -> list[dict]:
    key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not key:
        return []
    try:
        payload = json.dumps({"api_key": key, "query": query, "max_results": n}).encode()
        req = urllib.request.Request(
            "https://api.tavily.com/search",
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": UA},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
        out = []
        for item in data.get("results") or []:
            out.append(
                {
                    "source": "tavily",
                    "title": item.get("title") or "",
                    "url": item.get("url") or "",
                    "snippet": item.get("content") or "",
                }
            )
        return out
    except Exception:
        return []


def semantic_scholar(query: str, n: int = 8) -> list[dict]:
    """Semantic Scholar Graph API (free, unauth; throttle-friendly)."""
    cached = research_cache.get("semantic_scholar", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        time.sleep(0.4)
        url = "https://api.semanticscholar.org/graph/v1/paper/search?" + urllib.parse.urlencode(
            {
                "query": query[:200],
                "limit": min(n, 20),
                "fields": "title,abstract,authors,year,url,externalIds",
            }
        )
        data = _get_json(url, timeout=20)
        out = []
        for paper in data.get("data") or []:
            authors = [a.get("name", "") for a in (paper.get("authors") or [])]
            doi = (paper.get("externalIds") or {}).get("DOI")
            url_p = paper.get("url") or (f"https://doi.org/{doi}" if doi else "")
            out.append(
                {
                    "source": "semantic_scholar",
                    "title": paper.get("title") or "",
                    "url": url_p,
                    "snippet": (paper.get("abstract") or "")[:300],
                    "year": paper.get("year"),
                    "authors": [a for a in authors if a],
                    "extra": {"doi": doi} if doi else {},
                }
            )
        research_cache.put("semantic_scholar", query, out)
        return out
    except Exception:
        return []


def openalex(query: str, n: int = 8) -> list[dict]:
    """OpenAlex Works API (free; polite User-Agent)."""
    cached = research_cache.get("openalex", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        url = "https://api.openalex.org/works?" + urllib.parse.urlencode(
            {"search": query[:200], "per-page": min(n, 25)}
        )
        data = _get_json(url, timeout=20)
        out = []
        for w in data.get("results") or []:
            doi = w.get("doi")
            title = w.get("display_name") or w.get("title") or ""
            authors = [
                a.get("author", {}).get("display_name", "")
                for a in (w.get("authorships") or [])
            ]
            out.append(
                {
                    "source": "openalex",
                    "title": title,
                    "url": doi or w.get("id") or "",
                    "snippet": "",
                    "year": w.get("publication_year"),
                    "authors": [a for a in authors if a],
                    "extra": {"doi": doi, "cited_by_count": w.get("cited_by_count")},
                }
            )
        research_cache.put("openalex", query, out)
        return out
    except Exception:
        return []


def crossref(query: str, n: int = 8) -> list[dict]:
    """CrossRef REST API (free)."""
    cached = research_cache.get("crossref", query, DEFAULT_TTL)
    if cached is not None:
        return cached
    try:
        url = "https://api.crossref.org/works?" + urllib.parse.urlencode(
            {"query": query[:200], "rows": min(n, 25)}
        )
        data = _get_json(url, timeout=20)
        out = []
        for w in (data.get("message") or {}).get("items") or []:
            titles = w.get("title") or []
            title = titles[0] if titles else ""
            doi = w.get("DOI")
            authors = [
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                for a in (w.get("author") or [])
            ]
            year = None
            date_parts = (w.get("issued") or {}).get("date-parts") or []
            if date_parts and date_parts[0]:
                year = date_parts[0][0]
            out.append(
                {
                    "source": "crossref",
                    "title": title,
                    "url": w.get("URL") or (f"https://doi.org/{doi}" if doi else ""),
                    "snippet": re.sub(r"<[^>]+>", "", w.get("abstract") or "")[:300],
                    "year": year,
                    "authors": [a for a in authors if a],
                    "extra": {"doi": doi},
                }
            )
        research_cache.put("crossref", query, out)
        return out
    except Exception:
        return []


SOURCE_FNS: dict[str, Callable[[str, int], list[dict]]] = {
    "wikipedia": wikipedia,
    "hackernews": hackernews,
    "reddit": reddit,
    "arxiv": arxiv,
    "duckduckgo": duckduckgo,
    "tavily": tavily,
    "semantic_scholar": semantic_scholar,
    "openalex": openalex,
    "crossref": crossref,
}

DEFAULT_DISCOURSE = [
    "duckduckgo",
    "wikipedia",
    "hackernews",
    "reddit",
    "arxiv",
    "semantic_scholar",
]
ACADEMIC = ["arxiv", "semantic_scholar", "openalex", "crossref"]


def free_source_names(*, academic: bool = False) -> list[str]:
    names = list(ACADEMIC if academic else DEFAULT_DISCOURSE)
    if os.environ.get("TAVILY_API_KEY", "").strip() and "tavily" not in names:
        names.append("tavily")
    return names


def aggregate_free(
    query: str,
    sources: list[str] | None = None,
    n_per: int = 8,
    timeout: float = OVERALL_TIMEOUT,
    academic: bool = False,
) -> dict[str, Any]:
    """OSB aggregator contract: parallel, fail-soft, stats, warnings.

    success heuristic: >=3 sources for full free mode; for thin runs still
    report truthful stats.sources_succeeded.
    """
    names = sources or free_source_names(academic=academic)
    results: list[dict] = []
    warnings: list[str] = []
    succeeded: set[str] = set()

    def _run(name: str) -> tuple[str, list[dict], str | None]:
        fn = SOURCE_FNS.get(name)
        if not fn:
            return name, [], f"unknown source {name}"
        try:
            got = fn(query, n_per)
            return name, got, None
        except Exception as e:
            return name, [], str(e)

    ex = ThreadPoolExecutor(max_workers=max(1, len(names)))
    try:
        futs = {ex.submit(_run, n): n for n in names}
        try:
            for fut in as_completed(futs, timeout=timeout):
                name, got, err = fut.result()
                if err:
                    warnings.append(f"{name}: {err}")
                if got:
                    results.extend(got)
                    succeeded.add(name)
                elif not err:
                    warnings.append(f"{name}: empty")
        except FuturesTimeout:
            for f, n in futs.items():
                if not f.done():
                    warnings.append(f"{n}: timeout")
    finally:
        ex.shutdown(wait=False, cancel_futures=True)

    return {
        "topic": query,
        "results": results,
        "stats": {
            "sources_attempted": len(names),
            "sources_succeeded": len(succeeded),
            "results_total": len(results),
            "success": len(succeeded) >= 3,
            "sources_ok": sorted(succeeded),
        },
        "warnings": warnings,
    }


def format_results_md(agg: dict[str, Any], as_of: str) -> str:
    lines = []
    for r in agg.get("results") or []:
        title = r.get("title") or "(untitled)"
        url = r.get("url") or ""
        src = r.get("source") or "?"
        snip = (r.get("snippet") or "").replace("\n", " ")[:200]
        if url:
            lines.append(f"- [{title}]({url}) (as of {as_of}, {src}) - {snip}")
        else:
            lines.append(f"- {title} (as of {as_of}, {src}) - {snip}")
    return "\n".join(lines) if lines else "- none"
