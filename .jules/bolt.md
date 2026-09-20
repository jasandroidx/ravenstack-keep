## 2026-09-21 - Phaser Distance Calculation & Speed Normalization
**Learning:** In `ui-v2` Phaser game loops (`update`), avoid using `Math.hypot` for distance comparisons and vector normalization in high-frequency frame ticks as it creates a measurable performance bottleneck. Instead, use pure vector normalization (`dx / Math.sqrt(...)`) and squared distance checks (`dx*dx + dy*dy < radius*radius`).
**Action:** Apply pure vector normalization in `ui-v2/src/lib/hall/locomotion.ts` and scene update loops to ensure 60fps performance without subpixel camera/movement jitter.
