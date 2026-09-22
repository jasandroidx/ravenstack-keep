## 2024-10-24 - Interactive List Items Accessibility
**Learning:** File list items in `DriveExplorer` (and similar interactive components) were built using generic `div` elements with `onClick` handlers. Because they did not have semantic roles or keyboard support, screen readers could not identify them as interactive, and keyboard users could not activate them via Tab or Enter/Space.
**Action:** When converting generic `div` or `span` elements to interactive buttons (to maintain 16-bit styling), always explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler that triggers on "Enter" and "Space", and `focus-visible` outline styling.

## 2024-05-15 - [Add focus-visible styles for keyboard navigation]
**Learning:** Found that our buttons in ui-v2 do not have clear `focus-visible` styles which hurts keyboard accessibility.
**Action:** Adding explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` (or similar) to common buttons to improve accessibility when navigating via keyboard.
## 2024-05-16 - File Upload Dropzone Accessibility
**Learning:** Found that custom file upload drag-and-drop zones built with generic `div` elements and an `onClick` handler (to proxy the hidden file input) lacked keyboard support, preventing keyboard users from initiating an upload.
**Action:** When implementing custom upload dropzones, explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler (for "Enter" and " "), and `focus-visible` outline styling to the clickable container element.
## 2025-02-15 - ARIA Labels on Minimal UI Elements
**Learning:** Screen readers often announce "✕" character as "multiplication X". In minimal UIs that rely heavily on bare unicode characters for actions like closing panels or modals, this creates significant confusion for visually impaired users.
**Action:** When adding or reviewing simple unicode buttons (like "✕"), always explicitly bind an `aria-label` attribute (e.g., `aria-label="Close"`) to ensure meaningful announcements.
