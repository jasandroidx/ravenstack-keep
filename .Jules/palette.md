## 2024-10-24 - Interactive List Items Accessibility
**Learning:** File list items in `DriveExplorer` (and similar interactive components) were built using generic `div` elements with `onClick` handlers. Because they did not have semantic roles or keyboard support, screen readers could not identify them as interactive, and keyboard users could not activate them via Tab or Enter/Space.
**Action:** When converting generic `div` or `span` elements to interactive buttons (to maintain 16-bit styling), always explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler that triggers on "Enter" and "Space", and `focus-visible` outline styling.

## 2024-05-15 - [Add focus-visible styles for keyboard navigation]
**Learning:** Found that our buttons in ui-v2 do not have clear `focus-visible` styles which hurts keyboard accessibility.
**Action:** Adding explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` (or similar) to common buttons to improve accessibility when navigating via keyboard.
## 2024-05-16 - File Upload Dropzone Accessibility
**Learning:** Found that custom file upload drag-and-drop zones built with generic `div` elements and an `onClick` handler (to proxy the hidden file input) lacked keyboard support, preventing keyboard users from initiating an upload.
**Action:** When implementing custom upload dropzones, explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler (for "Enter" and " "), and `focus-visible` outline styling to the clickable container element.

## 2026-09-25 - ARIA Labels on Icon-Only Buttons
**Learning:** Found a pattern across the `ui-v2` codebase where icon-only buttons (like `✕` for close actions or `🔄` for refresh) lacked explicit `aria-label` attributes. While they might have visual meaning or `title` attributes, they lack proper accessibility for screen readers.
**Action:** Always verify that icon-only buttons have descriptive `aria-label` attributes (e.g., `aria-label="Close"` or `aria-label="Poll logs once"`) to ensure they are fully accessible to screen readers, instead of relying solely on tooltips or generic icons.
