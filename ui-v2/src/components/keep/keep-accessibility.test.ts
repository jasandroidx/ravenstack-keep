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

  test("FastMCPGatewayStreamer has accessible controls with aria-labels and focus-visible styling", () => {
    const filePath = path.join(process.cwd(), "src/components/mechanic/fastmcp-gateway-streamer.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('aria-label="Filter gateway logs by service"'),
      "FastMCPGatewayStreamer select filter should have aria-label"
    );
    assert.ok(
      content.includes('aria-label="Poll gateway logs once"'),
      "FastMCPGatewayStreamer poll button should have aria-label"
    );
    assert.ok(
      content.includes('aria-label="Retry polling gateway logs"'),
      "FastMCPGatewayStreamer retry button should have aria-label"
    );
    assert.ok(
      content.includes("focus-visible:ring-[#2de2e6]"),
      "FastMCPGatewayStreamer interactive controls should have focus-visible ring styling"
    );
  });
});
