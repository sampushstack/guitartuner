/* First Frets: sound: plucked-string synth, strums, metronome clicks, microphone, pitch detection. */
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
    // iOS can leave the clock 'suspended' or 'interrupted' (a call, another app); wake it either way.
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    return ctx;
  }

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Karplus-Strong: a burst of noise fed through a short delay line sounds like a plucked string.
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
  onlost: null,
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
    const track = this.stream.getAudioTracks()[0];
    if (track) track.addEventListener('ended', () => { if (this.onlost) this.onlost(); });
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
  let work = null;
  let floor = 0.0003; // running estimate of the room's background noise level
  let warm = [];      // levels heard in the first moments after listening starts

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  // Call when listening starts: the first ~0.2 s is used to measure the room's noise.
  function reset() { floor = 0.0003; warm = []; }

  // Biquad coefficients (RBJ cookbook). A pair of these gives a steep 4th-order slope.
  function biquad(type, f, q, sr) {
    const w = (2 * Math.PI * f) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    const b0 = type === 'hp' ? (1 + cs) / 2 : (1 - cs) / 2;
    const b1 = type === 'hp' ? -(1 + cs) : 1 - cs;
    const a0 = 1 + al;
    return [b0 / a0, b1 / a0, b0 / a0, (-2 * cs) / a0, (1 - al) / a0];
  }
  let coefRate = 0;
  let stages = [];

  // Band-pass to the guitar's range: a steep cut below 70 Hz removes mains hum and rumble
  // (the low E string is 82 Hz), and a gentler cut above 1.2 kHz removes hiss.
  function prefilter(buf, sr, out) {
    if (coefRate !== sr) {
      coefRate = sr;
      stages = [biquad('hp', 70, 0.541, sr), biquad('hp', 70, 1.307, sr), biquad('lp', 1200, 0.707, sr)];
    }
    out.set(buf);
    for (const [b0, b1, b2, a1, a2] of stages) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < out.length; i++) {
        const x = out[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        out[i] = y;
      }
    }
  }

  // ---- Spectrum: picks WHICH note is loudest when two strings ring at once ----
  const FFT_N = 8192;
  const re = new Float32Array(FFT_N);
  const im = new Float32Array(FFT_N);
  const mag = new Float32Array(FFT_N / 2);
  let hann = null;

  // In-place radix-2 FFT of (re, im), length n (a power of two).
  function fft(re, im, n) {
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  function spectrum(x) {
    const n = Math.min(x.length, FFT_N);
    if (!hann || hann.length !== n) {
      hann = new Float32Array(n);
      for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    }
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = x[i] * hann[i];
    fft(re, im, FFT_N);
    for (let k = 0; k < FFT_N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  }

  // YIN difference d(tau) = sum over the window of (x[i] - x[i+tau])^2, computed with FFTs:
  // d = energy(window) + energy(shifted window) - 2 * cross-correlation. Same numbers as the
  // direct double loop, at a fraction of the cost on slower phones.
  const XC_N = 4096;
  const ar = new Float64Array(XC_N), ai = new Float64Array(XC_N);
  const br = new Float64Array(XC_N), bi = new Float64Array(XC_N);
  function yinDifference(x, W, tauMax, out) {
    ar.fill(0); ai.fill(0); br.fill(0); bi.fill(0);
    for (let i = 0; i < W; i++) ar[i] = x[i];
    for (let i = 0; i < W + tauMax + 1; i++) br[i] = x[i];
    fft(ar, ai, XC_N);
    fft(br, bi, XC_N);
    for (let k = 0; k < XC_N; k++) {
      const r = ar[k] * br[k] + ai[k] * bi[k];
      const q = ar[k] * bi[k] - ai[k] * br[k];
      ar[k] = r;
      ai[k] = -q; // conjugate, so a forward FFT acts as the inverse
    }
    fft(ar, ai, XC_N);
    let e0 = 0;
    for (let i = 0; i < W; i++) e0 += x[i] * x[i];
    let et = e0;
    for (let tau = 1; tau <= tauMax; tau++) {
      et += x[tau + W - 1] * x[tau + W - 1] - x[tau - 1] * x[tau - 1];
      out[tau] = Math.max(0, e0 + et - (2 * ar[tau]) / XC_N);
    }
  }

  // Strength of the spectrum near frequency f (largest of the three nearest bins).
  function peakAt(f, bin) {
    const k = Math.round(f / bin);
    if (k < 1 || k + 1 >= mag.length) return 0;
    return Math.max(mag[k - 1], mag[k], mag[k + 1]);
  }

  const WEIGHTS = [1, 0.9, 0.8, 0.7, 0.6];
  // Harmonic sum: the candidate whose overtone series collects the most energy, on a
  // quarter-semitone grid. A candidate needs a real fundamental of its own, which stops
  // octave-down and two strings' shared low "ghost" notes from winning. Returns 0 when nothing fits.
  function strongestNote(sr, lo, hi, focused = false) {
    const bin = sr / FFT_N;
    let top = 0;
    for (let k = Math.floor(lo / bin); k <= Math.ceil((hi * 2) / bin) && k < mag.length; k++) if (mag[k] > top) top = mag[k];
    if (!top) return 0;
    let best = 0, bestScore = 0;
    for (let m = 12 * Math.log2(lo / 440) + 69; m <= 12 * Math.log2(hi / 440) + 69; m += 0.25) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const h1 = peakAt(f, bin), h2 = peakAt(2 * f, bin), h3 = peakAt(3 * f, bin);
      const own = Math.max(h1, h2, h3);
      // Loud enough overall (less strict when the player chose this string), with a real
      // fundamental compared to its own overtones (phone mics turn the low E's fundamental down).
      if (own < (focused ? 0.1 : 0.25) * top || h1 < 0.15 * own) continue;
      let score = 0;
      for (let h = 1; h <= 5; h++) score += WEIGHTS[h - 1] * peakAt(h * f, bin);
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  // YIN pitch detection, limited to the guitar's range (about 65 Hz to 1 kHz).
  // The loudness gate follows the room's noise level, so quiet microphones and fading
  // notes still get through, while background noise alone never produces a reading.
  // `hint` (optional) is the frequency of the string the player chose; the search favours notes near it.
  function detect(buf, sr, hint = 0) {
    if (!work || work.length !== buf.length) work = new Float32Array(buf.length);
    prefilter(buf, sr, work);
    // Skip the filter's start-up ring at the front of the frame when there is room to.
    const W = 2048;
    const tauMax = Math.min(Math.floor(sr / 65), work.length - W - 1);
    const skip = Math.max(0, Math.min(1024, work.length - W - tauMax - 1));
    const x = skip ? work.subarray(skip) : work;
    const level = rms(x);
    if (warm && warm.length < 12) {
      warm.push(level);
      if (warm.length === 12) floor = Math.max(0.00015, Math.min(...warm));
      return { freq: -1, level, gate: 1 };
    }
    const tauMin = Math.floor(sr / 1000);
    if (!diff || diff.length < tauMax + 2) diff = new Float32Array(tauMax + 2);
    yinDifference(x, W, tauMax, diff);
    diff[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau];
      diff[tau] = running ? (diff[tau] * tau) / running : 1;
    }
    // The noise floor is learned only from frames with no musical content, so a string (or two)
    // still ringing from earlier never counts as "background". Strings show sharp peaks in the
    // spectrum; room noise is flat. A note also proves the noise is well below it.
    spectrum(x);
    const bin = sr / FFT_N;
    let peak = 0, sum = 0, count = 0;
    for (let k = Math.ceil(70 / bin); k <= Math.floor(2000 / bin); k++) { sum += mag[k]; count++; if (mag[k] > peak) peak = mag[k]; }
    const tonal = count && peak > 10 * (sum / count);
    if (!tonal) floor = level < floor ? floor * 0.6 + level * 0.4 : floor * 0.97 + level * 0.03;
    else floor = Math.min(floor, level * 0.3);
    floor = Math.max(floor, 0.00015);
    const gate = Math.max(0.0005, floor * 2);
    if (level < gate) return { freq: -1, level, gate };

    // 1. The clean case: one string ringing gives a deep dip at its period.
    let yin = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (diff[t] < 0.15) {
        while (t + 1 <= tauMax && diff[t + 1] < diff[t]) t++;
        yin = t;
        break;
      }
    }

    // 2. The spectrum names the loudest note, so a string still ringing from earlier
    //    can't hide the one just plucked. With a chosen string, look near it first.
    let note = 0;
    if (hint) note = strongestNote(sr, hint / 1.3, hint * 1.3, true);
    if (!note) note = strongestNote(sr, 70, 1000);

    let tau = -1;
    if (yin > 0 && (!note || Math.abs(12 * Math.log2(sr / yin / note)) < 1)) {
      tau = yin; // both methods agree, or the spectrum has no opinion
    } else if (note) {
      // 3. Measure the chosen note precisely: deepest dip within half a semitone of it.
      const lo = Math.max(tauMin, Math.floor(sr / note / 1.03));
      const hi = Math.min(tauMax - 1, Math.ceil((sr / note) * 1.03));
      let best = -1;
      for (let t = lo; t <= hi; t++) if (best < 0 || diff[t] < diff[best]) best = t;
      if (best > 0 && diff[best] < 0.35) tau = best;
    }
    if (tau < 1) return { freq: -1, level, gate };
    const a = diff[tau - 1];
    const b = diff[tau];
    const c = tau + 1 <= tauMax ? diff[tau + 1] : b;
    const denom = a + c - 2 * b;
    const shift = denom ? (a - c) / (2 * denom) : 0;
    return { freq: sr / (tau + shift), level, gate, clarity: 1 - b };
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

  return { detect, rms, reset, addChroma };
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
