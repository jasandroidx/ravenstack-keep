/**
 * Ravenstack Keep — procedural cyber-arcane "MIDI" music + UI SFX.
 * Pure Web Audio (no assets). Starts on first user gesture (browser policy).
 */

const LS_MUTE = "keep.audio.muted";
const LS_MUSIC = "keep.audio.music";
const LS_SFX = "keep.audio.sfx";

type Wave = OscillatorType;

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export class KeepAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private muted = localStorage.getItem(LS_MUTE) === "1";
  private musicVol = Number(localStorage.getItem(LS_MUSIC) ?? "0.35");
  private sfxVol = Number(localStorage.getItem(LS_SFX) ?? "0.55");
  private started = false;
  private musicTimer: number | null = null;
  private step = 0;
  private lastGateCount = 0;
  private gatePrimed = false;
  private ambientLfo: OscillatorNode | null = null;
  private padGain: GainNode | null = null;

  /** Minor cyber-arcane progression (MIDI note numbers). */
  private readonly bassPattern = [36, 36, 39, 36, 34, 34, 31, 34]; // C2…
  private readonly arpPattern = [
    60, 63, 67, 70, 67, 63, 60, 67, // C minor-ish
    58, 62, 65, 70, 65, 62, 58, 65,
    55, 58, 63, 67, 63, 58, 55, 63,
    53, 58, 60, 65, 60, 58, 53, 60,
  ];
  private readonly leadHits = [72, 75, 79, 0, 75, 0, 72, 67];

  isMuted(): boolean {
    return this.muted;
  }

  getMusicVol(): number {
    return this.musicVol;
  }

  getSfxVol(): number {
    return this.sfxVol;
  }

  isRunning(): boolean {
    return this.started && !this.muted;
  }

  /** Unlock audio on a user gesture, then start ambient if not muted. */
  async ensureStarted(): Promise<void> {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyGains();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.started && !this.muted) {
      this.startMusic();
    }
    this.started = true;
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem(LS_MUTE, m ? "1" : "0");
    this.applyGains();
    if (m) {
      this.stopMusic();
    } else if (this.ctx) {
      void this.ensureStarted().then(() => this.startMusic());
    }
  }

  setMusicVol(v: number) {
    this.musicVol = clamp01(v);
    localStorage.setItem(LS_MUSIC, String(this.musicVol));
    this.applyGains();
  }

  setSfxVol(v: number) {
    this.sfxVol = clamp01(v);
    localStorage.setItem(LS_SFX, String(this.sfxVol));
    this.applyGains();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private applyGains() {
    if (!this.ctx) return;
    const mute = this.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(mute, this.ctx.currentTime, 0.02);
    this.musicBus.gain.setTargetAtTime(
      this.musicVol * 0.45,
      this.ctx.currentTime,
      0.05,
    );
    this.sfxBus.gain.setTargetAtTime(
      this.sfxVol,
      this.ctx.currentTime,
      0.02,
    );
  }

  // ── Music ──────────────────────────────────────────────────

  private startMusic() {
    if (!this.ctx || this.musicTimer != null || this.muted) return;
    this.step = 0;
    this.startPad();
    // 16th notes at ~92 BPM → 60/92/4 ≈ 0.163s
    const stepMs = 160;
    this.musicTimer = window.setInterval(() => this.tickMusic(), stepMs);
  }

  private stopMusic() {
    if (this.musicTimer != null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ambientLfo) {
      try {
        this.ambientLfo.stop();
      } catch {
        /* already stopped */
      }
      this.ambientLfo = null;
    }
    if (this.padGain && this.ctx) {
      this.padGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.padGain = null;
    }
  }

  private startPad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pad = this.ctx.createGain();
    pad.gain.value = 0;
    pad.connect(this.musicBus);
    pad.gain.linearRampToValueAtTime(0.08, t + 2);

    // Two detuned triangle "choir" tones
    for (const [midi, detune] of [
      [48, -8],
      [55, 6],
      [60, -4],
    ] as const) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = midiToHz(midi);
      o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0.35;
      o.connect(g);
      g.connect(pad);
      o.start(t);
    }

    // Slow filter-ish LFO via gain pulse on a high sine shimmer
    const shimmer = this.ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = midiToHz(84);
    const shG = this.ctx.createGain();
    shG.gain.value = 0.02;
    shimmer.connect(shG);
    shG.connect(pad);
    shimmer.start(t);

    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.015;
    lfo.connect(lfoG);
    lfoG.connect(shG.gain);
    lfo.start(t);
    this.ambientLfo = lfo;
    this.padGain = pad;
  }

  private tickMusic() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.step;

    // Kick / soft thud every bar
    if (s % 8 === 0) {
      this.thud(t, 0.12);
    }
    // Hi hat-ish noise tick
    if (s % 2 === 0) {
      this.hat(t, s % 4 === 0 ? 0.04 : 0.02);
    }

    // Bass
    const bassNote = this.bassPattern[s % this.bassPattern.length];
    if (s % 2 === 0) {
      this.note(t, bassNote, 0.28, "square", 0.07, this.musicBus);
    }

    // Arp 16ths
    const arp = this.arpPattern[s % this.arpPattern.length];
    this.note(t, arp, 0.12, "square", 0.045, this.musicBus);

    // Sparse lead
    if (s % 4 === 0) {
      const lead = this.leadHits[(s / 4) % this.leadHits.length];
      if (lead > 0) {
        this.note(t, lead, 0.35, "triangle", 0.05, this.musicBus);
      }
    }

    // Magenta “data blip” every 2 bars
    if (s % 32 === 16) {
      this.blip(t, midiToHz(90), 0.06, this.musicBus);
    }

    this.step = (s + 1) % 256;
  }

  private note(
    t: number,
    midi: number,
    dur: number,
    type: Wave,
    peak: number,
    bus: GainNode,
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiToHz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Soft lowpass-ish: layer a quieter sine
    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = midiToHz(midi);
    const g2 = this.ctx.createGain();
    g2.gain.value = peak * 0.4;
    o.connect(g);
    o2.connect(g2);
    g.connect(bus);
    g2.connect(bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
  }

  private thud(t: number, peak: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private hat(t: number, peak: number) {
    if (!this.ctx) return;
    // Short filtered noise burst via high square detuned
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 6000 + Math.random() * 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.05);
  }

  private blip(t: number, hz: number, peak: number, bus: GainNode) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 1.5, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.14);
  }

  // ── SFX ────────────────────────────────────────────────────

  sfxClick() {
    void this.withSfx((t) => {
      this.note(t, 72, 0.06, "square", 0.08, this.sfxBus);
      this.note(t + 0.04, 84, 0.05, "sine", 0.05, this.sfxBus);
    });
  }

  sfxSelect() {
    void this.withSfx((t) => {
      this.note(t, 60, 0.08, "triangle", 0.07, this.sfxBus);
      this.note(t + 0.05, 67, 0.1, "triangle", 0.06, this.sfxBus);
      this.note(t + 0.1, 72, 0.14, "sine", 0.05, this.sfxBus);
    });
  }

  sfxZoom(inward: boolean) {
    void this.withSfx((t) => {
      const a = inward ? 70 : 82;
      const b = inward ? 82 : 70;
      this.blip(t, midiToHz(a), 0.04, this.sfxBus);
      this.blip(t + 0.05, midiToHz(b), 0.03, this.sfxBus);
    });
  }

  sfxGateAlert() {
    void this.withSfx((t) => {
      this.note(t, 58, 0.15, "square", 0.09, this.sfxBus);
      this.note(t + 0.12, 61, 0.18, "square", 0.08, this.sfxBus);
      this.note(t + 0.28, 58, 0.25, "triangle", 0.07, this.sfxBus);
    });
  }

  sfxRefresh() {
    void this.withSfx((t) => {
      for (let i = 0; i < 4; i++) {
        this.note(t + i * 0.04, 64 + i * 3, 0.05, "square", 0.035, this.sfxBus);
      }
    });
  }

  sfxSuccess() {
    void this.withSfx((t) => {
      this.note(t, 67, 0.1, "triangle", 0.07, this.sfxBus);
      this.note(t + 0.08, 72, 0.12, "triangle", 0.07, this.sfxBus);
      this.note(t + 0.16, 79, 0.2, "sine", 0.06, this.sfxBus);
    });
  }

  sfxError() {
    void this.withSfx((t) => {
      this.note(t, 50, 0.15, "sawtooth", 0.06, this.sfxBus);
      this.note(t + 0.1, 46, 0.2, "sawtooth", 0.05, this.sfxBus);
    });
  }

  sfxHoverSoft() {
    void this.withSfx((t) => {
      this.blip(t, midiToHz(88), 0.02, this.sfxBus);
    });
  }

  /** Call when gate count changes — chime only on newly arrived gates. */
  onGateCount(count: number) {
    if (this.gatePrimed && count > this.lastGateCount && count > 0) {
      this.sfxGateAlert();
    }
    this.gatePrimed = true;
    this.lastGateCount = count;
  }

  private async withSfx(fn: (t: number) => void) {
    if (this.muted) return;
    try {
      await this.ensureStarted();
    } catch {
      return;
    }
    if (!this.ctx || this.muted) return;
    fn(this.ctx.currentTime);
  }
}

/** Singleton for the shell. */
export const keepAudio = new KeepAudio();
