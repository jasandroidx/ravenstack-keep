## 2024-05-15 - [Add focus-visible styles for keyboard navigation]
**Learning:** Found that our buttons in ui-v2 do not have clear `focus-visible` styles which hurts keyboard accessibility.
**Action:** Adding explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` (or similar) to common buttons to improve accessibility when navigating via keyboard.
