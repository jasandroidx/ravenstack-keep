## 2024-09-10 - Custom Interactive Badges Accessibility
**Learning:** This codebase frequently uses custom styled `div` elements instead of standard `<button>` tags for interactive UI badges, which breaks native keyboard navigation and focus management.
**Action:** When adding or modifying interactive custom elements (like `div` or `span` with `onClick` handlers), ensure they are made keyboard accessible by adding `role="button"`, `tabIndex={0}`, an `onKeyDown` handler to trigger the click action with 'Enter' or 'Space' keys, and `focus-visible` utility classes for visible focus states.

## 2023-10-27 - Icon-only buttons accessibility
**Learning:** Found several icon-only buttons (like directional arrows in a D-Pad, Close file detail window, and poll once buttons) that were missing accessible labels. Screen reader users would have no context for what these buttons do.
**Action:** Always verify buttons containing only emojis/icons or SVG icons have `aria-label`s describing their action (e.g., "Close file details", "Move Up").

## 2024-05-15 - [Add focus-visible styles for keyboard navigation]
**Learning:** Found that our buttons in ui-v2 do not have clear `focus-visible` styles which hurts keyboard accessibility.
**Action:** Adding explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` (or similar) to common buttons to improve accessibility when navigating via keyboard.
