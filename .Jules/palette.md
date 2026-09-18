## 2024-10-24 - Interactive List Items Accessibility
**Learning:** File list items in `DriveExplorer` (and similar interactive components) were built using generic `div` elements with `onClick` handlers. Because they did not have semantic roles or keyboard support, screen readers could not identify them as interactive, and keyboard users could not activate them via Tab or Enter/Space.
**Action:** When converting generic `div` or `span` elements to interactive buttons (to maintain 16-bit styling), always explicitly add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler that triggers on "Enter" and "Space", and `focus-visible` outline styling.

## 2024-10-24 - Interactive Badge Accessibility
**Learning:** Custom styled interactive UI elements, like the `FastMCPStatusBadge` built with generic `div` elements and `onClick` handlers, were missing keyboard accessibility and ARIA roles. While they match the 16-bit cyber aesthetic visually, they exclude keyboard and screen reader users from accessing interactive probes/functionality.
**Action:** Consistently ensure all custom interactive elements include `role="button"`, `tabIndex={0}`, `onKeyDown` listeners for Enter/Space, and explicit `focus-visible` ring styling to maintain accessibility without sacrificing visual design.
