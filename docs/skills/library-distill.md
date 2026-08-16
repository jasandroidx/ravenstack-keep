# Skill: library-distill

**Status:** active as operator/Grok skill; OpenClaw install optional later  
**Purpose:** Turn owned books/PDFs/Drive files into fortress knowledge without polluting RAG.  
**Date:** 2026-07-31

---

## One-sentence job

Given a source (Drive file id / path / uploaded text), produce either a **production vault note**, a **pointer**, a **catalog row**, or a **trash recommendation** — never a whole-book dump into RAG.

## Who runs it

| Runner | When |
|--------|------|
| **Super Grok + this skill** (default now) | Quality distill, priority books, fortress-aligned notes |
| **Future Scribe / library agent via MCP** | Same rules, after Drive MCP is wired; batch overnight |
| **Local Ollama batch** | Catalog + inbox only; human/Grok promote to production |

## Inputs

- Source: Drive file_id, name, or pasted extract
- Mode: `catalog` | `pointer` | `distill` | `triage`
- Optional: target domain (`agents`, `side-hustle`, `biz-ops`, `stack-ops`, `prompts`)

## Outputs (exactly one primary + optional catalog update)

1. **Catalog row** → `Ravenstack/library/CATALOG.md`
2. **Pointer** → `Ravenstack/library/pointers/<slug>.md`
3. **Production note** → fortress template under domain path
4. **Trash recommendation** → list or operator-approved Drive trash

## Steps

1. Triage — skip / trash / pointer / distill
2. Extract — enough text to judge; chunk if large; no full copyrighted paste into vault
3. Decide depth — gold → distill; maybe → pointer; junk → trash recommend
4. Distill into template (paraphrase only): Principles, Frameworks, Tactics, Red flags, ReClaw applications, Sources
5. Write; prefer inbox if uncertain
6. Update catalog status
7. Stop — no whole-book RAG ingest

## Forbidden

- Full books or long verbatim chapters in the vault
- Live RAG writes without provenance
- Drive deletes outside policy
- Hustle PDFs as agent doctrine

## MCP note

Procedure + template. Other AIs: read this from vault, or future OpenClaw skill with Drive read + vault write. Grok path = quality today; MCP path = Corvid/Scribe autonomy later.
