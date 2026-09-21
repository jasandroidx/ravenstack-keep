---
name: ravenstack-research
description: >
  Dual-track research continuum + Round Table panel. Vault-first, free multi-source
  aggregate, optional OpenRouter/Gemini/Perplexity synth. Full OSB research-deep +
  obsidian-panel alignment. Writes AI-First notes under Ravenstack/research/.
---

# ravenstack-research

## Upstream
- [obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) `/research-deep`, free mode, `/obsidian-panel`
- Shared: `skills/lib/{osb_patterns,free_sources,cache,perplexity,anti_fabrication}.py`
- Policy: `docs/UPSTREAM-ALIGNMENT.md` — source-repo best is law

## Dual-track

```bash
# Free multi-source + OpenRouter synth (default)
python3 dual_track_research.py --vault /root/obsidian_vault \
  --topic "Pike County FY2025 budget certified total conflict" \
  --prefer openrouter

# Zero LLM wait (OSB free mode spirit)
python3 dual_track_research.py --vault /root/obsidian_vault \
  --topic "..." --prefer none

# Caller-side synthesis (OSB free-json path)
python3 dual_track_research.py --vault /root/obsidian_vault \
  --topic "..." --prefer free-json

# Both LLMs (Gemini may 429; client retries then fail-soft)
python3 dual_track_research.py --vault /root/obsidian_vault \
  --topic "..." --prefer both
```

## Round Table (panel)

```bash
python3 round_table.py --vault /root/obsidian_vault \
  --question "Should we approve Architect Agent Spec to live?" \
  --prefer none
```

Uses `Ravenstack/advisors/*.md` if present; else skeptic / user / operator / long-game.
Never invents consensus. Optional `--prefer openrouter` for split-aware synthesis.

## Non-regressions
timeout 180 · retries 3 · header Gemini · fail-soft ledger · ASCII scrub · vault-first · free sources without keys · anti-fabrication footers
