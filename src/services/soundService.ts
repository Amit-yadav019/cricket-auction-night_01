/**
 * Sound Service - Synthesizes high-impact auction sound effects via Web Audio API.
 * Requires 0 external audio files, 0 latency, and works seamlessly on all mobile browsers.
 */

class SoundService {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public voiceEnabled: boolean = true;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * 1. SOLD: Gavel strike + heavy rubber stamp impact!
   */
  public playSold() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Gavel Impact (Acoustic Strike)
    const gavelOsc = ctx.createOscillator();
    const gavelGain = ctx.createGain();
    gavelOsc.type = 'triangle';
    gavelOsc.frequency.setValueAtTime(320, t);
    gavelOsc.frequency.exponentialRampToValueAtTime(70, t + 0.18);

    gavelGain.gain.setValueAtTime(0.8, t);
    gavelGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    gavelOsc.connect(gavelGain);
    gavelGain.connect(ctx.destination);
    gavelOsc.start(t);
    gavelOsc.stop(t + 0.25);

    // Heavy Stamp Thud (Deep Sub-Bass Thump)
    const stampOsc = ctx.createOscillator();
    const stampGain = ctx.createGain();
    stampOsc.type = 'sine';
    stampOsc.frequency.setValueAtTime(140, t + 0.05);
    stampOsc.frequency.exponentialRampToValueAtTime(45, t + 0.35);

    stampGain.gain.setValueAtTime(0.9, t + 0.05);
    stampGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    stampOsc.connect(stampGain);
    stampGain.connect(ctx.destination);
    stampOsc.start(t + 0.05);
    stampOsc.stop(t + 0.45);

    // Ink Slap White Noise Burst
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, t + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t + 0.05);
  }

  /**
   * 2. UNSOLD: Dull hollow wood tap & down-tone buzzer
   */
  public playUnsold() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Dull Wood Tap
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(220, t);
    osc1.frequency.exponentialRampToValueAtTime(90, t + 0.15);
    gain1.gain.setValueAtTime(0.5, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.2);

    // Low descending sigh
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;

    osc2.frequency.setValueAtTime(160, t + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(80, t + 0.35);

    gain2.gain.setValueAtTime(0.25, t + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc2.connect(filter);
    filter.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.08);
    osc2.stop(t + 0.45);
  }

  /**
   * 3. BID: Crisp wooden paddle clap
   */
  public playBid(bidAmount: number = 0) {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Pitch rises slightly with escalating bid amount
    const baseFreq = Math.min(480 + (bidAmount % 20) * 15, 800);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, t + 0.08);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Paddle click snap
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1200, t);
    clickGain.gain.setValueAtTime(0.3, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(t);
    clickOsc.stop(t + 0.04);
  }

  /**
   * 4. OUTBID: Double alert ping notifying user they got outbid
   */
  public playOutbid() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    [0, 0.1].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 880 : 1175, t + delay);

      gain.gain.setValueAtTime(0.35, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.14);
    });
  }

  /**
   * 5. WARNING: Gavel double-tap ("Going once, going twice!")
   */
  public playWarning() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    [0, 0.16].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, t + delay);
      osc.frequency.exponentialRampToValueAtTime(100, t + delay + 0.09);

      gain.gain.setValueAtTime(0.5, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.13);
    });
  }

  /**
   * 6. UNDO: Pitch-dropping rewind swoosh
   */
  public playUndo() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.18);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * 7. FANFARE: Celebratory chords on auction conclusion or mega buy
   */
  public playFanfare() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.12);

      gain.gain.setValueAtTime(0.4, t + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + idx * 0.12);
      osc.stop(t + idx * 0.12 + 0.45);
    });
  }

  /**
   * 8. AI Auctioneer Voice Synthesis: Speaks commentary aloud if speech synthesis is available
   */
  public speakCommentary(text: string) {
    if (!this.enabled || !this.voiceEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05; // Lively auction pace
      utterance.pitch = 1.05;

      // Pick an energetic English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.includes('en-IN') ||
          v.lang.includes('en-GB') ||
          v.name.includes('Natural') ||
          v.name.includes('Google')
      );
      if (preferred) utterance.voice = preferred;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      // Speech synthesis unsupported or blocked
    }
  }
}

export const sound = new SoundService();
