## 2026-09-12 - Debounce API Calls in Drive Explorer
**Learning:** Google Drive search inputs in the UI were making an API request on every keystroke because the dependency array on `loadDriveData` triggered immediate refetches via the `useEffect`. This caused unnecessary network load, stuttering input, and potential rate-limiting.
**Action:** Implemented a generic `useDebounce` hook and applied it to `searchQuery` in `drive-explorer.tsx` to delay the fetch until typing pauses.
## 2026-09-13 - SQL Aggregations for Keep Telemetry Occupancy Summary

**Learning:** Hydrating entire database rows into Python objects (`_row_room`) and manually iterating over them in Python to compute simple aggregations (like counting rooms by status or lock state) introduces severe CPU and memory allocation overhead. SQLite native `GROUP BY` and `COUNT(*)` aggregations compute statistics directly in engine space.
**Action:** When computing summary metrics or table statistics in Keep MCP tools or FastAPI endpoints, always push count, status breakdown, and filtering queries into SQL aggregations (`SELECT status, COUNT(*) FROM rooms GROUP BY status`) instead of fetching all records into memory.
