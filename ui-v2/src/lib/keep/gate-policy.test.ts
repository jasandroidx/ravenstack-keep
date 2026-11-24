import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  GATE_TOOLS,
  READ_ONLY_MCP_TOOLS,
  buildGateCall,
  refuseNonReadOnly,
} from "./gate-policy.ts";

test("buildGateCall refuses every tool that is not a gate decision", () => {
  for (const tool of READ_ONLY_MCP_TOOLS) {
    const call = buildGateCall(tool, { confirm: true }, true);
    assert.equal(call.ok, false, `${tool} must not be reachable as a gate decision`);
  }
  assert.equal(buildGateCall("delete_everything", { confirm: true }, true).ok, false);
});

test("buildGateCall refuses a gate decision without the operator's second press", () => {
  for (const tool of GATE_TOOLS) {
    // Only the strict boolean counts. A truthy string or number is a payload,
    // not a human pressing the button.
    for (const confirmed of [undefined, null, false, "true", 1, {}]) {
      const call = buildGateCall(tool, { session_id: "s1" }, confirmed);
      assert.equal(call.ok, false, `${tool} approved on confirmed=${String(confirmed)}`);
    }
  }
});

test("buildGateCall composes confirm itself and discards a client-supplied one", () => {
  const call = buildGateCall(
    "county_queue_approve",
    { session_id: "s1", confirm: false, cursor: 4 },
    true,
  );
  assert.equal(call.ok, true);
  if (!call.ok) return;
  assert.deepEqual(call.args, { session_id: "s1", cursor: 4, confirm: true });
});

test("buildGateCall tolerates missing args instead of crashing the decision", () => {
  const call = buildGateCall("county_queue_reject", undefined, true);
  assert.equal(call.ok, true);
  if (!call.ok) return;
  assert.deepEqual(call.args, { confirm: true });
});

test("the read-only allowlist and the gate tools never overlap", () => {
  const overlap = GATE_TOOLS.filter((t) => (READ_ONLY_MCP_TOOLS as readonly string[]).includes(t));
  assert.deepEqual(overlap, []);
});

test("refuseNonReadOnly passes reads and refuses writes through the passthrough", () => {
  for (const tool of READ_ONLY_MCP_TOOLS) {
    assert.equal(refuseNonReadOnly(tool), null, `${tool} should be callable`);
  }
  for (const tool of GATE_TOOLS) {
    assert.ok(refuseNonReadOnly(tool)?.includes("war table"), `${tool} must be refused`);
  }
  assert.ok(refuseNonReadOnly("rm_rf")?.includes("read-only allowlist"));
});

/** Read a source file the way the app ships it, for the wiring guards below. */
function source(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

function declarationOf(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} =`);
  assert.ok(start >= 0, `${name} is missing`);
  return src.slice(start, start + 700);
}

test("the bridge and gallery writers run behind authMiddleware", () => {
  const server = source("src/lib/keep/server.ts");
  for (const name of ["decideGate", "callFastMCP", "commissionPortrait"]) {
    assert.match(
      declarationOf(server, name),
      /\.middleware\(\[authMiddleware\]\)/,
      `${name} must reject signed-out callers before it can touch anything`,
    );
  }

  const gates = source("src/lib/keep/keep-gates.ts");
  assert.match(
    declarationOf(gates, "approveKeepGate"),
    /\.middleware\(\[authMiddleware\]\)/,
    "approveKeepGate must reject signed-out callers",
  );
});

test("a Keep gate is never approved on behalf of a caller who did not ask", () => {
  const gates = source("src/lib/keep/keep-gates.ts");
  const body = declarationOf(gates, "approveKeepGate");
  assert.match(body, /data\.confirmed/, "approveKeepGate must require an explicit confirmation");
  // The literal confirm: true is only legitimate once the guard above has run,
  // i.e. after `confirmed` has been checked; assert the check precedes it.
  const guard = body.indexOf("data.confirmed");
  const confirm = body.indexOf("confirm: true");
  assert.ok(guard >= 0 && confirm > guard, "confirm must be composed only after the operator check");
});

test("no server function attributes rows to a hardcoded dev user", () => {
  const server = source("src/lib/keep/server.ts");
  assert.equal(
    /["']dev-user["']/.test(server),
    false,
    "server.ts must use context.userId, not a literal dev user id",
  );
});
