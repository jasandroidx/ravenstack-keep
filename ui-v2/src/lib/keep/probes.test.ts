import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listProbes, executeProbe, getProbesDir, getProbeBin } from "./probes.ts";

function withTempProbesDir(fn: (dir: string) => void) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "probes-test-"));
  const origDir = process.env.KEEP_PROBES_DIR;
  process.env.KEEP_PROBES_DIR = tmpDir;
  try {
    fn(tmpDir);
  } finally {
    process.env.KEEP_PROBES_DIR = origDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("getProbesDir / getProbeBin default to the box paths", () => {
  const origDir = process.env.KEEP_PROBES_DIR;
  const origBin = process.env.KEEP_PROBE_BIN;
  delete process.env.KEEP_PROBES_DIR;
  delete process.env.KEEP_PROBE_BIN;
  try {
    assert.equal(getProbesDir(), "/root/ravenstack-armory/workflows/probes");
    assert.equal(getProbeBin(), "/usr/local/bin/probe");
  } finally {
    process.env.KEEP_PROBES_DIR = origDir;
    process.env.KEEP_PROBE_BIN = origBin;
  }
});

test("listProbes returns an empty allowlist when the dir is missing", () => {
  const origDir = process.env.KEEP_PROBES_DIR;
  process.env.KEEP_PROBES_DIR = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
  try {
    assert.deepEqual(listProbes(), []);
  } finally {
    process.env.KEEP_PROBES_DIR = origDir;
  }
});

test("listProbes lists only .sh files with valid names, sorted", () => {
  withTempProbesDir((dir) => {
    fs.writeFileSync(path.join(dir, "gateway.sh"), "#!/bin/sh\necho SUMMARY: OK\n");
    fs.writeFileSync(path.join(dir, "sitrep.sh"), "#!/bin/sh\necho SUMMARY: OK\n");
    fs.writeFileSync(path.join(dir, "README.md"), "not a probe");
    fs.writeFileSync(path.join(dir, "Bad_Name.sh"), "invalid name, must be excluded");
    assert.deepEqual(listProbes(), ["gateway", "sitrep"]);
  });
});

test("executeProbe refuses a name that is not in the allowlist", async () => {
  await withTempProbesDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, "gateway.sh"), "#!/bin/sh\necho SUMMARY: OK\n");
    const res = await executeProbe("not-a-real-probe");
    assert.equal(res.ok, false);
    assert.match(res.summary, /FAIL/);
    assert.ok(res.error?.includes("No such probe"));
  });
});

test("executeProbe refuses a name with invalid characters even if it matches a file", async () => {
  await withTempProbesDirAsync(async () => {
    const res = await executeProbe("../../etc/passwd");
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes("No such probe"));
  });
});

test("executeProbe runs an allowed probe through the configured probe binary and parses SUMMARY", async () => {
  await withTempProbesDirAsync(async (dir) => {
    fs.writeFileSync(path.join(dir, "gateway.sh"), "#!/bin/sh\necho hi\n");
    // Stand in for /usr/local/bin/probe: a tiny script that ignores its own
    // logic and just proves the probe name reached argv untouched.
    const fakeBin = path.join(dir, "fake-probe.sh");
    fs.writeFileSync(
      fakeBin,
      "#!/bin/sh\necho ran probe: \"$1\"\necho SUMMARY: OK fake run\n",
    );
    fs.chmodSync(fakeBin, 0o755);
    const origBin = process.env.KEEP_PROBE_BIN;
    process.env.KEEP_PROBE_BIN = fakeBin;
    try {
      const res = await executeProbe("gateway");
      assert.equal(res.ok, true);
      assert.equal(res.summary, "SUMMARY: OK fake run");
      assert.ok(res.output.includes("ran probe: gateway"));
      assert.ok(res.ranAt.length > 0);
    } finally {
      process.env.KEEP_PROBE_BIN = origBin;
    }
  });
});

async function withTempProbesDirAsync(fn: (dir: string) => Promise<void>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "probes-test-"));
  const origDir = process.env.KEEP_PROBES_DIR;
  process.env.KEEP_PROBES_DIR = tmpDir;
  try {
    await fn(tmpDir);
  } finally {
    process.env.KEEP_PROBES_DIR = origDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
