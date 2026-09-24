/**
 * Pure locomotion and facing utility functions for RavenStack Keep.
 */

export type Facing = "up" | "down" | "left" | "right";

export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Normalizes directional input (-1, 0, or 1 for x and y) and multiplies by walk speed.
 * Ensures diagonal movement is normalized so speed is identical to cardinal movement.
 */
export function calculateVelocity(
  inputX: number,
  inputY: number,
  speed: number,
): Vector2 {
  if (inputX === 0 && inputY === 0) {
    return { x: 0, y: 0 };
  }
  const len = Math.sqrt(inputX * inputX + inputY * inputY);
  return {
    x: (inputX / len) * speed,
    y: (inputY / len) * speed,
  };
}

/**
 * Determines facing direction from velocity components.
 * Prioritizes horizontal or vertical facing depending on dominant velocity, preserving last facing if stationary.
 */
export function determineFacing(
  vx: number,
  vy: number,
  currentFacing: Facing,
): Facing {
  if (vx === 0 && vy === 0) {
    return currentFacing;
  }
  if (Math.abs(vx) >= Math.abs(vy)) {
    return vx < 0 ? "left" : "right";
  }
  return vy < 0 ? "up" : "down";
}

/**
 * Calculates interaction point in front of player based on facing direction and radius.
 */
export function getInteractionPoint(
  px: number,
  py: number,
  facing: Facing,
  distance = 32,
): Vector2 {
  switch (facing) {
    case "up":
      return { x: px, y: py - distance };
    case "down":
      return { x: px, y: py + distance };
    case "left":
      return { x: px - distance, y: py };
    case "right":
      return { x: px + distance, y: py };
  }
}

/**
 * Checks if target (x, y) is within interaction distance AND in front of player (facing cone).
 */
export function isFacingTarget(
  px: number,
  py: number,
  facing: Facing,
  tx: number,
  ty: number,
  maxDistance: number,
  maxAngleDeg = 90,
): boolean {
  const dx = tx - px;
  const dy = ty - py;
  const distSq = dx * dx + dy * dy;
  if (distSq > maxDistance * maxDistance) {
    return false;
  }

  // Determine required facing towards target
  let primaryFacing: Facing;
  if (Math.abs(dx) >= Math.abs(dy)) {
    primaryFacing = dx < 0 ? "left" : "right";
  } else {
    primaryFacing = dy < 0 ? "up" : "down";
  }

  if (facing === primaryFacing) {
    return true;
  }

  // Allow secondary adjacent facing if within half angle
  if (distSq === 0) return true;

  let fx = 0;
  let fy = 0;
  if (facing === "left") fx = -1;
  else if (facing === "right") fx = 1;
  else if (facing === "up") fy = -1;
  else if (facing === "down") fy = 1;

  // PERF: use squared distance to avoid Math.sqrt in game loop
  const dp = dx * fx + dy * fy;
  const minDot = Math.cos((maxAngleDeg * Math.PI) / 180 / 2);
  return dp >= 0 && dp * dp >= distSq * (minDot * minDot);
}
