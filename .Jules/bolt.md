## 2024-10-24 - Avoiding Math.hypot in Game Loops
**Learning:** `Math.hypot` can be a measurable performance bottleneck for distance calculations inside a game loop (like the Phaser game loop in `ui-v2`).
**Action:** Prefer squared distance calculations (`dx*dx + dy*dy`) when comparing against a threshold (square the threshold as well). If true distance is absolutely necessary, use `Math.sqrt(dx*dx + dy*dy)`.
