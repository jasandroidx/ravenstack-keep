## 2026-09-12 - Debounce API Calls in Drive Explorer
**Learning:** Google Drive search inputs in the UI were making an API request on every keystroke because the dependency array on `loadDriveData` triggered immediate refetches via the `useEffect`. This caused unnecessary network load, stuttering input, and potential rate-limiting.
**Action:** Implemented a generic `useDebounce` hook and applied it to `searchQuery` in `drive-explorer.tsx` to delay the fetch until typing pauses.
