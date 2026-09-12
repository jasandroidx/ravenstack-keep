## 2026-09-12 - Added Keyboard Accessibility to UI Badges
**Learning:** The codebase frequently uses custom styled `div` elements instead of standard buttons for UI badges to match a 16-bit cyber aesthetic. These interactive elements lack native keyboard accessibility.
**Action:** When modifying these interactive elements, ensure keyboard accessibility by explicitly adding `role="button"`, `tabIndex={0}`, `onKeyDown` handlers (for Space/Enter), and `focus-visible` styling (`focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2de2e6]`).
