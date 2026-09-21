import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateVelocity,
  determineFacing,
  getInteractionPoint,
  isFacingTarget,
} from "./locomotion.ts";

describe("Locomotion & Facing Logic", () => {
  it("normalizes diagonal movement speed to match cardinal speed", () => {
    const speed = 180;
    const cardinal = calculateVelocity(1, 0, speed);
    const diagonal = calculateVelocity(1, 1, speed);

    assert.equal(cardinal.x, 180);
    assert.equal(cardinal.y, 0);

    const diagSpeed = Math.sqrt(diagonal.x * diagonal.x + diagonal.y * diagonal.y);
    assert.ok(Math.abs(diagSpeed - speed) < 0.001);
  });

  it("returns zero velocity for zero input", () => {
    const vel = calculateVelocity(0, 0, 180);
    assert.equal(vel.x, 0);
    assert.equal(vel.y, 0);
  });

  it("determines facing direction correctly and preserves last facing when stopped", () => {
    assert.equal(determineFacing(-1, 0, "down"), "left");
    assert.equal(determineFacing(1, 0, "left"), "right");
    assert.equal(determineFacing(0, -1, "right"), "up");
    assert.equal(determineFacing(0, 1, "up"), "down");
    assert.equal(determineFacing(0, 0, "up"), "up");
  });

  it("calculates interaction point in front of player", () => {
    const ptUp = getInteractionPoint(100, 100, "up", 32);
    assert.deepEqual(ptUp, { x: 100, y: 68 });

    const ptRight = getInteractionPoint(100, 100, "right", 32);
    assert.deepEqual(ptRight, { x: 132, y: 100 });
  });

  it("checks if player is facing interaction target within range", () => {
    const px = 100;
    const py = 100;

    // Target to the right (x: 120, y: 100)
    assert.equal(isFacingTarget(px, py, "right", 120, 100, 40), true);
    assert.equal(isFacingTarget(px, py, "left", 120, 100, 40), false);
    assert.equal(isFacingTarget(px, py, "up", 120, 100, 40), false);

    // Target out of range (distance 100 > maxDistance 40)
    assert.equal(isFacingTarget(px, py, "right", 200, 100, 40), false);
  });
});
