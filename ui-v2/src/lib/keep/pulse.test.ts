import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The paper fallback is allowed to exist. It is not allowed to assert anything
 * it did not observe — occupancy, service health and queue state all used to be
 * hardcoded in it, and every one of them read as current from the Hall.
 */
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "src/lib/keep/pulse.fixture.json"),
    "utf-8",
  ),
);

const pulseSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/keep/pulse.ts"),
  "utf-8",
);

test("the paper fixture claims no occupancy", () => {
  assert.deepEqual(
    fixture.rooms,
    [],
    "a paper snapshot knows of no rooms or occupants",
  );
  assert.equal(
    fixture.agentsActive,
    null,
    "a count it never read must be null, not 0",
  );
});

test("the paper fixture claims no service health", () => {
  for (const [name, value] of Object.entries(fixture.services)) {
    assert.equal(
      value,
      "unknown",
      `${name} must not be asserted healthy from a paper snapshot`,
    );
  }
  assert.equal(fixture.network, "unknown");
  assert.equal(fixture.queue.status, "unknown");
});

test("the paper fixture still names itself paper and dates itself", () => {
  assert.equal(fixture.source, "paper");
  assert.match(fixture.note, /KEEP_PULSE_URL/);
  assert.equal(Number.isNaN(Date.parse(fixture.asOf)), false);
});

test("a field the box omits is never parsed as healthy or as zero", () => {
  // "ok" remains legitimate only for a boolean the box actually sent
  // (`v ? "ok" : "down"`); it must not be the fallback argument.
  assert.equal(
    /^\s*"ok",?$/m.test(pulseSource),
    false,
    "no service may default to ok",
  );
  assert.equal(pulseSource.includes('o.network ?? "CONNECTED"'), false);
  assert.equal(
    pulseSource.includes('"idle"'),
    false,
    "an unread queue is not idle",
  );
  assert.match(pulseSource, /agentsActive: number \| null/);
});
