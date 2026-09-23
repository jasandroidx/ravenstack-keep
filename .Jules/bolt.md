## 2024-10-24 - Avoiding Math.hypot in Game Loops
**Learning:** `Math.hypot` can be a measurable performance bottleneck for distance calculations inside a game loop (like the Phaser game loop in `ui-v2`).
**Action:** Prefer squared distance calculations (`dx*dx + dy*dy`) when comparing against a threshold (square the threshold as well). If true distance is absolutely necessary, use `Math.sqrt(dx*dx + dy*dy)`.

## 2024-05-18 - Math.sqrt in hot paths
**Learning:** Found usage of Math.sqrt in high-frequency game loops (ui-v2/src/lib/hall/locomotion.ts).
**Action:** Replace `Math.sqrt` with squared distance comparisons where possible to avoid the heavy math operation in hot loops.
