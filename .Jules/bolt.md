
## 2024-09-20 - Optimize Math.hypot in Phaser Game Loops
**Learning:** `Math.hypot` creates a measurable performance bottleneck in Phaser game loops (like in `ui-v2/src/lib/hall/scene.ts`).
**Action:** When calculating distances frequently, prefer `Math.sqrt(dx*dx + dy*dy)`. For simple distance threshold comparisons (e.g., checking if an entity is within a radius), use squared distances (`dx*dx + dy*dy < radius * radius`) to avoid the square root entirely.
