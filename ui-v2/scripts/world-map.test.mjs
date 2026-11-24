import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { OUTPUT_PATH, renderWorldMap } from "./world-map.mjs";

/**
 * A blueprint that is not regenerated is worse than no blueprint: it reads as
 * authoritative while describing a Keep that no longer exists. This is the
 * ratchet — edit a floor, a door or an occupant and the committed SVG has to be
 * rebuilt in the same change.
 */
test("docs/keep/map.svg is current", () => {
  const expected = renderWorldMap();
  const actual = fs.existsSync(OUTPUT_PATH)
    ? fs.readFileSync(OUTPUT_PATH, "utf-8")
    : "";
  assert.notEqual(actual, "", "docs/keep/map.svg is missing");
  assert.equal(
    actual,
    expected,
    "docs/keep/map.svg is stale — run `npm run world:map` from ui-v2/",
  );
});

test("the map is deterministic", () => {
  assert.equal(renderWorldMap(), renderWorldMap());
});
