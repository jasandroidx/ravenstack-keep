import assert from "node:assert";
import test, { describe } from "node:test";
import fs from "node:fs";
import path from "node:path";

describe("Keep components accessibility test", () => {
  test("WarTablePanel has accessible Re-read button with aria-label and focus-visible styling", () => {
    const filePath = path.join(process.cwd(), "src/components/keep/war-table-panel.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Re-read war table pending gates"'),
      "WarTablePanel Re-read button should have descriptive aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-1"),
      "WarTablePanel Re-read button should have focus-visible styling"
    );
  });

  test("WatchtowerBeacon has accessible Re-read button with aria-label and focus-visible styling", () => {
    const filePath = path.join(process.cwd(), "src/components/keep/watchtower-beacon.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Re-read stack health beacon status"'),
      "WatchtowerBeacon Re-read button should have descriptive aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-1"),
      "WatchtowerBeacon Re-read button should have focus-visible styling"
    );
  });

  test("FastMCPStatusBadge has accessible button with aria-label, aria-busy, and focus-visible styling", () => {
    const filePath = path.join(process.cwd(), "src/components/keep/fastmcp-status-badge.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("aria-label={buttonLabel}"),
      "FastMCPStatusBadge button should have dynamic aria-label"
    );
    assert.ok(
      content.includes("aria-busy={probing}"),
      "FastMCPStatusBadge button should communicate busy state via aria-busy"
    );
    assert.ok(
      content.includes("focus-visible:ring-1"),
      "FastMCPStatusBadge button should have focus-visible styling"
    );
  });

  test("MaestroDialogue has accessible close button with aria-label, focus-visible styling, and Escape key listener", () => {
    const filePath = path.join(process.cwd(), "src/components/gallery/maestro-dialogue.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Close dialogue"'),
      "MaestroDialogue close button should have descriptive aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-2"),
      "MaestroDialogue close button should have focus-visible styling"
    );
    assert.ok(
      content.includes('e.key === "Escape"'),
      "MaestroDialogue should handle Escape key to close"
    );
  });

  test("PortraitStudioModal has accessible close button with aria-label, focus-visible styling, and Escape key listener", () => {
    const filePath = path.join(process.cwd(), "src/components/gallery/portrait-studio-modal.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Close studio"'),
      "PortraitStudioModal close button should have descriptive aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-2"),
      "PortraitStudioModal close button should have focus-visible styling"
    );
    assert.ok(
      content.includes('e.key === "Escape"'),
      "PortraitStudioModal should handle Escape key to close"
    );
  });

  test("GoogleDriveExplorer file preview has accessible close button with aria-label and focus-visible styling", () => {
    const filePath = path.join(process.cwd(), "src/components/drive/drive-explorer.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Close file preview"'),
      "GoogleDriveExplorer close preview button should have descriptive aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-2"),
      "GoogleDriveExplorer close preview button should have focus-visible styling"
    );
  });
});
