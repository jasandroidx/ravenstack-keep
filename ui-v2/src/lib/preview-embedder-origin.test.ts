import { describe, it } from "node:test";
import assert from "node:assert";
import { isSandboxPreviewGuestHost } from "./preview-embedder-origin.ts";

describe("isSandboxPreviewGuestHost", () => {
  it("should return true for exact match", () => {
    assert.strictEqual(isSandboxPreviewGuestHost("grok-sandbox.com"), true);
  });

  it("should return true for case-insensitive match", () => {
    assert.strictEqual(isSandboxPreviewGuestHost("GROK-SANDBOX.COM"), true);
  });

  it("should return true for subdomains", () => {
    assert.strictEqual(isSandboxPreviewGuestHost("sub.grok-sandbox.com"), true);
    assert.strictEqual(isSandboxPreviewGuestHost("a.b.grok-sandbox.com"), true);
  });

  it("should return false for invalid domains", () => {
    assert.strictEqual(isSandboxPreviewGuestHost("grok.com"), false);
    assert.strictEqual(isSandboxPreviewGuestHost("mygrok-sandbox.com"), false);
    assert.strictEqual(isSandboxPreviewGuestHost("grok-sandbox.com.org"), false);
    assert.strictEqual(isSandboxPreviewGuestHost("example.com"), false);
  });
});
