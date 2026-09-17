## 2026-09-13 - SQL Aggregations for Keep Telemetry Occupancy Summary

**Learning:** Hydrating entire database rows into Python objects (`_row_room`) and manually iterating over them in Python to compute simple aggregations (like counting rooms by status or lock state) introduces severe CPU and memory allocation overhead. SQLite native `GROUP BY` and `COUNT(*)` aggregations compute statistics directly in engine space.
**Action:** When computing summary metrics or table statistics in Keep MCP tools or FastAPI endpoints, always push count, status breakdown, and filtering queries into SQL aggregations (`SELECT status, COUNT(*) FROM rooms GROUP BY status`) instead of fetching all records into memory.
## 2024-10-24 - Rate-limit rapid state updates tied to data fetching
**Learning:** In the Google Drive Explorer component, typing in the search bar caused an immediate API call (`listDriveFiles`) for every keystroke because the raw `searchQuery` state was tied to the `loadDriveData` dependency array. This can result in excessive network requests and UI lag due to the rapid state updates.
**Action:** A custom `useDebounce` hook (e.g. 300ms delay) should be applied to text input states that trigger network operations. Tie data fetching hooks and dependency arrays to the `debounced` value instead of the raw input state to improve performance and avoid hitting rate limits.
