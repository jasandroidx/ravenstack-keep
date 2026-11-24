import test from "node:test";
import assert from "node:assert";
import { FLAGS_KEY, discover, getFlag, interactableAt, pickPrompt, resetFlagCache, setFlag, type Interactable } from "./interact.ts";
import { firefliesOut, phaseOf, torchesLit, washRGB } from "./clock.ts";

// Minimal localStorage for node.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const zones: Interactable[] = [
  { id: "a", kind: "sit", verb: "Sit", rect: { x: 0, y: 0, w: 100, h: 100 } },
  { id: "night", kind: "gaze", verb: "Gaze", when: "night", rect: { x: 0, y: 0, w: 100, h: 100 }, priority: 25 },
  { id: "locked", kind: "open", verb: "Open", requires: ["found:key"], rect: { x: 0, y: 0, w: 100, h: 100 }, priority: 26 },
];

test("prompt priority: door > npc > object > table, ties by distance", () => {
  const p = pickPrompt([
    { kind: "table", verb: "t", dSq: 0 },
    { kind: "object", verb: "o", dSq: 5 },
    { kind: "npc", verb: "n", dSq: 900 },
  ]);
  assert.equal(p?.kind, "npc");
  assert.equal(pickPrompt([{ kind: "object", verb: "far", dSq: 50 }, { kind: "object", verb: "near", dSq: 1 }])?.verb, "near");
  assert.equal(pickPrompt([null, undefined]), null);
});

test("zones filter by night, flags and cooldown", () => {
  const ctx = { flags: {}, now: 0, isNight: false };
  assert.equal(interactableAt(zones, 50, 50, ctx)?.id, "a");
  assert.equal(interactableAt(zones, 50, 50, { ...ctx, isNight: true })?.id, "night");
  assert.equal(interactableAt(zones, 50, 50, { ...ctx, flags: { "found:key": true } })?.id, "locked");
  assert.equal(interactableAt(zones, 150, 50, ctx), null);
  const cd = [{ ...zones[0], cooldownMs: 1000 }];
  assert.equal(interactableAt(cd, 50, 50, { ...ctx, now: 10, cooldowns: { a: 500 } }), null);
});

test("flags persist in one versioned key; discover fires once", () => {
  mem.clear(); resetFlagCache();
  setFlag("sat:throne", true);
  assert.ok(JSON.parse(mem.get(FLAGS_KEY) ?? "{}")["sat:throne"]);
  resetFlagCache();
  assert.equal(getFlag("sat:throne"), true);
  assert.equal(discover("shelf"), true);
  assert.equal(discover("shelf"), false);
  mem.set(FLAGS_KEY, "not json"); resetFlagCache();
  assert.equal(getFlag("sat:throne"), undefined);
});

test("clock bands: torches at dusk, fireflies at night, wash darkens", () => {
  assert.equal(phaseOf(12), "day");
  assert.equal(phaseOf(19), "dusk");
  assert.equal(phaseOf(23), "night");
  assert.equal(phaseOf(6), "dawn");
  assert.ok(torchesLit(18.5) && !torchesLit(12));
  assert.ok(firefliesOut(23) && !firefliesOut(19));
  const noon = washRGB(12).reduce((a, b) => a + b);
  const midnight = washRGB(0).reduce((a, b) => a + b);
  assert.ok(midnight < noon * 0.6);
});
