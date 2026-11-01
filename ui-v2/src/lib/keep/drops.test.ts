import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readLatestRavenDrop, getDropsDir } from "./drops.ts";

test("readLatestRavenDrop unit tests", async (t) => {
  await t.test("returns non-existent status when directory or file is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drops-test-missing-"));
    const origEnv = process.env.KEEP_DROPS_DIR;
    process.env.KEEP_DROPS_DIR = tmpDir;

    try {
      const drop = readLatestRavenDrop();
      assert.equal(drop.exists, false);
      assert.equal(drop.filename, "latest.txt");
      assert.equal(drop.header, "");
      assert.equal(drop.content, "");
    } finally {
      process.env.KEEP_DROPS_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("reads small latest.txt completely and extracts header line", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drops-test-small-"));
    const origEnv = process.env.KEEP_DROPS_DIR;
    process.env.KEEP_DROPS_DIR = tmpDir;

    try {
      const dropContent = "HEADER: Raven Drop #42\nThis is a live test drop.\nLine 3 of the drop.\n";
      fs.writeFileSync(path.join(tmpDir, "latest.txt"), dropContent, "utf-8");

      const drop = readLatestRavenDrop();
      assert.equal(drop.exists, true);
      assert.equal(drop.filename, "latest.txt");
      assert.equal(drop.header, "HEADER: Raven Drop #42");
      assert.equal(drop.content, dropContent);
      assert.ok(drop.mtime.length > 0);
    } finally {
      process.env.KEEP_DROPS_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test("caps file reading at 12KB while preserving the header line and tailing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drops-test-large-"));
    const origEnv = process.env.KEEP_DROPS_DIR;
    process.env.KEEP_DROPS_DIR = tmpDir;

    try {
      const headerLine = "HEADER: Oversized Raven Drop #100\n";
      // Generate 20KB of padding text
      const filler = "X".repeat(20 * 1024 - headerLine.length - 12) + "\nEND_OF_DROP\n";
      const fullContent = headerLine + filler;

      fs.writeFileSync(path.join(tmpDir, "latest.txt"), fullContent, "utf-8");

      const drop = readLatestRavenDrop();
      assert.equal(drop.exists, true);
      assert.equal(drop.filename, "latest.txt");
      assert.equal(drop.header, "HEADER: Oversized Raven Drop #100");

      assert.ok(drop.content.startsWith(headerLine));
      assert.ok(drop.content.includes("...[truncated]..."));
      assert.ok(drop.content.endsWith("END_OF_DROP\n"));

      // Ensure total content size does not exceed ~12KB
      assert.ok(Buffer.byteLength(drop.content, "utf-8") <= 12 * 1024 + 100);
    } finally {
      process.env.KEEP_DROPS_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
