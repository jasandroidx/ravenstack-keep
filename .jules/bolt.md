## 2026-09-13 - SQL Aggregations for Keep Telemetry Occupancy Summary

**Learning:** Hydrating entire database rows into Python objects (`_row_room`) and manually iterating over them in Python to compute simple aggregations (like counting rooms by status or lock state) introduces severe CPU and memory allocation overhead. SQLite native `GROUP BY` and `COUNT(*)` aggregations compute statistics directly in engine space.
**Action:** When computing summary metrics or table statistics in Keep MCP tools or FastAPI endpoints, always push count, status breakdown, and filtering queries into SQL aggregations (`SELECT status, COUNT(*) FROM rooms GROUP BY status`) instead of fetching all records into memory.

## 2026-10-24 - Phaser Distance Calculation Bottleneck

**Learning:** `Math.hypot` creates a measurable performance bottleneck when used repeatedly in Phaser game loops (like pointer down events or update loops). It is significantly slower than doing a squared distance comparison (`dx*dx + dy*dy`) or using `Math.sqrt` due to how it internally handles variadic arguments and overflow prevention.
**Action:** When calculating distances in high-frequency update loops or input handlers within `ui-v2` Phaser scenes, prefer squared distance comparisons (`dx*dx + dy*dy < threshold*threshold`) or `Math.sqrt` instead of `Math.hypot`.
