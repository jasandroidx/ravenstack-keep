## 2026-09-13 - SQL Aggregations for Keep Telemetry Occupancy Summary

**Learning:** Hydrating entire database rows into Python objects (`_row_room`) and manually iterating over them in Python to compute simple aggregations (like counting rooms by status or lock state) introduces severe CPU and memory allocation overhead. SQLite native `GROUP BY` and `COUNT(*)` aggregations compute statistics directly in engine space.
**Action:** When computing summary metrics or table statistics in Keep MCP tools or FastAPI endpoints, always push count, status breakdown, and filtering queries into SQL aggregations (`SELECT status, COUNT(*) FROM rooms GROUP BY status`) instead of fetching all records into memory.
## 2026-09-16 - Debounce Search Inputs in React

**Learning:** When driving expensive or network-bound operations (like fetching Drive files or triggering complex filtering) from a text input, using raw state changes causes multiple redundant calls for every keystroke. Using a debounced version of the search query prevents excessive network requests and UI lockups.
**Action:** Always wrap search input queries that trigger expensive side effects in a debounced value using `useDebounce` hook (typically 300-500ms delay) before passing it to dependencies of `useEffect` or `useCallback` that fetch data.
