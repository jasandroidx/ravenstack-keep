# Arcane Library Spatial Context Compactor

**Companion to Keep MCP spatial telemetry** (six rooms).  
**Primary zone:** Library `[1, 0]`.

## What it does

When agent/session context approaches **85% of token budget**:

1. Score context segments by **spatial relevance** to the current Keep room  
2. Select oldest / lowest-relevance ~**25%** of tokens  
3. Summarize (~4× target; Ollama if configured, else extractive)  
4. Archive original + summary + embedding in SQLite (`vector_memory.db`)  
5. Inject summary into active context  
6. Write Obsidian note into the **real** Ravenstack vault Graph  

## Spatial registry

| Room | Coords |
|------|--------|
| Great Hall | `[0, 0]` |
| Library | `[1, 0]` ← high-density knowledge |
| Alchemy Lab | `[1, 1]` |
| Armory | `[0, 1]` |
| Observatory | `[1, 2]` |
| Vault | `[-1, -1]` |

## MCP tools

| Tool | Purpose |
|------|---------|
| `trigger_spatial_compaction` | Run compaction for a room + context |
| `get_compaction_history` | Recent events |
| `query_spatial_memory` | Spatially biased vector search |

## HTTP (Keep UI)

| Route | Method |
|-------|--------|
| `/api/compact` | POST `{ room_name, current_token_count, max_tokens, context_snippet, force? }` |
| `/api/compact/history` | GET `?room_name=&limit=` |
| `/api/spatial-memory` | GET `?q=&room_name=&top_k=` |

## Phaser

`ui/src/ArcaneLibraryCompactorHook.ts` — chamber enter Library / token threshold emits `COMPACT_SPATIAL_CONTEXT`. Shell posts to `/api/compact`.

## Vault notes

Path pattern:

```
Ravenstack/keep/compactions/Arcane_Compaction_[Timestamp]_[Region].md
```

Frontmatter: `vector_id`, `token_density`, `spatial_coordinates`, `room`, `compaction_ratio`, `related_entities`.

## Env

| Variable | Default |
|----------|---------|
| `OBSIDIAN_VAULT` | `/root/obsidian_vault` |
| `KEEP_MCP_DATA` | `mcp/data` |
| `KEEP_COMPACTOR_DB` | `$KEEP_MCP_DATA/vector_memory.db` |
| `KEEP_OLLAMA_URL` | `http://127.0.0.1:11434` |
| `KEEP_EMBED_MODEL` | empty → hash embed |
| `KEEP_SUMMARIZE_MODEL` | empty → extractive |
| `KEEP_EMBED_DIM` | `384` |

## Local-first

- No paid models by default  
- Hash embeddings if Ollama embed model unset  
- Extractive summary if chat model unset  
- Optional `sqlite-vec` when installed; else JSON cosine  

## Test

```bash
cd mcp
# optional: pip install sqlite-vec
KEEP_MCP_DATA=./data OBSIDIAN_VAULT=/root/obsidian_vault \
  python -c "
from src.context_compactor import ArcaneCompactor
c = ArcaneCompactor()
ctx = 'Great Hall briefing.\\n\\n' + ('Library lore paragraph. ' * 80)
r = c.compact('library', 9000, 10000, ctx, force=True)
print(r['note_path'], r['vector_id'], r['compaction_ratio'])
print(c.query_spatial_memory('library lore', 'library', 3))
"
```
