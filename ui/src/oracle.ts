import Phaser from "phaser";

/**
 * The Oracle — a slit-pupilled green eye bound inside a ring of chains, with
 * witchfire rising off her.
 *
 * Drawn with Graphics and redrawn every frame rather than shipped as a sprite,
 * because she has to behave: the fire licks upward, the slit narrows when she
 * concentrates, the eye tracks what it is judging, and when she refuses a
 * write she turns red and stops blinking. A PNG cannot stare at you.
 *
 * Modelled on Jason's reference: almond eye, vertical serpent slit, dark
 * binding ring, four heavy chains anchored outward, inverted triangle beneath.
 * She is bound — the chains hold her, and that is the point. She is the thing
 * that cannot lie because it cannot move freely.
 */

const GREEN_BRIGHT = 0x7bff4a;
const GREEN = 0x39c81e;
const GREEN_DEEP = 0x0d3f12;
const CHAIN_DARK = 0x0a1a0c;
const CHAIN_EDGE = 0x2d5c33;
const REFUSE_RED = 0xff2a2a;
const REFUSE_DEEP = 0x4d0808;

const CHAIN_ARMS = 4;      // heavy chains anchored to the corners
const LINKS_PER_ARM = 7;
const RING_LINKS = 14;
const WISPS = 9;
/** Binding-ring radius, in eye-radii. Smaller = the eye dominates. */
const RING_R = 2.62;

export interface OracleOptions {
  /** World radius of the eye itself; the apparition is ~4x this. */
  scale?: number;
  depth?: number;
}

export class Oracle {
  readonly container: Phaser.GameObjects.Container;

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private r: number;

