## 2024-10-24 - Interactive List Items Accessibility
**Learning:** File list items in `DriveExplorer` (and similar interactive components) were built using generic `div` elements with `onClick` handlers. Because they did not have semantic roles or keyboard support, screen readers could not identify them as interactive, and keyboard users could not activate them via Tab or Enter/Space.
**Action:** When converting generic `div` or `span` elements to interactive buttons (to maintain 16-bit styling), always explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler that triggers on "Enter" and "Space", and `focus-visible` outline styling.

## 2024-05-15 - [Add focus-visible styles for keyboard navigation]
**Learning:** Found that our buttons in ui-v2 do not have clear `focus-visible` styles which hurts keyboard accessibility.
**Action:** Adding explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` (or similar) to common buttons to improve accessibility when navigating via keyboard.