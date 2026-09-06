/**
 * Maestro Ross's studio sounds.
 *
 * Synthesised through WebAudio rather than loaded as assets, matching
 * lib/hall/audio.ts — no files to ship, and nothing to 404 in a build.
 * Every call is a no-op when the context is unavailable; audio never
 * interrupts a commission.
 */
class MaestroAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx || this.ctx.state === "closed") this.ctx = new AudioCtxClass();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Filtered noise burst — an aerosol hiss for tag presses and photo drops. */
  public playSprayCanSound(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.16;

    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(2400 + Math.random() * 900, t);
    band.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  /** Two-note arcane chime. The portrait is forged and on the wall. */
  public playArcaneChime(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    [
      { f: 784, at: 0 },
      { f: 1175, at: 0.13 },
    ].forEach(({ f, at }) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t + at);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.11, t + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.9);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t + at);
      osc.stop(t + at + 0.95);
    });
  }
}

export const maestroAudio = new MaestroAudioEngine();