  private t = 0;
  private spin = 0;
  private lid = 0;          // 0 open, 1 shut
  private slit = 1;         // 1 relaxed, ->0.35 narrowed when judging
  private gaze = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };
  private angry = false;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: OracleOptions = {}) {
    this.scene = scene;
    this.r = opts.scale ?? 22;
    this.container = scene.add.container(x, y).setDepth(opts.depth ?? 40);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);
    this.scheduleBlink();
  }

  // ── behaviour ─────────────────────────────────────────────────────────

  /** Look at a world point. */
  lookAt(worldX: number, worldY: number) {
    const dx = worldX - this.container.x;
    const dy = worldY - this.container.y;
    const d = Math.hypot(dx, dy) || 1;
    this.target.x = (dx / d) * this.r * 0.34;
    this.target.y = (dy / d) * this.r * 0.24;
  }

  /** Drift somewhere else. She is never in a hurry. */
  driftTo(x: number, y: number, duration = 2600) {
    this.scene.tweens.add({
      targets: this.container, x, y, duration, ease: "Sine.easeInOut",
    });
  }

  manifest(x?: number, y?: number, duration = 800) {
    if (x !== undefined && y !== undefined) this.container.setPosition(x, y);
    this.container.setAlpha(0).setVisible(true);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration, ease: "Quad.easeOut" });
  }

  dismiss(duration = 1000) {
    this.scene.tweens.add({
      targets: this.container, alpha: 0, duration, ease: "Quad.easeIn",
      onComplete: () => this.container.setVisible(false),
    });
  }

  /** Concentrating: the slit narrows to a hairline. */
  scrutinise(on: boolean) {
    this.scene.tweens.add({
      targets: this, slit: on ? 0.35 : 1, duration: 420, ease: "Quad.easeOut",
    });
  }

  /**
   * Refusal. Red, unblinking, and she flares. A refused write should feel like
   * being looked at, not like a dismissed toast.
   */
  refuse(ms = 2800) {
    this.angry = true;
    this.blinkTimer?.remove();
    this.blinkTimer = null;
    this.lid = 0;
    this.scrutinise(true);
    this.scene.tweens.add({
      targets: this.container, scaleX: 1.2, scaleY: 1.2,
      duration: 160, yoyo: true, ease: "Quad.easeOut",
    });
    this.scene.time.delayedCall(ms, () => {
      this.angry = false;
      this.scrutinise(false);
      this.scheduleBlink();
    });
  }

  private scheduleBlink() {
    this.blinkTimer?.remove();
    this.blinkTimer = this.scene.time.delayedCall(Phaser.Math.Between(3000, 8500), () => {
      if (this.angry) return;
      this.scene.tweens.add({
        targets: this, lid: 1, duration: 85, yoyo: true, hold: 30,
        ease: "Quad.easeOut", onComplete: () => { this.lid = 0; },
      });
      this.scheduleBlink();
    });
  }

  // ── drawing helpers ───────────────────────────────────────────────────

  /** One chain link: an oval turned along the chain, flat or edge-on. */
  private link(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, angle: number, flat: boolean, r: number,
  ) {
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(angle + (flat ? 0 : Math.PI / 2));
    g.fillStyle(CHAIN_DARK, 1);
    g.fillEllipse(0, 0, r * 0.62, r * 0.34);
    g.lineStyle(1.6, CHAIN_EDGE, 0.8);
    g.strokeEllipse(0, 0, r * 0.62, r * 0.34);
    // Hollow centre — the gap is what makes it a link.
    g.fillStyle(0x04070a, 1);
    g.fillEllipse(0, 0, r * 0.3, r * 0.14);
    g.restore();
  }

  /** Half a lens curve. dir -1 = upper lid, +1 = lower. */
  private almond(
    g: Phaser.GameObjects.Graphics,
    w: number, h: number, dir: number, reverse = false,
  ) {
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const t = reverse ? 1 - i / N : i / N;
      const x = -w + 2 * w * t;
      const k = 1 - Math.abs(x / w);
      const y = dir * h * Math.pow(Math.max(k, 0), 0.62);
      if (i === 0 && !reverse) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }

  // ── render ────────────────────────────────────────────────────────────

  update(delta: number) {
    const dt = delta / 1000;
    this.t += dt;
    this.spin += dt * 0.35;

    this.gaze.x += (this.target.x - this.gaze.x) * 0.07;
    this.gaze.y += (this.target.y - this.gaze.y) * 0.07;
    this.container.y += Math.sin(this.t * 0.9) * 0.05;

    const g = this.gfx;
    const r = this.r;
    const hot = this.angry ? REFUSE_RED : GREEN_BRIGHT;
    const mid = this.angry ? REFUSE_RED : GREEN;
    const deep = this.angry ? REFUSE_DEEP : GREEN_DEEP;

    g.clear();

    // Haze behind everything.
    for (let i = 4; i >= 1; i--) {
      g.fillStyle(deep, 0.1);
      g.fillCircle(0, 0, r * (2.0 + i * 0.7) * (1 + Math.sin(this.t + i) * 0.03));
    }

    // Witchfire licking off the eye — tapering tongues, not scratches. Tight
    // to the centre and narrowing as they climb, so it reads as flame.
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < WISPS; i++) {
        const phase = this.t * 2.2 + i * 1.37 + (side > 0 ? 2.1 : 0);
        const baseX = (i / (WISPS - 1) - 0.5) * r * 1.05;
        const len = r * (1.5 + 0.75 * (0.5 + 0.5 * Math.sin(phase)));
        const steps = 7;
        for (let s0 = 0; s0 < steps; s0++) {
          const f0 = s0 / steps;
          const f1 = (s0 + 1) / steps;
          const taper = 1 - f0;
          g.lineStyle(r * 0.16 * taper, f0 < 0.35 ? hot : mid, (0.75 - f0 * 0.6));
          g.beginPath();
          g.moveTo(
            baseX + Math.sin(phase + f0 * 4.0) * r * 0.3 * f0,
            side * (r * 1.1 + f0 * len),
          );
          g.lineTo(
            baseX + Math.sin(phase + f1 * 4.0) * r * 0.3 * f1,
            side * (r * 1.1 + f1 * len),
          );
          g.strokePath();
        }
      }
    }

    // The binding ring she sits inside.
    g.lineStyle(r * 0.26, CHAIN_DARK, 0.95);
    g.strokeCircle(0, 0, RING_R * r);
    g.lineStyle(1.5, CHAIN_EDGE, 0.4);
    g.strokeCircle(0, 0, RING_R * r);

    // Ring links riding the binding circle. Oriented ovals, alternating
    // flat/edge-on, which is what makes a row of shapes read as a chain
    // rather than a row of beads.
    for (let i = 0; i < RING_LINKS; i++) {
      const a = this.spin + (i / RING_LINKS) * Math.PI * 2;
      this.link(g, Math.cos(a) * RING_R * r, Math.sin(a) * RING_R * r, a, i % 2 === 0, r);
    }

    // Four heavy chains anchored outward — she is bound, not floating.
    for (let arm = 0; arm < CHAIN_ARMS; arm++) {
      const a = (Math.PI / 4) + (arm / CHAIN_ARMS) * Math.PI * 2;
      const sway = Math.sin(this.t * 0.8 + arm) * 0.03;
      // Overlap the links so the arm reads as one heavy chain.
      for (let l = 0; l < LINKS_PER_ARM; l++) {
        const d = RING_R * r + r * 0.3 + l * r * 0.46;
        this.link(g, Math.cos(a + sway) * d, Math.sin(a + sway) * d, a, l % 2 === 0, r);
      }
    }

    // Inverted triangle beneath the eye.
    g.lineStyle(1.6, mid, 0.5);
    g.beginPath();
    g.moveTo(-r * 0.42, r * 0.72);
    g.lineTo(r * 0.42, r * 0.72);
    g.lineTo(0, r * 1.3);
    g.closePath();
    g.strokePath();

    // ── the eye ──────────────────────────────────────────────────────────
    const open = 1 - this.lid;
    if (open > 0.02) {
      const w = r * 2.05;
      const h = r * 1.18 * open;

      // Almond: a lens curve, sharp at the corners and full in the middle.
      g.fillStyle(deep, 0.95);
      g.beginPath();
      this.almond(g, w, h, 1);
      this.almond(g, w, h, -1, true);
      g.closePath();
      g.fillPath();

      // Iris.
      const ir = Math.min(r * 0.95, h * 0.92);
      g.fillStyle(mid, 1);
      g.fillCircle(this.gaze.x, this.gaze.y, ir);
      g.fillStyle(hot, 0.55);
      g.fillCircle(this.gaze.x, this.gaze.y, ir * 0.72);

      // Radial fibres.
      g.lineStyle(1, deep, 0.5);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + this.t * 0.15;
        g.beginPath();
        g.moveTo(this.gaze.x + Math.cos(a) * ir * 0.32, this.gaze.y + Math.sin(a) * ir * 0.32);
        g.lineTo(this.gaze.x + Math.cos(a) * ir, this.gaze.y + Math.sin(a) * ir);
        g.strokePath();
      }

      // The slit — vertical, serpent.
      g.fillStyle(0x02110a, 1);
      g.fillEllipse(this.gaze.x, this.gaze.y, ir * 0.3 * this.slit, ir * 1.75);

      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(this.gaze.x - ir * 0.34, this.gaze.y - ir * 0.38, ir * 0.14);

      // Heavy upper lid.
      g.lineStyle(r * 0.13, deep, 0.95);
      g.beginPath();
      this.almond(g, w, h, -1);
      g.strokePath();
    }
  }

  destroy() {
    this.blinkTimer?.remove();
    this.container.destroy(true);
  }
}
