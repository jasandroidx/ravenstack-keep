import { describe, it } from "node:test";
import assert from "node:assert";
import { formatBytes, getMimeInfo } from "./drive-service.ts";

describe("formatBytes", () => {
  it("should return dash for undefined, null, or empty string", () => {
    assert.strictEqual(formatBytes(undefined), "—");
    assert.strictEqual(formatBytes(null as unknown as number), "—");
    assert.strictEqual(formatBytes(""), "—");
  });

  it("should return dash for invalid numbers, zero, or negative values", () => {
    assert.strictEqual(formatBytes("not-a-number"), "—");
    assert.strictEqual(formatBytes(0), "—");
    assert.strictEqual(formatBytes(-100), "—");
    assert.strictEqual(formatBytes("-50"), "—");
  });

  it("should format bytes (< 1024 B) without decimals", () => {
    assert.strictEqual(formatBytes(1), "1 B");
    assert.strictEqual(formatBytes(500), "500 B");
    assert.strictEqual(formatBytes("500"), "500 B");
    assert.strictEqual(formatBytes(1023), "1023 B");
  });

  it("should format KB, MB, GB, and TB with 1 decimal place", () => {
    assert.strictEqual(formatBytes(1024), "1.0 KB");
    assert.strictEqual(formatBytes(1536), "1.5 KB");
    assert.strictEqual(formatBytes(1048576), "1.0 MB");
    assert.strictEqual(formatBytes(5242880), "5.0 MB");
    assert.strictEqual(formatBytes("5242880"), "5.0 MB");
    assert.strictEqual(formatBytes(1073741824), "1.0 GB");
    assert.strictEqual(formatBytes(1099511627776), "1.0 TB");
  });
});

describe("getMimeInfo", () => {
  it("should return correct info for Google Drive workspace types", () => {
    assert.deepStrictEqual(getMimeInfo("application/vnd.google-apps.folder"), {
      label: "Folder",
      color: "#ffc857",
      isFolder: true,
    });
    assert.deepStrictEqual(getMimeInfo("application/vnd.google-apps.document"), {
      label: "Google Doc",
      color: "#4285F4",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("application/vnd.google-apps.spreadsheet"), {
      label: "Google Sheet",
      color: "#0F9D58",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("application/vnd.google-apps.presentation"), {
      label: "Google Slides",
      color: "#F4B400",
      isFolder: false,
    });
  });

  it("should return correct info for common file categories", () => {
    assert.deepStrictEqual(getMimeInfo("application/pdf"), {
      label: "PDF Document",
      color: "#EA4335",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("image/png"), {
      label: "Image",
      color: "#2de2e6",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("audio/mpeg"), {
      label: "Audio",
      color: "#ff2a6d",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("video/mp4"), {
      label: "Video",
      color: "#a855f7",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("text/plain"), {
      label: "Code / Text",
      color: "#39ff14",
      isFolder: false,
    });
    assert.deepStrictEqual(getMimeInfo("application/json"), {
      label: "Code / Text",
      color: "#39ff14",
      isFolder: false,
    });
  });

  it("should return default file info for unknown MIME types", () => {
    assert.deepStrictEqual(getMimeInfo("application/octet-stream"), {
      label: "File",
      color: "#94a3b8",
      isFolder: false,
    });
  });
});
