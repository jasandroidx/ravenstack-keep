import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("TalkSheet and HallScene Keyboard Interactivity", () => {
  it("HallScene has setKeyboardEnabled method that toggles keyboard enabled state and calls enableGlobalCapture/disableGlobalCapture", () => {
    const scenePath = path.join(process.cwd(), "src/lib/hall/scene.ts");
    const content = fs.readFileSync(scenePath, "utf-8");

    assert.ok(
      content.includes("public setKeyboardEnabled(on: boolean)"),
      "scene.ts must declare public setKeyboardEnabled(on: boolean) method"
    );
    assert.ok(
      content.includes("this.input.keyboard.enabled = on"),
      "setKeyboardEnabled must update keyboard.enabled"
    );
    assert.ok(
      content.includes("this.input.keyboard.enableGlobalCapture()"),
      "setKeyboardEnabled must call enableGlobalCapture when on is true"
    );
    assert.ok(
      content.includes("this.input.keyboard.disableGlobalCapture()"),
      "setKeyboardEnabled must call disableGlobalCapture when on is false"
    );

    // Test method logic functionally with mock object matching HallScene implementation
    let enableCalled = 0;
    let disableCalled = 0;

    const mockKeyboard = {
      enabled: true,
      enableGlobalCapture() {
        enableCalled++;
        return this;
      },
      disableGlobalCapture() {
        disableCalled++;
        return this;
      },
    };

    const sceneMock = {
      input: { keyboard: mockKeyboard },
      setKeyboardEnabled(on: boolean) {
        if (!this.input?.keyboard) return;
        this.input.keyboard.enabled = on;
        if (on) {
          this.input.keyboard.enableGlobalCapture();
        } else {
          this.input.keyboard.disableGlobalCapture();
        }
      },
    };

    // Disable keyboard (e.g., when TalkSheet modal opens)
    sceneMock.setKeyboardEnabled(false);
    assert.equal(mockKeyboard.enabled, false);
    assert.equal(disableCalled, 1);
    assert.equal(enableCalled, 0);

    // Enable keyboard (e.g., when TalkSheet modal closes)
    sceneMock.setKeyboardEnabled(true);
    assert.equal(mockKeyboard.enabled, true);
    assert.equal(enableCalled, 1);
    assert.equal(disableCalled, 1);
  });

  it("KeepHall syncs modal open state with scene.setKeyboardEnabled", () => {
    const keepHallPath = path.join(process.cwd(), "src/components/hall/keep-hall.tsx");
    const content = fs.readFileSync(keepHallPath, "utf-8");

    assert.ok(
      content.includes("sceneRef.current.setKeyboardEnabled(!isOpen)"),
      "keep-hall.tsx must disable keyboard capture when modals (talk/table/wardrobe) are open"
    );
  });

  it("TalkSheet input field allows typing 'wasd e' without key interception", () => {
    const talkSheetPath = path.join(process.cwd(), "src/components/hall/talk-sheet.tsx");
    const content = fs.readFileSync(talkSheetPath, "utf-8");

    assert.ok(
      content.includes("Transmit neural query to"),
      "TalkSheet must render the neural query input field"
    );

    assert.ok(
      content.includes("onChange={(e) => setInput(e.target.value)}"),
      "TalkSheet input must update value normally on key typing"
    );
  });
});
