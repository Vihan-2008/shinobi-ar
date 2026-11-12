// Procedural sound effects with the Web Audio API (no audio files needed).

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.recDest = null;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    try {
      this.recDest = this.ctx.createMediaStreamDestination();
      comp.connect(this.recDest);
    } catch { this.recDest = null; }
    // White noise buffer shared by every effect.
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Crackle buffer: sparse sharp bursts (lightning / fire).
    this.crackle = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const c = this.crackle.getChannelData(0);
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0009) env = 0.6 + Math.random() * 0.4;
      env *= 0.9965;
      c[i] = (Math.random() * 2 - 1) * env;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get ok() { return !!this.ctx && this.volume > 0; }

  src(buffer, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  env(gainNode, t0, a, peak, hold, release) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.setValueAtTime(Math.max(peak, 0.0002), t0 + a + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + hold + release);
  }

  noiseBurst({ type = 'lowpass', f0 = 1000, f1 = f0, q = 1, a = 0.01, peak = 0.5, hold = 0, release = 0.3, delay = 0, buffer }) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const s = this.src(buffer || this.noise, true);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + hold + release);
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, hold, release);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + hold + release + 0.05);
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, a = 0.005, peak = 0.3, hold = 0, release = 0.4, delay = 0 }) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + a + hold + release);
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, hold, release);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + a + hold + release + 0.05);
  }

  /* ───── One-shots ───── */
  seal() {
    this.noiseBurst({ type: 'bandpass', f0: 700, f1: 2600, q: 2.5, a: 0.01, peak: 0.35, release: 0.12 });
    this.tone({ type: 'triangle', f0: 1400, f1: 900, peak: 0.08, release: 0.1 });
  }
  activate() {
    [1180, 1790, 2650, 3420].forEach((f, i) => this.tone({ type: 'sine', f0: f, f1: f * 0.995, peak: 0.12 / (i + 1), release: 0.9 }));
    this.noiseBurst({ type: 'highpass', f0: 3000, q: 0.7, peak: 0.18, release: 0.18 });
    this.tone({ type: 'sine', f0: 140, f1: 50, peak: 0.35, release: 0.35 });
  }
  deactivate() { this.tone({ type: 'sine', f0: 700, f1: 260, peak: 0.12, release: 0.25 }); }
  cast() {
    this.noiseBurst({ type: 'bandpass', f0: 300, f1: 3000, q: 1, a: 0.12, peak: 0.4, release: 0.25 });
    this.tone({ type: 'sawtooth', f0: 110, f1: 220, a: 0.05, peak: 0.12, release: 0.35 });
  }
  fail() { this.tone({ type: 'square', f0: 180, f1: 120, peak: 0.08, release: 0.25 }); }
  fire(dur = 2.6) {
    this.noiseBurst({ type: 'lowpass', f0: 500, f1: 1800, q: 0.8, a: 0.25, peak: 0.9, hold: dur * 0.5, release: dur * 0.5 });
    this.noiseBurst({ type: 'lowpass', f0: 200, f1: 400, q: 0.5, a: 0.2, peak: 0.8, hold: dur * 0.4, release: dur * 0.6, buffer: this.crackle });
    this.tone({ type: 'sine', f0: 70, f1: 40, a: 0.2, peak: 0.45, hold: dur * 0.4, release: dur * 0.5 });
  }
  whoosh(dur = 0.6, up = true) {
    this.noiseBurst({ type: 'bandpass', f0: up ? 300 : 2400, f1: up ? 2400 : 300, q: 1.4, a: dur * 0.4, peak: 0.5, release: dur * 0.6 });
  }
  poof() {
    this.noiseBurst({ type: 'lowpass', f0: 1400, f1: 200, q: 0.6, a: 0.008, peak: 0.7, release: 0.45 });
    this.tone({ type: 'sine', f0: 160, f1: 55, peak: 0.4, release: 0.35 });
  }
  boom(big = 1) {
    this.tone({ type: 'sine', f0: 95, f1: 28, a: 0.01, peak: 0.8 * big, release: 1.4 });
    this.noiseBurst({ type: 'lowpass', f0: 900, f1: 80, q: 0.5, a: 0.005, peak: 0.8 * big, release: 1.2 });
  }
  rumble(dur = 1.2) {
    this.noiseBurst({ type: 'lowpass', f0: 160, f1: 90, q: 0.7, a: 0.15, peak: 0.9, hold: dur * 0.6, release: dur * 0.4 });
    this.noiseBurst({ type: 'bandpass', f0: 400, f1: 200, q: 1, a: 0.1, peak: 0.3, hold: dur * 0.5, release: dur * 0.4, buffer: this.crackle });
  }
  splash() {
    this.noiseBurst({ type: 'bandpass', f0: 2600, f1: 500, q: 0.6, a: 0.01, peak: 0.7, release: 0.9 });
    this.noiseBurst({ type: 'lowpass', f0: 600, f1: 150, q: 0.6, a: 0.02, peak: 0.6, release: 0.8 });
  }
  water(dur = 3) {
    this.noiseBurst({ type: 'bandpass', f0: 900, f1: 1800, q: 0.9, a: 0.4, peak: 0.45, hold: dur * 0.6, release: dur * 0.3 });
  }
  drone(dur = 6) {
    if (!this.ok) return;
    [55, 55.8, 82.4].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.98, a: 0.8, peak: 0.09, hold: dur - 2, release: 1.2, delay: i * 0.05 }));
    this.noiseBurst({ type: 'bandpass', f0: 200, f1: 1200, q: 4, a: dur * 0.5, peak: 0.2, release: dur * 0.4 });
  }
  shimmer() {
    [880, 1320, 1760, 2640].forEach((f, i) => this.tone({ type: 'sine', f0: f, f1: f * 1.01, a: 0.3, peak: 0.06, hold: 0.6, release: 1.5, delay: i * 0.12 }));
  }
  blackFlame() {
    this.noiseBurst({ type: 'lowpass', f0: 300, f1: 900, q: 0.8, a: 0.05, peak: 0.6, release: 0.7 });
    this.tone({ type: 'sine', f0: 60, f1: 35, peak: 0.4, release: 0.8 });
  }
  vortex(dur = 2.5) {
    this.noiseBurst({ type: 'bandpass', f0: 150, f1: 3000, q: 3, a: dur * 0.8, peak: 0.5, release: dur * 0.2 });
    this.tone({ type: 'sine', f0: 80, f1: 600, a: dur * 0.85, peak: 0.15, release: 0.2 });
  }
  chirp() { // single Chidori-like bird chirp burst, used for one-shots
    for (let i = 0; i < 6; i++) this.tone({ type: 'square', f0: 3200 + Math.random() * 800, f1: 2200, peak: 0.03, release: 0.05, delay: i * 0.05 });
  }

  /* ───── Loops (return a stop function) ───── */
  chidoriLoop() {
    if (!this.ok) return () => {};
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.55, t + 0.15);
    out.connect(this.master);
    const n = this.src(this.crackle, true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.8;
    n.connect(bp).connect(out);
    const n2 = this.src(this.noise, true);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    n2.connect(hp).connect(g2).connect(out);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 23;
    const lfoG = ctx.createGain(); lfoG.gain.value = 900;
    lfo.connect(lfoG).connect(o.frequency);
    const og = ctx.createGain(); og.gain.value = 0.035;
    o.connect(og).connect(out);
    [n, n2, o, lfo].forEach(s => s.start(t));
    return () => {
      const t2 = ctx.currentTime;
      out.gain.cancelScheduledValues(t2);
      out.gain.setValueAtTime(out.gain.value, t2);
      out.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.4);
      [n, n2, o, lfo].forEach(s => s.stop(t2 + 0.45));
    };
  }

  rasenganLoop() {
    if (!this.ok) return { stop() {}, shuriken() {} };
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.4, t + 0.5);
    out.connect(this.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lfoG = ctx.createGain(); lfoG.gain.value = 380;
    lfo.connect(lfoG).connect(lp.frequency);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 92;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 138.5;
    o1.connect(lp); o2.connect(lp);
    const n = this.src(this.noise, true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.value = 0.6;
    n.connect(bp).connect(ng).connect(out);
    lp.connect(out);
    const whistle = ctx.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = 1800;
    const wg = ctx.createGain(); wg.gain.value = 0;
    whistle.connect(wg).connect(out);
    const all = [lfo, o1, o2, n, whistle];
    all.forEach(s => s.start(t));
    return {
      shuriken: () => {
        const t2 = ctx.currentTime;
        lfo.frequency.linearRampToValueAtTime(19, t2 + 0.6);
        o1.frequency.linearRampToValueAtTime(150, t2 + 0.6);
        o2.frequency.linearRampToValueAtTime(226, t2 + 0.6);
        bp.frequency.linearRampToValueAtTime(3200, t2 + 0.6);
        wg.gain.linearRampToValueAtTime(0.05, t2 + 0.6);
        whistle.frequency.linearRampToValueAtTime(2600, t2 + 0.8);
      },
      stop: () => {
        const t2 = ctx.currentTime;
        out.gain.cancelScheduledValues(t2);
        out.gain.setValueAtTime(out.gain.value, t2);
        out.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.5);
        all.forEach(s => s.stop(t2 + 0.55));
      },
    };
  }

  auraLoop() {
    if (!this.ok) return () => {};
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35, t + 0.8);
    out.connect(this.master);
    const n = this.src(this.noise, true);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
    const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(lp.frequency);
    n.connect(lp).connect(out);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
    const og = ctx.createGain(); og.gain.value = 0.4;
    o.connect(og).connect(out);
    [n, lfo, o].forEach(s => s.start(t));
    return () => {
      const t2 = ctx.currentTime;
      out.gain.cancelScheduledValues(t2);
      out.gain.setValueAtTime(out.gain.value, t2);
      out.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.6);
      [n, lfo, o].forEach(s => s.stop(t2 + 0.65));
    };
  }
}
