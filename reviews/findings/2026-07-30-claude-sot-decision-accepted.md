# Finding: Keep SOT decision accepted + migration executed

**Date:** 2026-07-30  
**Author:** Claude (decision memo v1.1) + Grok Build (execution)  
**Status:** accepted  

## Summary

Operator accepted [KEEP-SOT-DECISION.md](../../KEEP-SOT-DECISION.md) (Model C — hybrid, repo-centric). Grok Build executed migration steps on the laptop repo.

## Executed

- [x] Seed renamed to `mcp/seeds/castle_map.json`, `sot_status: CANONICAL`
- [x] Store/server default SOT CANONICAL; seed path prefers `castle_map.json`
- [x] Oracle handoff `scribe-warden` → `content-scriptwriter`
- [x] Blueprint §2 rooms table + §11 Clawforge naming note
- [x] ARCHITECTURE-MCP-SPLIT open decision #1 resolved
- [x] `scripts/validate_agent_specs.py`
- [x] Vault summary via reclaw `write_vault_file` (when MCP up)

## Human still

- Drive: mark 5 Keep docs SUPERSEDED (title/prefix) — no deletion
