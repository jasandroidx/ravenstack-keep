## 2026-09-13 - SQL Aggregations for Keep Telemetry Occupancy Summary

**Learning:** Hydrating entire database rows into Python objects (`_row_room`) and manually iterating over them in Python to compute simple aggregations (like counting rooms by status or lock state) introduces severe CPU and memory allocation overhead. SQLite native `GROUP BY` and `COUNT(*)` aggregations compute statistics directly in engine space.
**Action:** When computing summary metrics or table statistics in Keep MCP tools or FastAPI endpoints, always push count, status breakdown, and filtering queries into SQL aggregations (`SELECT status, COUNT(*) FROM rooms GROUP BY status`) instead of fetching all records into memory.

## 2024-05-14 - Phaser Math.hypot Bottleneck
**Learning:** `Math.hypot` carries significant overhead in JavaScript engines because it implements checks for underflow, overflow, and precision loss handling. In the `ui-v2` Phaser game loop, calculating distance via `Math.hypot` inside frequent operations like `update()` loops or `npcNear` range scanning introduced measurable latency.
**Action:** Always replace `Math.hypot(dx, dy)` with `Math.sqrt(dx * dx + dy * dy)`. Better yet, for range checking (like collision or proximity), omit the square root entirely and compare against the squared distance limits (`dx * dx + dy * dy < radius * radius`).
