## 2024-09-09 - Custom Badge Interactive Elements Accessibility
**Learning:** This app heavily uses custom div elements instead of standard buttons for badges (like FastMCPStatusBadge) to match its 16-bit cyber aesthetic. These custom "buttons" frequently miss explicit a11y attributes.
**Action:** When working on interactive badges or stylized UI components in this app, always verify and explicitly implement keyboard accessibility (role, tabIndex, onKeyDown) and focus-visible styling.
