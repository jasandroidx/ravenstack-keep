## 2024-10-24 - Avoiding Math.hypot in Game Loops
**Learning:** `Math.hypot` can be a measurable performance bottleneck for distance calculations inside a game loop (like the Phaser game loop in `ui-v2`).
**Action:** Prefer squared distance calculations (`dx*dx + dy*dy`) when comparing against a threshold (square the threshold as well). If true distance is absolutely necessary, use `Math.sqrt(dx*dx + dy*dy)`.

## 2026-09-02 - Avoid Math.sqrt in isFacingTarget game loop
**Learning:** `Math.sqrt` used to calculate normalized dot products in directional cone checks (like `isFacingTarget`) can be avoided in high-frequency game loops when comparing against non-negative cosines.
**Action:** Use squared distance comparisons (`dp >= 0 && dp * dp >= distSq * (minDot * minDot)`) instead of computing `dist = Math.sqrt(distSq)` and `dot = dp / dist`.
