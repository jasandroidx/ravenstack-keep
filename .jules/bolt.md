## 2025-02-14 - Search Query Debouncing
**Learning:** In React implementations, immediately triggering network requests on every keystroke in a search field leads to rapid API exhaustion, especially in components like GoogleDriveExplorer which can hit strict Google API rate limits quickly.
**Action:** Use a setTimeout-based debouncing strategy with a useEffect hook linked to the searchQuery state. Store a debouncedSearchQuery that only updates after typing pauses (e.g., 300ms delay) and execute API calls bound to the debounced state instead of the raw input.
