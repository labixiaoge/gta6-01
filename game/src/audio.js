// All sound in Sunhaven Bay is synthesized live with WebAudio — no audio files,
// no network. Engine hum, sirens, gunshots, pickups and UI blips are oscillators
// and filtered noise shaped in code.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a low-pass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 28;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420;
    this.engineOsc.connect(filt); engineOsc2.connect(filt);
    filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // Siren: triangle that wails up and down while wanted.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.startMusic();
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = this.muted ? 0 : (on ? 0.05 + speed01 * 0.08 : 0);
    this.engineGain.gain.setTargetAtTime(level, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(28 + speed01 * 65, t, 0.1);
  }
  setSiren(on, phase) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.035 : 0, t, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(phase * 2.4) * 220, t, 0.05);
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq || 440;
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  }
  noiseBurst(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * (dur || 0.2));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  gunshot() { this.noiseBurst(0.14, 0.4, 2600); this.blip(120, 0.1, 'square', 0.2); }
  // Two-tone car horn: a low pair that honks once per press.
  horn() {
    if (!this.ctx || this.muted) return;
    this.blip(370, 0.28, 'square', 0.12);
    this.blip(466, 0.28, 'square', 0.1);
  }
  // Tire screech: a short band of high noise that falls off fast.
  skid() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  // Flip the mute flag and silence the engine/siren loops with it.
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(this.muted ? 0 : 0.05, t, 0.05);
      this.sirenGain?.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
  pickup() { this.blip(660, 0.1, 'sine', 0.18); setTimeout(() => this.blip(990, 0.14, 'sine', 0.18), 90); }
  cash() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.2), i * 90)); }
  crash() { this.noiseBurst(0.3, 0.5, 500); }
  busted() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.15), i * 220)); }
  missionPass() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110)); }
  // A lazy bassline loop: A minor groove that keeps the city feeling alive.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 0, 55, 65.4, 0, 55, 49, 61.7];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (f) this.blip(f, 0.42, 'triangle', 0.05);
      if (this.musicStep % 4 === 2) this.blip(220 + Math.random() * 40, 0.1, 'sine', 0.025);
    }, 300);
  }
}
