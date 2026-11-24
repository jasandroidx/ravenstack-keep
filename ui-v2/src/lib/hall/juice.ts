import * as Phaser from "phaser";

/** Texture keys for the code-drawn Hall effects; no art files to ship. */
export const FX = { GLOW: "fx-glow" } as const;

const FONT = "monospace";

/** One soft radial glow, generated once per texture manager. */
export function ensureFxTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(FX.GLOW)) return;
  const size = 128;
  const tex = scene.textures.createCanvas(FX.GLOW, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

/** A line of flavour text that drifts up and fades, in world space. */
export function floatLine(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  ms = 2400,
): void {
  if (!text) return;
  const label = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#e8ecf1",
      align: "center",
      backgroundColor: "#0b0e14cc",
      padding: { x: 6, y: 3 },
      wordWrap: { width: 340 },
    })
    .setOrigin(0.5, 1)
    .setDepth(45);
  scene.tweens.add({
    targets: label,
    y: y - 22,
    alpha: 0,
    duration: ms,
    ease: "Sine.easeOut",
    onComplete: () => label.destroy(),
  });
}

/** Small amber burst the first time an interactable is found. */
export function discoveryJuice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  target?: Phaser.GameObjects.GameObject,
): void {
  ensureFxTextures(scene);
  const ring = scene.add
    .image(x, y, FX.GLOW)
    .setDepth(44)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(0xffc857)
    .setScale(0.1)
    .setAlpha(0.9);
  scene.tweens.add({
    targets: ring,
    scale: 1.1,
    alpha: 0,
    duration: 620,
    ease: "Cubic.easeOut",
    onComplete: () => ring.destroy(),
  });
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
    const dist = 26 + Math.random() * 34;
    const dot = scene.add
      .image(x, y, FX.GLOW)
      .setDepth(44)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe2a0)
      .setScale(0.06);
    scene.tweens.add({
      targets: dot,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      duration: 480 + Math.random() * 240,
      ease: "Cubic.easeOut",
      onComplete: () => dot.destroy(),
    });
  }
  if (target) {
    scene.tweens.add({
      targets: target,
      scale: { from: 1, to: 1.04 },
      duration: 140,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }
}

/**
 * Fade the camera out, then run `then` (usually a scene start). The receiving
 * scene fades itself in on create, as scene.ts and room-scene.ts already do.
 */
export function fadeThrough(
  scene: Phaser.Scene,
  then: () => void,
  opts: { outMs?: number } = {},
): void {
  const cam = scene.cameras.main;
  cam.fadeOut(opts.outMs ?? 420, 0, 0, 0);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
}

/** One in-world prompt line above the thing it belongs to. */
export class PromptLabel {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(0, 0, "", {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#ffc857",
        backgroundColor: "#0b0e14e6",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(44)
      .setVisible(false);
  }

  /** `verb` null hides the prompt; otherwise place it at the world point. */
  show(verb: string | null, x: number, y: number): void {
    if (!verb) {
      this.hide();
      return;
    }
    this.text.setText(`E — ${verb}`).setPosition(x, y).setVisible(true);
  }

  hide(): void {
    this.text.setVisible(false);
  }
}
