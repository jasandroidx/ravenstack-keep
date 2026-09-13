## 2024-09-10 - Custom Interactive Badges Accessibility
**Learning:** This codebase frequently uses custom styled `div` elements instead of standard `<button>` tags for interactive UI badges, which breaks native keyboard navigation and focus management.
**Action:** When adding or modifying interactive custom elements (like `div` or `span` with `onClick` handlers), ensure they are made keyboard accessible by adding `role="button"`, `tabIndex={0}`, an `onKeyDown` handler to trigger the click action with 'Enter' or 'Space' keys, and `focus-visible` utility classes for visible focus states.
