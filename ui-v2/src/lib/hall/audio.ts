/**
 * Procedural Web Audio Engine for Ravenstack Keep
 * - Stone & metallic footstep sounds synced to walking animation
 * - Cyber-arcane torch & ambient hum synth
 * - Dialogue teletype sound effects & NPC chime chirps
 * - Portal travel & zone transition sweeps
 * - The Oracle Spectral Apparition: Eerie drone, rattling iron chains, whispering noise sweeps & truth bell
 */

class HallAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

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
   * Crisp stone boot-step with micro-randomized pitch and low-end resonance
   */
  public playStep(isStone = true): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Noise click / gravel impact
    const bufferSize = ctx.sampleRate * 0.025; // 25ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = isStone ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(isStone ? 800 + Math.random() * 250 : 320, t);
    filter.Q.setValueAtTime(1.8, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    // Low sub thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(110 + Math.random() * 20, t);
    sub.frequency.exponentialRampToValueAtTime(45, t + 0.04);
    subGain.gain.setValueAtTime(0.06, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    sub.connect(subGain);
    subGain.connect(ctx.destination);

    noise.start(t);
    noise.stop(t + 0.04);
    sub.start(t);
    sub.stop(t + 0.05);
  }

  /**
   * Typewriter dialogue blip
   */
  public playDialogueBlip(characterPitch = 1): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = characterPitch < 0.6 ? "sawtooth" : "triangle";
    const baseFreq = 480 * characterPitch + (Math.random() * 40 - 20);
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, t + 0.028);

    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.032);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.035);
  }

  /**
   * Interact / NPC Approach Chime
   */
  public playInteract(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.exponentialRampToValueAtTime(880.0, t + 0.08); // A5

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.17);
  }

  /**
   * Portal / Zone transition swell
   */
  public playZoneTransition(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.25);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  /**
   * THE ORACLE: Ghostly Spectral Apparition Manifestation Sound
   * Deep sub rumble, eerie dissonant dual-drone, spectral whisper, and rattling iron chains
   */
  public playOracleManifest(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // 1. Deep Sub-bass Truth Drone (38Hz -> 30Hz)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(46, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 2.2);
    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(0.18, t + 0.3);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);

    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 2.5);

    // 2. Dissonant Spectral Ethereal Chord (118Hz + 124Hz + 372Hz triangle beats)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const chordGain = ctx.createGain();
    osc1.type = "sawtooth";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(118, t);
    osc2.frequency.setValueAtTime(124.5, t); // Micro-tonal dissonance (6.5 Hz beating binaural pulse)

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(450, t);
    bandpass.frequency.exponentialRampToValueAtTime(1200, t + 1.2);
    bandpass.frequency.exponentialRampToValueAtTime(280, t + 2.4);
    bandpass.Q.setValueAtTime(4.5, t);

    chordGain.gain.setValueAtTime(0.001, t);
    chordGain.gain.linearRampToValueAtTime(0.12, t + 0.4);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);

    osc1.connect(bandpass);
    osc2.connect(bandpass);
    bandpass.connect(chordGain);
    chordGain.connect(ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 2.6);
    osc2.stop(t + 2.6);

    // 3. Rattling Dark Iron Chains
    this.playChainRattle(0.15);

    // 4. Ghostly Whisper Sibilance Sweep
    const bufferSize = Math.floor(ctx.sampleRate * 1.8);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1800, t);
    noiseFilter.frequency.linearRampToValueAtTime(3200, t + 0.8);
    noiseFilter.frequency.exponentialRampToValueAtTime(600, t + 1.8);
    noiseFilter.Q.setValueAtTime(3.0, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.08, t + 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(t);
    noiseSource.stop(t + 2.0);
  }

  /**
   * Rattling iron chains effect
   */
  public playChainRattle(volume = 0.12): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const links = 5;

    for (let i = 0; i < links; i++) {
      const linkTime = t + i * 0.07 + Math.random() * 0.02;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1600 + Math.random() * 1200, linkTime);
      osc.frequency.exponentialRampToValueAtTime(400, linkTime + 0.08);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200 + Math.random() * 600, linkTime);
      filter.Q.setValueAtTime(8.0, linkTime);

      gain.gain.setValueAtTime(volume * (0.8 + Math.random() * 0.4), linkTime);
      gain.gain.exponentialRampToValueAtTime(0.0005, linkTime + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(linkTime);
      osc.stop(linkTime + 0.1);
    }
  }

  /**
   * High-pitched Piercing Ocular Gaze Sound
   */
  public playOracleGaze(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1860, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(5.0, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.75);
  }

  /**
   * Armor Swap / Equipping Metallurgic Chime
   */
  public playArmorEquip(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A Major arpeggio
    notes.forEach((freq, idx) => {
      const nt = t + idx * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, nt);
      gain.gain.setValueAtTime(0.08, nt);
      gain.gain.exponentialRampToValueAtTime(0.0001, nt + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(nt);
      osc.stop(nt + 0.2);
    });
  }

  /**
   * Dialogue Choice & Reaction Emotion Sound
   */
  public playReaction(sentiment: "approval" | "strike" | "inquiry" | "alert"): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    if (sentiment === "approval") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, t + 0.12); // G5
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    } else if (sentiment === "strike" || sentiment === "alert") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.15);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }
}

export const hallAudio = new HallAudioEngine();

