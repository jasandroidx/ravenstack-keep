import test from "node:test";
import assert from "node:assert";
import { LYRA, LYRA_CHOICES, LYRA_LINES, LYRA_PERSONA, lyraStageIndex, lyraStageSrc } from "./lyra.ts";

test("lyra stages are data-driven and clamp", () => {
  assert.equal(lyraStageSrc(undefined), "/hall/portraits/lyra.jpg");
  assert.equal(lyraStageIndex(5), LYRA.stages.length - 1);
  assert.equal(lyraStageIndex(-1), 0);
  assert.equal(lyraStageIndex("nope"), 0);
  assert.equal(lyraStageSrc(1, ["/a.jpg", "/b.jpg"]), "/b.jpg");
  assert.equal(lyraStageSrc("1", ["/a.jpg", "/b.jpg"]), "/b.jpg");
});

test("lyra content: enough canned lines, choices, kitchen persona", () => {
  assert.ok(LYRA.age >= 18);
  assert.ok(LYRA_LINES.length >= 6);
  assert.ok(LYRA_CHOICES.length >= 2);
  for (const c of LYRA_CHOICES) assert.ok(c.replies.length >= 1);
  assert.match(LYRA_PERSONA, /27/);
  assert.match(LYRA_PERSONA, /Kitchen/);
});
