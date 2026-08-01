# Graph Gardener

**Status:** approved (2026-07-31)  
**Room:** Graph Garden (`lock_state: live`)  
**JSON Spec:** [`graph-gardener.agent-spec.json`](./graph-gardener.agent-spec.json)  
**Skill:** `skills/ravenstack-harvest/graph_gardener.py`  
**Upstream:** OSB `link_graph.py` + heal report-only

## Mission
Weekly structural honesty for the vault graph: hubs, orphan claims, dangling wikilinks, missing reciprocal typed edges, missing ai-first flags.

## Method
Run report-only scan; write `Ravenstack/ops/harvest/graph-gardener-YYYY-MM-DD.md`. Human acts on suggestions. Also invoked from `nightly_harvest.py`.

## Human gates
- Auto-heal rewrites of claim bodies  
- Deletes  
- Silent drop of dangling targets  

## Kill condition
Auto-delete / silent-drop, unreproducible invented counts, or 90 days unused.

## Success
Stable report-only AI-first reports; zero paid path required.
