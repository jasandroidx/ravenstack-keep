---
name: ravenstack-ai-first-lint
description: >
  AI-First note linter + non-ASCII sweep. Full OSB validate-ai-first.sh checks 1-6
  plus Fortress claim/research rules.
---

# ravenstack-ai-first-lint

## Lint (read-only)

```bash
python3 lint_ai_first.py /root/obsidian_vault/Ravenstack/claims
python3 lint_ai_first.py /root/obsidian_vault/Ravenstack/research
```

Checks: frontmatter, tabs, date/type/tags/ai-first, preamble, banned Unicode (wikilinks preserved), secrets, claim confidence/provenance/recency, research (as of).

## Sweep

```bash
python3 sweep_non_ascii.py path/ --check    # CI gate
python3 sweep_non_ascii.py path/ --apply    # rewrite prose
```

## Upstream
`hooks/validate-ai-first.sh`, `scripts/sweep_non_ascii.py`, `references/ai-first-rules.md`
