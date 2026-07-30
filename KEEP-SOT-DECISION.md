---
title: Ravenstack Keep — Source of Truth Decision
version: 1.1
date: 2026-07-30
author: Claude (Cowork / Desktop)
status: accepted — migration executed 2026-07-30 (Grok Build laptop)
supersedes: docs/ARCHITECTURE-MCP-SPLIT.md open decision #1 ("SOT — Drive spatial map vs blueprint rooms vs vault Oracle")
---

# KEEP-SOT-DECISION.md

## Provenance note (read first)

This memo is built from: the full `ravenstack-keep` repo on disk (blueprint, schema, `agents/oracle.agent-spec.json`, `mcp/seeds/castle_map.provisional.json`, the working v0 MCP server source, `reviews/`), nine Drive documents dated 2026-06-19 through 2026-07-30 (Keep Architecture Guide v2.0, Roundtable Orchestrator spec, A2A spec, Spatial Layout spec, Dashboard TS modules, and Drive's own cached copies of `RAVENSTACK-ORACLE.md` / `RAVENSTACK-ARCHITECTURE.md`, dated 2026-07-18/19), and a live Fortress MCP session confirmed reachable on the second pass.

**v1.0 gap (2026-07-30, first pass):** Fortress MCP was unreachable — `read_oracle`, `read_vault_file`, `list_knowledge_topics`, `git_vault_status` all failed ("hostname doesn't resolve"). The decision was made from Drive's cached vault copy, dated 2026-07-19.

**v1.1 update (2026-07-30, same day, connector back up):** Re-ran the vault comparison live. `reclaw_health` returned `status: ok` (ReClaw 2.0.0, prod). `git_vault_status` showed both repos dirty (`ReClaw-2.0` HEAD `279bbea`, `obsidian_vault` HEAD `92e9fe3`, branch `master`). Live-read `RAVENSTACK-ORACLE.md` (now v1.1, matches the Drive-cached copy almost verbatim), `RAVENSTACK-SOK.md` (a bare-bones companion doc, not seen in Drive — same "SOT = private vault" claim, no Keep-specific content), `knowledge_index.md` (last updated 2026-07-17), and `agent-architecture.md` (last updated 2026-06-19). Also pulled the full `list_knowledge_topics` file listing (~100 files).

**Finding: no contradiction.** Nothing in the live vault mentions Clawforge-as-room, room coordinates, Agent Specs, A2A, `silent-auditor`, `raziel-main`, or any Keep-specific room/agent fact. `agent-architecture.md` lists future agent names generically ("researcher, analyst, marketplace_flips, content_studio, grant_watcher, clawsmith, orchestrator") — consistent with, but not more specific than, what's already in this memo. The vault genuinely predates and is silent on Keep specifics, exactly as assumed in v1.0. Kill criterion #1 (below) is resolved as of this check; it re-opens only if the vault is updated later without a corresponding update here.

---

## 1. Executive decision

**Model C — Hybrid, repo-centric for machine truth.** `ravenstack-keep` (the git repo) owns the machine-readable facts: which rooms exist, which agents are real, their coordinates, and lock states. The unit of "agent is real" stays exactly what the schema already says: a `status ≥ approved` file in `agents/*.agent-spec.json` that validates against `schemas/agent-spec.schema.json`. The Obsidian vault (`Ravenstack/RAVENSTACK-ORACLE.md` + `RAVENSTACK-ARCHITECTURE.md`) keeps owning narrative fortress knowledge — gateway topology, memory engine, reload ritual — exactly as it already claims to for itself. The nine Drive documents are frozen as historical/reference material: useful as a coordinate and protocol-schema donor, not live truth, and never re-synced automatically.

This isn't a new design — it's what `mcp/README.md`'s "SOT note" and `docs/ARCHITECTURE-MCP-SPLIT.md`'s non-negotiable #5 already say, and what the working v0 server in `mcp/src/` already does (it bootstraps its room table from the provisional seed file exactly once, then treats `agents/*.agent-spec.json` as the only source that can promote a room to real). This memo makes that decisive, names the eight canonical rooms and six candidate agents, and gives a ≤10-step migration to drop "provisional" from the filename.

Two AIs do not get to keep independently authoring competing Keep specs in Drive. From this point, Keep facts land in the repo or they don't count.

---

## 2. Conflict table

| Entity | Blueprint v0.2 (repo) | Drive Spatial Layout / Architecture Guide | Provisional castle_map.json (repo) | Vault Oracle (Drive-cached copy, 2026-07-19) | Disagreement |
|---|---|---|---|---|---|
| **Clawforge — meaning** | Meta-forge: the factory that interrogates ideas, drafts Agent Specs, gates on human approval, provisions rooms (§3.3) | "Blacksmith Forge Area" — an **execution** room (task/build pipelines), occupied by `raziel-main` (moderator) + `clawsmith-compiler` (build compiler) | Splits the difference: `orchestrator` room holds `raziel-main`; `clawforge` room holds `clawsmith-compiler`, status_summary flags "meta-Clawforge intake not provisioned" | Silent on Keep-specific rooms (predates Keep concept) | Same name, two different jobs. Provisional map already resolved it by routing the moderator to a separate `orchestrator` room. |
| **Orchestrator room** | Listed as live, separate from Clawforge (§2 table) | Not a room at all — `raziel-main` sits at a desk inside `clawforge` | Present as its own room, `raziel-main` occupant | — | Drive collapses two blueprint rooms into one. |
| **Oracle room — occupant identity** | Room "Oracle," unforged; full Agent Spec on disk names the agent "Oracle," character = citation-first RAG librarian | Desk at Oracle's coordinates (240,180) is assigned to `silent-auditor`, role "Auditor / Knowledge Manager" | Splits it: `oracle` room keeps the draft-spec agent `oracle`; a **new** `auditor` room holds `silent-auditor` | — | Drive puts a different agent, with a different job, at the Oracle desk. Only `oracle` has a real, schema-valid spec file. |
| **Scribe — agent id** | Oracle spec's handoff table names the target `scribe-warden` | Room `scribe`, occupant `content-scriptwriter` | Room `scribe`, occupant `content-scriptwriter`; name field says "Scribe Warden" | — | Repo's own on-disk Oracle spec references an agent id (`scribe-warden`) that no seed or map uses anywhere else. Small internal inconsistency inside the repo itself. |
| **Lead Forge room** | Not mentioned | Room `lead_forge` (120,450), "Operational Gates," occupant `gatekeeper-proxy` | Carried over as UNFORGED, status_summary: "overlaps county gate concerns" | — | Pure addition from Drive; conceptually duplicates the `human_gates` + `pending_gates` mechanism the schema and MCP tool catalog already define. No blueprint concept for it. |
| **Suno Studio room** | Not mentioned | Room `suno_studio` (780,220), occupant `suno-audio-gen` | Carried over as UNFORGED | — | Pure addition from Drive, no blueprint counterpart, no conflict — just an extra. |
| **Flipper room** | Listed as unforged (§2 table), no description beyond the name | Not mentioned anywhere | Carried over as UNFORGED, no occupant | Architecture doc lists `marketplace-automation.md` / "Etsy flip" as an existing knowledge domain | Blueprint-only; likely the future marketplace-flip agent room. No conflicting claim, just unfilled. |
| **Room coordinates (x, y)** | Not specified | Full (x,y) table, e.g. clawforge (520,320), oracle (240,180) | Copied verbatim from Drive | — | No real conflict — Drive is the only source with numbers, and the provisional map already adopted them. |
| **Coordinate internal consistency** | n/a | Spatial Layout doc: `scribe` = (380,220). Dashboard TS Modules doc (same day, same author pass): labels a room "Scribe (Lead Forge)" at (120,450) — Lead Forge's coordinates, Scribe's name | n/a | — | Drive contradicts itself between two documents written the same session. One more reason Drive can't be authoritative without cleanup. |
| **A2A protocol** | Not designed (blueprint only names "Round Table" as a *concept*, Phase 5) | Full schema: `A2AHeader`, `A2ADelegationMessage`, `A2AResultMessage`, `A2AStatusMessage`, consensus vote/request, 2,000-char cap, `trace_id` | `mcp/tools.md`: `list_a2a_messages` / `get_agent_trace` exist as **read-only, honest-empty stubs** — "no invented chains" | — | Drive's schema is real design work with no implementation. Repo already committed to never fabricating A2A history. No conflict on behavior, just on completeness — Drive's schema is a good future reference, not a live source. |
| **"Round Table" vs "Roundtable Orchestrator"** | "Round Table" = external multi-model deliberation (Grok/Claude/Gemini/local), Phase 5, stub tools only (`start_roundtable` etc., all `not_instrumented`) | "Roundtable Orchestrator" = an internal 7-stage DAG execution engine (Moderator/Researcher/Analyst/Creator/Auditor roles, FSM, Total-ReClaw Memory Engine with sqlite-vec) | n/a | — | Two different systems sharing one name. Drive's version is a *runtime orchestration engine* redesign — out of this memo's scope (no reclaw-platform redesign) and not reflected anywhere in the repo's actual code. |
| **Vault path claims** | Not specified | Both Architecture Guide and Roundtable spec declare "Primary SOT Vault: /root/obsidian_vault/Ravenstack/" | `paths.py` looks for `RECLAW_OBSIDIAN_VAULT_PATH` env var, falls back to `~/obsidian_vault` | ORACLE.md: "Private vault... is single source of truth (SOT)... obey the Oracle" | No real conflict — all three agree the vault is SOT for fortress knowledge. None of them say the vault is SOT for Keep room/agent IDs specifically, because the vault (as last verified 2026-07-19) predates the Keep room concept entirely. |

---

## 3. Canonical IDs (v1)

### Rooms

| room_id | room_name | lock_state | Canonical source |
|---|---|---|---|
| `orchestrator` | Orchestrator | live | Blueprint §2 (live) + provisional map; occupant `raziel-main` (no spec file yet) |
| `clawforge` | Clawforge | live | Blueprint §3.3 (meta-forge meaning wins — see §5); occupant `clawsmith-compiler` as first forge output, meta-intake not yet provisioned |
| `oracle` | Oracle | UNFORGED | `agents/oracle.agent-spec.json` (status=draft, the only real spec on disk) |
| `scribe` | Scribe Warden | UNFORGED | Blueprint name + Drive room_id/coords; occupant-designate `content-scriptwriter` |
| `auditor` | Silent Auditor | UNFORGED | Provisional map's split-the-difference room; occupant-designate `silent-auditor` |
| `lead_forge` | Lead Forge | UNFORGED | Drive-only addition; occupant-designate `gatekeeper-proxy` |
| `suno_studio` | Suno Studio | UNFORGED | Drive-only addition; occupant-designate `suno-audio-gen` |
| `flipper` | Flipper | UNFORGED | Blueprint-only; no occupant designated |

### Agents

| agent_id | Has Agent Spec on disk? | Status | Notes |
|---|---|---|---|
| `oracle` | Yes — `agents/oracle.agent-spec.json` | draft | Only agent that is "real" per the mandatory rule (schema-valid spec file). Everyone else below is a named candidate, not yet real. |
| `raziel-main` | No | candidate | Chief orchestrator/moderator — named consistently across blueprint, Drive, and Roundtable Orchestrator spec. High-confidence identity, zero formal spec. |
| `clawsmith-compiler` | No | candidate | Build compiler, Drive-only naming, no conflicting claims elsewhere. |
| `silent-auditor` | No | candidate | Auditor/knowledge-verification role. Room assignment resolved in §2 above (gets its own `auditor` room, not `oracle`'s). |
| `content-scriptwriter` | No | candidate | Scribe room occupant-designate. See §6 cleanup item on the `scribe-warden` handoff reference. |
| `suno-audio-gen` | No | candidate | Drive-only, lowest priority, no conflicting claims. |
| `gatekeeper-proxy` | No | candidate | Lead Forge occupant-designate; role overlaps the schema's `human_gates` mechanism — may end up as a UI/reporting layer over existing gates rather than a new autonomous agent. Worth a scope check before drafting its spec. |

No agent besides `oracle` should be treated as real, quoted as "live," or unlocked until a spec file exists and passes schema validation. That includes `raziel-main`, even though it's the most consistently-named agent across every source — consistency across documents is not the same as a validated spec.

---

## 4. File locations (canonical)

| Path | Owns |
|---|---|
| `agents/*.agent-spec.json` | Agent truth. A room/agent is "real" only when a file here validates against the schema at `status ≥ approved`. |
| `schemas/agent-spec.schema.json` | The validation contract. Already enforces `kill_condition`, `model_tier.default = local`, `knowledge_seeds.indexes ∈ {self, domain, longtail}` (no `general`). |
| `mcp/seeds/castle_map.json` *(renamed from `castle_map.provisional.json` — see §6 step 2)* | Room roster: `room_id`, coordinates, `lock_state`, `occupant_agent_id`. Read once by `mcp/src/ravenstack_keep_mcp/store.py` to bootstrap the SQLite room table; SQLite is the runtime cache, this file is the source. |
| `RAVENSTACK-KEEP-BLUEPRINT-v0.2.md` | Narrative design intent for Keep-specific concepts (Clawforge's meaning, cost tiers, phases). Needs the two edits in §5. |
| Vault `Ravenstack/RAVENSTACK-ORACLE.md` + `Ravenstack/RAVENSTACK-ARCHITECTURE.md` | Narrative SOT for general fortress knowledge (gateway, memory engine, reload ritual, MCP endpoints). Keep does not duplicate this — it links to it. |
| Vault `Ravenstack/keep/` *(new, write-only mirror)* | Where an approved summary of this decision gets ingested once Fortress MCP is reachable — one-time write, not a live sync target. |
| Drive: the 5 Keep-specific docs listed in §5 | Frozen historical reference. Not read by any tool, not treated as current. |

---

## 5. What to demote

**Frozen to historical/reference (mark in Drive, do not delete):**
- Ravenstack Keep Architecture & Technical Resource Guide (v2.0) — its Total-ReClaw Memory Engine (sqlite-vec + FTS5) description is reclaw-platform territory, out of Keep's scope, and unverified against live code this session.
- Ravenstack AI Roundtable Orchestrator Architecture Specification (v1.0) — a full DAG execution-engine redesign, heavier than and inconsistent with blueprint's "Round Table" concept. Do not build this under the Keep SOT project; if it's ever greenlit, it needs its own scoping pass (see Kill Criteria).
- Ravenstack Fortress Inter-Agent Communication Protocol (A2A) Specification (v1.0.0) — keep as the reference schema for *when* `list_a2a_messages`/`get_agent_trace` move past stub status. Not live today.
- Ravenstack Keep Spatial Layout & Coordinate Map Specification (v1.0) — superseded by `mcp/seeds/castle_map.json`. The coordinate values already made it into the provisional map; the room-naming and Clawforge-as-execution-room framing did not survive.
- Ravenstack Keep Dashboard TypeScript Modules (RavenstackFortressScene & ModalWindow) — reference only for whenever the Phaser UI is actually built (explicitly out of scope here).

**Blueprint sections to rewrite:**
- §2 "What already exists" table — replace the 5-room summary (2 active, 3 unforged) with the 8-room canonical list from §3 above.
- §11 "Naming" — add one line: "Clawforge is the meta-forge (idea → spec → approval → provision), not an execution room. An earlier Drive spec used the name for a task-execution room; that meaning was rejected in KEEP-SOT-DECISION.md."

---

## 6. Migration steps (≤10, ordered, reversible)

1. **Human:** approve this memo. Record it as a finding in `reviews/` (add a row to `reviews/INDEX.md`) so it's discoverable the way Grok's Phase 1 session was.
2. **Grok Build or human:** `git mv mcp/seeds/castle_map.provisional.json mcp/seeds/castle_map.json`; update `sot_status` field to `"CANONICAL"`; grep for the old filename in `mcp/src/` and `mcp/tests/` and update references.
3. **Human or Grok Build:** in `agents/oracle.agent-spec.json`, change the handoff target `"scribe-warden"` to `"content-scriptwriter"` (matches the agent_id used everywhere else); re-run schema validation.
4. **Grok Build:** update `RAVENSTACK-KEEP-BLUEPRINT-v0.2.md` per §5 above (rooms table + Clawforge naming note).
5. **Human:** add a comment or title-prefix ("SUPERSEDED — see ravenstack-keep/KEEP-SOT-DECISION.md") to the 5 Drive docs listed in §5. No deletion.
6. **Human, once Fortress MCP is reachable:** ingest a short summary of this decision into `Ravenstack/keep/keep-sot-decision-summary.md` via `save_ravenstack_note` or `write_vault_file`. One-time write, not a recurring sync.
7. **Grok Build:** build `scripts/validate_agent_specs.py` (already flagged in Grok's Phase 1 findings, backlog item #1) and wire it into CI so every `agents/*.agent-spec.json` is schema-checked on every PR. This is what makes "Agent Spec = unit of reality" enforced, not just stated.
8. **Human:** update `docs/ARCHITECTURE-MCP-SPLIT.md` "Open decisions" — mark item 1 (SOT) resolved, link to this file.
9. Nothing above touches the Hetzner production deployment, county queue, or reclaw-platform. Every step is a repo/vault edit, reversible with `git revert`.

---

## 7. MCP implications

No new tools are needed — the v0 tool catalog in `mcp/tools.md` already matches this decision:

- `keep_health` / `sot_versions` — should report `sot_status: CANONICAL` and the `castle_map.json` path once step 2 lands.
- `list_rooms` / `get_room` / `get_castle_map` — already read `mcp/seeds/castle_map.provisional.json` (soon `castle_map.json`) to bootstrap SQLite once, then serve from the SQLite runtime cache. No change required.
- `get_agent_spec` / `list_agent_specs` — already read `agents/*.agent-spec.json` and schema-validate. No change required.
- `list_a2a_messages` / `get_agent_trace` — stay honest-empty (`not_instrumented`) until an actual message bus exists. When it does, use the Drive A2A spec's schema (`A2AHeader`, `trace_id`, etc.) as the field reference rather than re-deriving one.
- Governance tools (`propose_agent_spec`, `approve_spec`, `unlock_room`, `retire_agent`) — unaffected; they already gate on the same `agents/` + schema truth this memo ratifies.

---

## 8. Kill criteria

Revisit this decision if any of the following happen:

1. ~~Fortress MCP reconnects and a live read of `Ravenstack/RAVENSTACK-ORACLE.md` shows Keep-specific room/agent facts that contradict this memo.~~ **Resolved 2026-07-30 (v1.1):** live vault checked, no contradiction found. Re-open only if the vault is later updated with Keep-specific content that wasn't cross-checked here.
2. More than two Agent Specs reach `status: live` and their real-world occupancy contradicts `castle_map.json` for more than 7 days without a spec update.
3. The Roundtable Orchestrator (Drive spec) is greenlit for real implementation — that introduces a new memory engine and session-cell model this memo does not cover, and needs its own ownership pass.
4. The operator explicitly reopens the Clawforge naming call (e.g., decides Drive's execution-room meaning should win after all).

---

## 9. Explicit non-goals

- No FastMCP tools were implemented or modified.
- No cost ledger / OpenRouter wiring.
- No county queue or reclaw-platform changes.
- No Phaser sprite art or dashboard code.
- No resolution of "Round Table" vs "Roundtable Orchestrator" beyond flagging it as a scope conflict (§2, §5) — implementing either is a separate decision.
- No live vault write performed — Fortress MCP was unreachable this session (see Provenance note and step 6).
