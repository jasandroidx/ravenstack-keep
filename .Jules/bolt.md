## 2024-10-24 - Avoiding Math.hypot in Game Loops
**Learning:** `Math.hypot` can be a measurable performance bottleneck for distance calculations inside a game loop (like the Phaser game loop in `ui-v2`).
**Action:** Prefer squared distance calculations (`dx*dx + dy*dy`) when comparing against a threshold (square the threshold as well). If true distance is absolutely necessary, use `Math.sqrt(dx*dx + dy*dy)`.

## 2026-09-02 - Avoid Math.sqrt in isFacingTarget game loop
**Learning:** `Math.sqrt` used to calculate normalized dot products in directional cone checks (like `isFacingTarget`) can be avoided in high-frequency game loops when comparing against non-negative cosines.
**Action:** Use squared distance comparisons (`dp >= 0 && dp * dp >= distSq * (minDot * minDot)`) instead of computing `dist = Math.sqrt(distSq)` and `dot = dp / dist`.

## 2025-03-01 - Prevent Input Lag in React Chat UIs via React.memo
**Learning:** In chat interfaces like `mechanic-workbench.tsx`, having uncontrolled or frequently updating input state (like typing into a textarea) co-located with a large list mapping can cause the entire message history to re-render on every keystroke, introducing severe input lag as the chat history grows.
**Action:** When implementing message feeds or logs alongside user input, extract the complex message rendering logic into a separate `MessageItem` component and wrap it in `React.memo()`. This ensures that individual log lines are only re-rendered if their props actually change, keeping typing responsive.
