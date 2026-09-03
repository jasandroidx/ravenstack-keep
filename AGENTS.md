# Ravenstack Keep — Agent & Orchestration Forge

Ravenstack Keep is the visual command layer, progressive agent forge, and multi-AI review surface for a personal OpenClaw/ReClaw AI operations fortress.

This document serves as the permanent set of rules and architectural principles for the repository.

## Non-Negotiable Rules

1. **Branch of Truth**: The branch of truth is `ravenstack`. All work should happen on this branch.
2. **Visual Command Layer**: `ui-v2/` is the active painted Great Hall (Phaser + React/TanStack). The old `ui/` 48×48 tile pipeline is frozen forever. Never revive it.
3. **Paper vs Live Occupancy**: Occupancy is strictly "paper" until the live pulse is properly wired (`KEEP_PULSE_URL` / HTTP API). Never invent idle chips or hallucinate activity when data is paper.
4. **Permanent Human Gates**: Human gates are permanent. Any approval action requires explicit `confirm=true` payload. Do not auto-approve gates.
5. **Mandatory Kill Conditions**: Kill conditions are mandatory on every Agent Spec.
6. **Local-First & Cost Discipline**: Local-first / cost discipline is non-negotiable. Prefer local models (`local` tier) unless paid escalation (`escalate` or `god` tier) is explicitly requested and approved.
7. **Keep MCP Tools and Specs**: Keep MCP tools and Agent Specs live under `mcp/` and `agents/`. Do not break existing contracts. Keep them as the machine source of truth.

## Architecture

- **Substrate**: Ops run on ReClaw/OpenClaw (API, RAG, etc.), and this repo serves as the visual command surface on top.
- **Pulse Contract**: The `KEEP_PULSE_URL` logic points to the Keep HTTP API (`/api/castle-map`). If the source is `api`, it displays a live badge. If it falls back to `/castle_map.json` or fails, the source is `seed` and displays as "paper".
