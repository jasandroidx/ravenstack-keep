# RavenStack Keep — Player Locomotion Architecture

This document describes the mechanics, configuration, collision system, camera behavior, and pixel-art rendering rules for player movement in RavenStack Keep (`ui-v2`).

---

## 1. Input Controls & Controls Scheme

- **Keyboard:**
  - `W`, `A`, `S`, `D` or `Arrow Keys` for 4-directional and diagonal movement.
  - `[E]` or `[Space]` to interact with adjacent AI agents or the War Table.
  - `[ESC]` to close open modals/panels.
- **Touch / Mobile:**
  - On-screen touch D-pad overlay in `KeepHall`.
- **Mouse / Click-to-move:**
  - Click anywhere on walkable terrain to move to destination reticle.

---

## 2. Locomotion & Tuning Values

Player movement is handled in `ui-v2/src/lib/hall/scene.ts` and pure locomotion math in `ui-v2/src/lib/hall/locomotion.ts`.

- **Walk Speed:** `175 px/s`
- **Diagonal Normalization:** Diagonal velocity vectors are normalized (`vx = (inputX / len) * speed`), preventing diagonal speed boosts.
- **Inertia & Response:** Instant start and stop on key press/release (`0` sliding) for responsive top-down movement.
- **Facing Direction:** 4-way facing states (`up`, `down`, `left`, `right`). Preserved when stationary to maintain clean idle poses.

---

## 3. Collision System & Wall Sliding

- **Bounding Box / Foot Capsule:**
  - Dynamic physics body circle positioned at player's feet (`body.setCircle(10, 6, 20)`).
  - Walkable terrain (`WALK`) and Solid obstacles (`SOLID`) defined as exact geometric rectangles in `ui-v2/src/lib/hall/world.ts`.
- **Foot Probing & Wall Sliding:**
  - Independent X and Y axis probes (`probeMargin = 10px`) evaluate `walkable(x, y)` before updating velocity.
  - Sliding against solid objects occurs naturally when one movement axis is blocked while the other remains open.

---

## 4. Interaction Orientation & Cone

- **Facing-Based Interaction:**
  - Interacting with NPCs or the War Table requires the player to be within radius AND facing toward the target.
  - Evaluated via `isFacingTarget()` dot product cone calculations in `ui-v2/src/lib/hall/locomotion.ts`.

---

## 5. Camera Behavior

- **Follow Target:** Camera tracks the player sprite with slight smoothing (`lerp = 0.09`).
- **Pixel Snapping:** Camera pixel rounding enabled (`cameras.main.setRoundPixels(true)`) to prevent subpixel jittering or blur on pixel-art tiles.
- **Bounds:** World bounds set to `1792x1008` (`MAP_W` x `MAP_H`). Camera bounded strictly inside map bounds to prevent rendering unfinished void areas.

---

## 6. Pixel-Art Rules & Asset Pipeline

- **Grid Size:** 32x32 grid compatible.
- **Spritesheet Format:** 128x160 PNG (4x4 grid of 32x40 frame slices).
- **Row Index:**
  - Row 0 (frames 0–3): Walk Down
  - Row 1 (frames 4–7): Walk Left
  - Row 2 (frames 8–11): Walk Right
  - Row 3 (frames 12–15): Walk Up
- **Rendering:** Nearest-neighbor pixelated rendering (`imageRendering: pixelated`), no anti-aliasing.

---

## 7. Testing Locomotion Logic

To run automated locomotion unit tests:

```bash
cd ui-v2
pnpm test
```
