## 2023-10-27 - Icon-only buttons accessibility
**Learning:** Found several icon-only buttons (like directional arrows in a D-Pad, Close file detail window, and poll once buttons) that were missing accessible labels. Screen reader users would have no context for what these buttons do.
**Action:** Always verify buttons containing only emojis/icons or SVG icons have `aria-label`s describing their action (e.g., "Close file details", "Move Up").
