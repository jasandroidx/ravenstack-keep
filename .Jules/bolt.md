## 2024-10-24 - Avoiding Math.hypot in Game Loops
**Learning:** `Math.hypot` can be a measurable performance bottleneck for distance calculations inside a game loop (like the Phaser game loop in `ui-v2`).
**Action:** Prefer squared distance calculations (`dx*dx + dy*dy`) when comparing against a threshold (square the threshold as well). If true distance is absolutely necessary, use `Math.sqrt(dx*dx + dy*dy)`.

## 2024-10-24 - Avoiding Math.sqrt in Dot Product Comparisons
**Learning:** `Math.sqrt` can be avoided when comparing the cosine of an angle (like a dot product) against a threshold. Instead of calculating `dot = (dx*fx + dy*fy) / Math.sqrt(distSq)`, you can check if `(dx*fx + dy*fy) >= 0` and then compare squared values: `dp*dp >= distSq * (minDot*minDot)`. This is especially useful in high-frequency game loops or physics checks (e.g. cone of vision).
**Action:** When comparing dot products or normalized distances against a threshold, see if you can square both sides of the inequality to remove the `Math.sqrt` requirement.
