# Architect

**Status:** approved (2026-07-31)  
**Room:** Architect Drafting Room (`lock_state: live`)  
**JSON Spec:** [`architect.agent-spec.json`](./architect.agent-spec.json)  
**Skill:** `skills/ravenstack-architect/`  
**Upstream:** OSB `/obsidian-architect` + sentinel-safe refresh

## Mission
Scan codebases into maintained architecture notes under `Ravenstack/architecture/<project>/` so multi-model agents can answer "how does this work" without re-reading the tree.

## Method
1. `architect_scan.py` — deterministic facts JSON only  
2. Optional `mine_commit_decisions.py` — ADR candidates  
3. `architect_refresh.py` — overview + core modules + decisions stub  
4. Refresh replaces **only** `<!-- @generated -->` blocks; never `@user`

## Human gates
- Writes outside `@generated` or outside `Ravenstack/architecture/`
- Deleting notes or `@user` content
- OpenClaw named runtime install (separate step)

## Kill condition
Invented modules not in scan, sentinel clobber of `@user`, or 90 days unused — then retire after human review.

## Success
AI-first notes with `scanned-commit`; no invented modules; local default.
