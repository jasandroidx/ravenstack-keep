# Library duo — Oracle + Scribe

**Room:** `library`  
**Oracle:** read / RAG Q&A (no vault writes)  
**Scribe:** write / ebook distill (gated vault writes)

## Operator path: ebooks → RAG

1. Drop files under vault `Ravenstack/incoming/` (or path you name).
2. Open Keep → Library chamber → select **scribe**.
3. Pin order or tell Scribe the path; Scribe distills locally.
4. **Human gate** before any vault write.
5. Reindex RAG when notes land.
6. Select **oracle** → ask questions with citations.

## Specs

- `agents/oracle.agent-spec.json` → `room_id: library`
- `agents/scribe.agent-spec.json` → `room_id: library` (draft until approve)

## Gates

```
approve_spec({ agent_id: "scribe", confirm: true })
approve_spec({ agent_id: "oracle", confirm: true })  # if still draft
unlock_room({ room_id: "library", confirm: true })
```

## Map

`co_occupants: ["scribe"]` on library; primary occupant `oracle`.  
Roster shows both. Chamber has resident switcher.
