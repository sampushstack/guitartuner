/* First Frets — sound: plucked-string synth, strums, metronome clicks, microphone, pitch detection. */
'use strict';

const Sound = (() => {
  let ctx = null;
  let master = null;
  const buffers = new Map();

  function get() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Karplus–Strong: a burst of noise fed through a short delay line sounds like a plucked string.
  function pluckBuffer(midi) {
    if (buffers.has(midi)) return buffers.get(midi);
    const c = get();
    const sr = c.sampleRate;
    const len = Math.floor(sr * 3);
    const buf = c.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / midiToFreq(midi)));
    const ring = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) {
      prev = prev * 0.45 + (Math.random() * 2 - 1) * 0.55; // soften the attack like a thumb, not a pick
      ring[i] = prev;
    }
    const decay = midi < 52 ? 0.9985 : 0.997;
    let idx = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const nxt = idx + 1 === period ? 0 : idx + 1;
      const v = ring[idx];
      out[i] = v;
      ring[idx] = decay * 0.5 * (v + ring[nxt]);
      idx = nxt;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const norm = peak ? 0.6 / peak : 1;
    for (let i = 0; i < len; i++) {
      out[i] *= norm;
      if (i > len - 2000) out[i] *= (len - i) / 2000; // fade the tail to avoid a click
    }
    buffers.set(midi, buf);
    return buf;
  }

  function pluck(midi, at, gain = 0.6) {
    const c = get();
    const src = c.createBufferSource();
    src.buffer = pluckBuffer(midi);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start(at ?? c.currentTime);
    return src;
  }

  function strum(midis, { down = true, at, gain = 0.4, spread = 0.028 } = {}) {
    const c = get();
    const t0 = at ?? c.currentTime + 0.01;
    const order = down ? midis : [...midis].reverse();
    order.forEach((m, i) => pluck(m, t0 + i * spread, gain * (down ? 1 : 0.75)));
  }

  function click(at, accent = false) {
    const c = get();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.28, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + 0.08);
  }

  function chime() {
    const c = get();
    [88, 93].forEach((m, i) => {
      const at = c.currentTime + i * 0.09;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(m);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(g);
      g.connect(master);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  }

  return { get, pluck, strum, click, chime, midiToFreq, get now() { return get().currentTime; } };
})();

const Mic = {
  stream: null,
  wave: null,
  spectrum: null,
  async start() {
    if (this.wave) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('insecure');
      err.name = 'InsecureContext';
      throw err;
    }
    const c = Sound.get();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = c.createMediaStreamSource(this.stream);
    this.wave = c.createAnalyser();
    this.wave.fftSize = 4096;
    this.spectrum = c.createAnalyser();
    this.spectrum.fftSize = 16384;
    this.spectrum.smoothingTimeConstant = 0.4;
    src.connect(this.wave);
    src.connect(this.spectrum);
  },
  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = this.wave = this.spectrum = null;
  },
  get on() { return !!this.wave; },
};

function micErrorMessage(err) {
  if (err && err.name === 'InsecureContext') return 'The microphone only works when this page is opened over https. You can still tune by ear: tap a peg to hear each string.';
  if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) return 'Microphone access is blocked. Allow it from the icon in your browser’s address bar, then try again. Until then, tap a peg to tune by ear.';
  if (err && err.name === 'NotFoundError') return 'No microphone found. Plug one in or use a phone or laptop with a built-in mic.';
  return 'The microphone could not start. Close other apps that might be using it and try again.';
}

const Pitch = (() => {
  let diff = null;

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  // YIN pitch detection, limited to the guitar's range (about 65 Hz to 1 kHz).
  function detect(buf, sr) {
    const level = rms(buf);
    if (level < 0.006) return { freq: -1, level };
    const W = 2048;
    const tauMin = Math.floor(sr / 1000);
    const tauMax = Math.min(Math.floor(sr / 65), buf.length - W - 1);
    if (!diff || diff.length < tauMax + 2) diff = new Float32Array(tauMax + 2);
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const d = buf[i] - buf[i + tau];
        s += d * d;
      }
      running += s;
      diff[tau] = running ? (s * tau) / running : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (diff[t] < 0.15) {
        while (t + 1 <= tauMax && diff[t + 1] < diff[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 1) return { freq: -1, level };
    const a = diff[tau - 1];
    const b = diff[tau];
    const c = tau + 1 <= tauMax ? diff[tau + 1] : b;
    const denom = a + c - 2 * b;
    const shift = denom ? (a - c) / (2 * denom) : 0;
    return { freq: sr / (tau + shift), level, clarity: 1 - b };
  }

  // Adds the strength of each of the 12 notes heard in the spectrum into `out`.
  function addChroma(analyser, sr, out, scratch) {
    analyser.getFloatFrequencyData(scratch);
    const hz = sr / analyser.fftSize;
    const lo = Math.ceil(75 / hz);
    const hi = Math.min(Math.floor(1100 / hz), scratch.length - 2);
    for (let k = lo; k <= hi; k++) {
      const db = scratch[k];
      if (db < -85 || db < scratch[k - 1] || db < scratch[k + 1]) continue;
      const midi = 69 + 12 * Math.log2((k * hz) / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      out[pc] += Math.pow(10, db / 20);
    }
  }

  return { detect, rms, addChroma };
})();

// Look-ahead scheduler: audio is booked slightly ahead on the audio clock, visuals follow in sync.
class Clock {
  constructor(onStep, onVisual) {
    this.onStep = onStep;
    this.onVisual = onVisual;
    this.timer = null;
    this.raf = 0;
    this.queue = [];
  }
  start(bpm) {
    const c = Sound.get();
    this.bpm = bpm;
    this.step = 0;
    this.next = c.currentTime + 0.12;
    this.queue = [];
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    const loop = () => {
      const t = c.currentTime;
      while (this.queue.length && this.queue[0].time <= t) this.onVisual(this.queue.shift().step);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  schedule() {
    const c = Sound.get();
    while (this.next < c.currentTime + 0.12) {
      this.onStep(this.step, this.next);
      this.queue.push({ step: this.step, time: this.next });
      this.next += 60 / this.bpm / 2; // eighth notes
      this.step++;
    }
  }
  stop() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null;
    this.queue = [];
  }
  get running() { return this.timer !== null; }
}
