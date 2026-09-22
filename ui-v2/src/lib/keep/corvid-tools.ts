/**
 * Corvid's toolbox — keyless web search and read-only page rendering.
 *
 * Approved by the operator 2026-09-22 (see catalog.ts's corvid spec). Mirrors
 * the proven approach in skills/lib/free_sources.py (same DuckDuckGo HTML
 * scrape + regex, same "fail soft per source, never fabricate" shape) rather
 * than reinventing a weaker version — that module already solved this for
 * Claude Code's own research skill; this is the Keep's in-process TS port of
 * the same technique so ui-v2 doesn't need a cross-process call to run it.
 *
 * Every function here fails closed: no result reads as "nothing found",
 * never as a plausible-looking made-up answer.
 */

export type SearchResult = {
  source: "duckduckgo" | "wikipedia";
  title: string;
  url: string;
  snippet: string;
};

export type SearchOutcome =
  | { ok: true; results: SearchResult[] }
  | { ok: false; error: string };

const UA =
  "ravenstack-keep-corvid/1.0 (+https://github.com/jasandroidx/ravenstack-keep; on-demand research, operator-approved)";

// Mirrors free_sources.py's DDG_RESULT_RE exactly: DuckDuckGo's HTML result
// page wraps each hit as <a class="result__a" href="...">title</a> followed
// later by <a class="result__snippet">...</a>.
const DDG_RESULT_RE =
  /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function unescapeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** DuckDuckGo wraps outbound links in a redirect carrying the real URL in `uddg`. */
function unwrapDdgRedirect(rawUrl: string): string {
  try {
    const full = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const u = new URL(full);
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : full;
  } catch {
    return rawUrl;
  }
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?${new URLSearchParams({ q: query })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const out: SearchResult[] = [];
  for (const m of html.matchAll(DDG_RESULT_RE)) {
    if (out.length >= limit) break;
    const [, rawUrl, title, snippet] = m;
    out.push({
      source: "duckduckgo",
      title: unescapeEntities(title).trim(),
      url: unwrapDdgRedirect(rawUrl),
      snippet: unescapeEntities(stripTags(snippet)),
    });
  }
  return out;
}

/** Keyless, reliable for named topics — used as a second source, not a fallback-of-last-resort. */
async function searchWikipedia(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "opensearch",
    search: query,
    limit: String(limit),
    format: "json",
  })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as [string, string[], string[], string[]];
  const [, titles, descriptions, urls] = data;
  return titles.map((title, i) => ({
    source: "wikipedia" as const,
    title,
    url: urls[i] ?? "",
    snippet: descriptions[i] ?? "",
  }));
}

/**
 * Web search — DuckDuckGo HTML results plus Wikipedia, merged. Each source
 * fails soft independently; only a total failure across both returns `ok: false`.
 * (DuckDuckGo's Instant Answer JSON API was tried and dropped: it returns an
 * empty stub for anything but a handful of known entities — not a real search.
 * SearXNG mirrors were tried too and are currently bot-walled from this box's
 * IP, so this intentionally skips straight to DuckDuckGo HTML, unlike
 * free_sources.py's SearXNG-as-fallback chain.)
 */
export async function webSearch(query: string, limit = 6): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Empty search query." };

  const [ddg, wiki] = await Promise.allSettled([
    searchDuckDuckGo(trimmed, limit),
    searchWikipedia(trimmed, Math.min(3, limit)),
  ]);

  const results: SearchResult[] = [
    ...(ddg.status === "fulfilled" ? ddg.value : []),
    ...(wiki.status === "fulfilled" ? wiki.value : []),
  ];

  if (results.length === 0) {
    const ddgErr = ddg.status === "rejected" ? String(ddg.reason) : "no results";
    const wikiErr = wiki.status === "rejected" ? String(wiki.reason) : "no results";
    return { ok: false, error: `web_search found nothing (duckduckgo: ${ddgErr}; wikipedia: ${wikiErr}).` };
  }
  return { ok: true, results: results.slice(0, limit) };
}

export type BrowserRenderOutcome =
  | { ok: true; url: string; text: string }
  | { ok: false; error: string };

/**
 * Render one page and return its visible text. Read-only by design — no form
 * submission, no login, no clicking (see corvid's gates in catalog.ts).
 *
 * Backed by scripts/render-page.mjs, a standalone Playwright subprocess (NOT
 * `browser-use`: that CLI turned out to be a CDP *client* — it needs an
 * already-running Chrome with a remote-debugging port, which nothing on this
 * box stands up. Spinning up a persistent Chrome+CDP service just for this
 * was a bigger, separate infra call than "wire up a tool", so this uses the
 * `playwright` dependency ui-v2 already ships, launching a fresh headless
 * chromium per call and closing it — no persistent browser process, matching
 * corvid's "never ambient" rule).
 *
 * Fails closed if the subprocess errors, rather than silently falling back to
 * a plain fetch (which can't render JS-heavy pages and would misrepresent
 * what was actually read).
 */
export async function browserRender(url: string): Promise<BrowserRenderOutcome> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: `Not a valid URL: ${url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `Refused non-http(s) URL: ${url}` };
  }

  const { spawn } = await import("node:child_process");
  const { join } = await import("node:path");
  // process.cwd() is ui-v2/ under both `vite dev` and the built Nitro
  // service (systemd's WorkingDirectory=/root/ravenstack-keep/ui-v2) — same
  // assumption scripts/copy-pglite-assets.mjs's sibling tooling relies on.
  const scriptPath = join(process.cwd(), "scripts", "render-page.mjs");

  return await new Promise<BrowserRenderOutcome>((resolve) => {
    const child = spawn(process.execPath, [scriptPath, parsed.toString()], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: "browser_render timed out after 25s." });
    }, 25000);

    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (errOut += String(d)));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not launch render-page.mjs: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !out.trim()) {
        resolve({ ok: false, error: errOut.trim().slice(0, 400) || `render-page.mjs exited ${code}` });
        return;
      }
      resolve({ ok: true, url: parsed.toString(), text: out.trim() });
    });
  });
}
