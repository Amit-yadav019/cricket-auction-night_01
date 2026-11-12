class BroadcastSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private crowdNode: AudioNode | null = null;
  private crowdGain: GainNode | null = null;
  private bgmInterval: any = null;
  private bgmPlaying: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  isEnabled(): boolean {
    return !this.muted;
  }

  isBgmPlaying(): boolean {
    return this.bgmPlaying;
  }

  setEnabled(enabled: boolean) {
    this.muted = !enabled;
    if (this.muted) {
      this.stopCrowdAmbience();
      this.stopBroadcastBgm();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopCrowdAmbience();
      this.stopBroadcastBgm();
    }
    return this.muted;
  }

  startBroadcastBgm() {
    if (this.muted || this.bgmPlaying) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.bgmPlaying = true;

      let step = 0;
      const bassNotes = [65.41, 65.41, 77.78, 87.31];

      const playPulse = () => {
        if (this.muted || !this.bgmPlaying || !this.ctx) return;
        const t = this.ctx.currentTime;
        const freq = bassNotes[step % bassNotes.length];

        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, t);
        filter.frequency.exponentialRampToValueAtTime(90, t + 0.38);

        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.42);
        step++;
      };

      playPulse();
      this.bgmInterval = setInterval(playPulse, 480);
    } catch {
      this.bgmPlaying = false;
    }
  }

  stopBroadcastBgm() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  toggleBroadcastBgm(): boolean {
    if (this.bgmPlaying) {
      this.stopBroadcastBgm();
      return false;
    } else {
      this.startBroadcastBgm();
      return true;
    }
  }

  startCrowdAmbience() {
    if (this.muted || this.crowdNode) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 1.5;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.035;

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      whiteNoise.start(0);
      this.crowdNode = whiteNoise;
      this.crowdGain = gain;
    } catch {}
  }

  stopCrowdAmbience() {
    try {
      if (this.crowdNode) {
        (this.crowdNode as AudioBufferSourceNode).stop();
        this.crowdNode.disconnect();
        this.crowdNode = null;
      }
      if (this.crowdGain) {
        this.crowdGain.disconnect();
        this.crowdGain = null;
      }
    } catch {}
  }

  playGavelCrack() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.16);

      gain.gain.setValueAtTime(1.0, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch {}
  }

  playGavel() {
    this.playGavelCrack();
  }

  playSold() {
    this.playGavelCrack();
  }

  playUnsold() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.25);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    } catch {}
  }

  playOutbid() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.16);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch {}
  }

  playUndo() {
    this.playOutbid();
  }

  playBidBeep() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, t);
      osc.frequency.exponentialRampToValueAtTime(880.0, t + 0.09);

      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.13);
    } catch {}
  }

  playBid() {
    this.playBidBeep();
  }

  playClick() {
    this.playBidBeep();
  }

  playCountdownTick() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(1150, t);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.045);
    } catch {}
  }

  playTimerTick() {
    this.playCountdownTick();
  }

  playWarning() {
    this.playCountdownTick();
  }

  playTimeoutAlert() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      [440, 554.37, 659.25].forEach((freq, i) => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + i * 0.07;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch {}
  }

  playFanfare() {
    if (this.muted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + i * 0.11;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch {}
  }
}

export const sound = new BroadcastSoundEngine();