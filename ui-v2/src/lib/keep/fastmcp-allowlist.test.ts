import test from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_READONLY_TOOLS,
  assertToolAllowlist,
  stripConfirm,
  isReadonlyTool,
} from "./fastmcp.ts";

test("s1-lock-doors read-only allowlist", async (t) => {
  await t.test("every readonly tool passes the allowlist", () => {
    for (const tool of KEEP_READONLY_TOOLS) {
      const verdict = assertToolAllowlist(tool);
      assert.equal(verdict.allowed, true, `${tool} should be allowed`);
      assert.equal(verdict.tool, tool);
    }
  });

  await t.test("county audit + oracle verification are refused", () => {
    for (const tool of ["audit_county_budget", "oracle_verify"]) {
      const verdict = assertToolAllowlist(tool);
      assert.equal(verdict.allowed, false, `${tool} must be refused`);
      assert.equal(verdict.tool, tool);
    }
  });

  await t.test("human-gate and write tools are refused, even though they exist on the bridge", () => {
    for (const tool of [
      "county_queue_approve",
      "county_queue_reject",
      "session_approve_capability",
      "oracle_query",
      "query_knowledge",
      "pending_gates",
    ]) {
      const verdict = assertToolAllowlist(tool);
      assert.equal(verdict.allowed, false, `${tool} must be refused by the proxy`);
    }
  });

  await t.test("tools that do not even exist in the proxy union are refused", () => {
    for (const tool of ["write_repo_file", "service_restart", "docker restart", "arbitrary_tool"]) {
      const verdict = assertToolAllowlist(tool);
      assert.equal(verdict.allowed, false, `${tool} must be refused`);
      assert.equal(isReadonlyTool(tool), false);
    }
  });

  await t.test("stripConfirm removes confirm even for allowed tools", () => {
    const params = { tool: "get_castle_map" as const, args: { confirm: true, deep: 2 } };
    const stripped = stripConfirm(params.args);
    assert.deepEqual(stripped, { deep: 2 });
    assert.equal("confirm" in stripped, false);
  });

  await t.test("stripConfirm passes through params without confirm", () => {
    assert.deepEqual(stripConfirm({ a: 1, b: "two" }), { a: 1, b: "two" });
    assert.deepEqual(stripConfirm({}), {});
  });
});