/**
 * Maestro Ross Web Audio Procedural Sound Engine
 * Synthesizes authentic spray-can shake ('rattle-rattle') and aerosol nozzle hiss ('shhhk')
 * Zero external audio files required — 100% browser synthesized.
 */

class MaestroAudioEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx || this.ctx.state === "closed") {
        this.ctx = new AudioCtxClass();
      }
      if (this.ctx.state === "suspended") {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Play procedural spray-can rattle and hiss SFX ('rattle-rattle-shhhk')
   */
  public playSprayCanSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Rattle clicks (metallic marble bouncing inside can)
    // 3 distinct sharp rattle clicks
    const rattleTimes = [now + 0.02, now + 0.09, now + 0.16];
    for (const t of rattleTimes) {
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1400 + Math.random() * 400, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.035);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200, t);
      filter.Q.setValueAtTime(4.0, t);

      clickGain.gain.setValueAtTime(0.35, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.05);
    }

    // 2. Pressurized spray hiss ('shhhk')
    const hissStart = now + 0.28;
    const hissDuration = 0.55;
    const bufferSize = Math.floor(ctx.sampleRate * hissDuration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // White noise with subtle pink falloff
      output[i] = (Math.random() * 2 - 1) * 0.9;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(2800, hissStart);
    highpass.frequency.linearRampToValueAtTime(3600, hissStart + hissDuration);

    const peakFilter = ctx.createBiquadFilter();
    peakFilter.type = "peaking";
    peakFilter.frequency.setValueAtTime(4800, hissStart);
    peakFilter.gain.setValueAtTime(6.0, hissStart);
    peakFilter.Q.setValueAtTime(2.5, hissStart);

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.001, hissStart);
    hissGain.gain.exponentialRampToValueAtTime(0.28, hissStart + 0.03);
    hissGain.gain.exponentialRampToValueAtTime(0.22, hissStart + 0.35);
    hissGain.gain.exponentialRampToValueAtTime(0.001, hissStart + hissDuration);

    whiteNoise.connect(highpass);
    highpass.connect(peakFilter);
    peakFilter.connect(hissGain);
    hissGain.connect(ctx.destination);

    whiteNoise.start(hissStart);
    whiteNoise.stop(hissStart + hissDuration);
  }

  /**
   * Play an arcane chime on portrait completed
   */
  public playArcaneChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.08;

      osc.type = "sine";
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.75);
    });
  }
}

export const maestroAudio = new MaestroAudioEngine();
