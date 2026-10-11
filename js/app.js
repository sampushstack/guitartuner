/* First Frets: interface: tuner, chord path, change trainer, play-along songs, progress. */
(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CHORD_NAMES = STAGES.flatMap((s) => s.chords);

  /* ================= progress (stored on this device only) ================= */
  const STORE_KEY = 'firstfrets.v1';
  const state = loadState();

  function defaults() {
    return { stars: {}, best: {}, days: [], bigText: false, lefty: false, chord: 'Em7', view: 'tune', song: 'first', trA: 'Em', trB: 'Am' };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* storage unavailable: start fresh */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function dayKey(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function markPracticed() {
    const today = dayKey();
    if (state.days.includes(today)) return;
    state.days = [...state.days, today].slice(-90);
    save();
    renderStats();
  }
  function streak() {
    let off = state.days.includes(dayKey()) ? 0 : 1;
    let n = 0;
    while (state.days.includes(dayKey(off))) { n++; off++; }
    return n;
  }
  function starCount() { return CHORD_NAMES.filter((c) => state.stars[c]).length; }
  function renderStats() {
    $('#stat-stars').textContent = starCount();
    $('#stat-of').textContent = `of ${CHORD_NAMES.length} chords`;
    $('#stat-streak').textContent = streak();
  }

  /* ================= toast + confetti ================= */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  const confetti = (() => {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    let parts = [];
    let raf = 0;
    function resize() {
      canvas.width = innerWidth * devicePixelRatio;
      canvas.height = innerHeight * devicePixelRatio;
    }
    function burst(n = 60, originX = 0.5, originY = 0.4) {
      if (reducedMotion) return;
      resize();
      const css = getComputedStyle(document.documentElement);
      const colors = ['--f1', '--f2', '--f3', '--f4', '--good'].map((v) => css.getPropertyValue(v).trim());
      const edge = css.getPropertyValue('--edge').trim();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 4 + Math.random() * 9;
        parts.push({
          x: originX * canvas.width, y: originY * canvas.height,
          vx: Math.cos(a) * v * devicePixelRatio, vy: (Math.sin(a) * v - 7) * devicePixelRatio,
          r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
          s: (7 + Math.random() * 7) * devicePixelRatio, c: colors[i % colors.length], edge, life: 1,
        });
      }
      if (!raf) tick();
    }
    function pick(p) {
      // a little guitar pick
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, p.life);
      const s = p.s;
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.bezierCurveTo(-s * 0.6, s * 0.4, -s, -s * 0.2, -s * 0.8, -s * 0.6);
      ctx.bezierCurveTo(-s * 0.5, -s, s * 0.5, -s, s * 0.8, -s * 0.6);
      ctx.bezierCurveTo(s, -s * 0.2, s * 0.6, s * 0.4, 0, s);
      ctx.fillStyle = p.c;
      ctx.fill();
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.strokeStyle = p.edge;
      ctx.stroke();
      ctx.restore();
    }
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.vy += 0.35 * devicePixelRatio;
        p.vx *= 0.99;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        p.life -= 0.008;
        pick(p);
      });
      parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 40);
      raf = parts.length ? requestAnimationFrame(tick) : 0;
      if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return { burst };
  })();

  /* ================= chord diagram ================= */
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function chordDiagram(name, label = true) {
    const c = CHORDS[name];
    const svg = svgEl('svg', { viewBox: '0 0 198 224', role: 'img', 'aria-label': describeChord(name) });
    const xOf = (i) => 24 + (state.lefty ? 5 - i : i) * 30;
    const fretY = (k) => 38 + k * 38;
    for (let k = 1; k <= 4; k++) svgEl('line', { class: 'dg-fret', x1: 24, x2: 174, y1: fretY(k), y2: fretY(k) }, svg);
    svgEl('rect', { class: 'dg-nut', x: 22, y: 32, width: 154, height: 7, rx: 2 }, svg);
    for (let i = 0; i < 6; i++) {
      svgEl('line', { class: `dg-string${i < 3 ? ' thick' : ''}`, 'data-s': i, x1: xOf(i), x2: xOf(i), y1: 36, y2: fretY(4) }, svg);
      const f = c.frets[i];
      const x = xOf(i);
      if (f === 0) svgEl('circle', { class: 'dg-open', cx: x, cy: 16, r: 7 }, svg);
      if (f < 0) {
        svgEl('line', { class: 'dg-mute', x1: x - 6, x2: x + 6, y1: 10, y2: 22 }, svg);
        svgEl('line', { class: 'dg-mute', x1: x + 6, x2: x - 6, y1: 10, y2: 22 }, svg);
      }
      if (f > 0) {
        const finger = c.fingers[i] || 1;
        const y = fretY(f) - 19;
        svgEl('circle', { class: `dg-dot f${finger}`, cx: x, cy: y, r: 12.5 }, svg);
        const t = svgEl('text', { class: `dg-num f${finger}`, x, y: y + 1 }, svg);
        t.textContent = finger;
      }
      if (label) {
        const t = svgEl('text', { class: 'dg-label', x, y: 214 }, svg);
        t.textContent = STRINGS[i].name;
      }
    }
    if (label) {
      for (let k = 1; k <= 4; k++) {
        const t = svgEl('text', { class: 'dg-fretno', x: state.lefty ? 4 : 182, y: fretY(k) - 15 }, svg);
        t.textContent = k;
      }
    }
    return svg;
  }

  function describeChord(name) {
    const c = CHORDS[name];
    const parts = c.frets.map((f, i) => {
      const s = `${STRINGS[i].name} string`;
      if (f < 0) return `${s}: don't play`;
      if (f === 0) return `${s}: open`;
      return `${s}: fret ${f}, ${FINGER_NAMES[c.fingers[i]].toLowerCase()} finger`;
    });
    return `${c.full} chord. ${parts.join('; ')}.`;
  }

  function mount(el, name, label) {
    el.replaceChildren(chordDiagram(name, label));
  }

  /* ================= views ================= */
  const VIEWS = ['tune', 'chords', 'trainer', 'songs'];

  function showView(v) {
    if (!VIEWS.includes(v)) v = 'tune';
    $$('.view').forEach((s) => { s.hidden = s.id !== `view-${v}`; });
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
    if (v !== 'tune') stopTuner();
    if (v !== 'chords') stopCheck();
    if (v !== 'trainer') { stopTrainer(); endChallenge(true); }
    if (v !== 'songs') stopSong();
    if (v !== 'tune' && v !== 'chords') Mic.stop();
    state.view = v;
    save();
    try { history.replaceState(null, '', `#${v}`); } catch (e) { /* sandboxed */ }
  }

  $$('[data-view]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    showView(b.dataset.view);
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }));

  /* ================= preferences ================= */
  function applyPrefs() {
    document.documentElement.classList.toggle('big-text', state.bigText);
    document.documentElement.classList.toggle('lefty', state.lefty);
    $('#pref-big').setAttribute('aria-pressed', String(state.bigText));
    $('#pref-lefty').setAttribute('aria-pressed', String(state.lefty));
  }
  $('#pref-big').addEventListener('click', () => { state.bigText = !state.bigText; save(); applyPrefs(); });
  $('#pref-lefty').addEventListener('click', () => {
    state.lefty = !state.lefty;
    save();
    applyPrefs();
    renderChord();
    renderTrainer();
    renderSong();
    toast(state.lefty ? 'Chord pictures flipped for left-handed playing' : 'Chord pictures set for right-handed playing');
  });

  /* ================= Tuner ================= */
  const tuner = {
    on: false, raf: 0, target: null, history: [], quiet: 0,
    goodSince: 0, current: -1, tuned: new Set(), buf: new Float32Array(4096),
  };
  const POSTS = [ // headstock posts: [x, y] for strings E A D G B e
    [54, 214], [54, 140], [54, 66], [106, 66], [106, 140], [106, 214],
  ];

  function buildHeadstock() {
    const strG = $('#hs-strings');
    const postG = $('#hs-posts');
    for (let i = 0; i < 6; i++) {
      const nx = 56 + i * 9.6;
      const [px, py] = POSTS[i];
      const line = svgEl('polyline', { points: `${px},${py} ${nx},290 ${nx},330`, fill: 'none', 'data-s': i }, strG);
      if (i < 3) line.classList.add('wound');
      svgEl('circle', { cx: px, cy: py, r: 7 }, postG);
    }

    const left = $('#pegs-left');
    const right = $('#pegs-right');
    [[2, left], [1, left], [0, left], [3, right], [4, right], [5, right]].forEach(([i, col]) => {
      const s = STRINGS[i];
      const b = document.createElement('button');
      b.className = 'peg';
      b.dataset.s = i;
      b.setAttribute('aria-label', `${s.name} string, number ${s.num}. Play its note and tune this string.`);
      b.innerHTML = `<span class="peg-letter">${s.name}</span><span class="peg-sub">${s.nick}</span>`;
      b.addEventListener('click', () => selectString(i, true));
      col.appendChild(b);
    });

    const ticks = $('#g-ticks');
    for (let cents = -50; cents <= 50; cents += 5) {
      const major = cents % 25 === 0;
      const a = (cents * 1.2 * Math.PI) / 180;
      const r1 = major ? 86 : 92;
      const r2 = 102;
      svgEl('line', {
        class: `g-tick${major ? ' major' : ''}`,
        x1: 150 + r1 * Math.sin(a), y1: 150 - r1 * Math.cos(a),
        x2: 150 + r2 * Math.sin(a), y2: 150 - r2 * Math.cos(a),
      }, ticks);
      if (major && cents !== 0) {
        const t = svgEl('text', { class: 'g-label', x: 150 + 72 * Math.sin(a), y: 154 - 72 * Math.cos(a), 'text-anchor': 'middle' }, ticks);
        t.textContent = cents > 0 ? `+${cents}` : String(cents);
      }
    }
  }

  function selectString(i, play) {
    tuner.target = i;
    $('#auto-string').checked = false;
    if (play) {
      Sound.pluck(OPEN_STRINGS[i]);
      tuner.history = []; // ignore our own reference note for a moment
      tuner.mutedUntil = performance.now() + 900;
    }
    highlightString(i);
    const s = STRINGS[i];
    $('#target-label').textContent = `Tuning the ${s.name} string (${s.num})`;
    if (!tuner.on) setMsg(`That’s how the ${s.name} string should sound. Press “Start listening” to compare yours.`);
  }

  function highlightString(i) {
    $$('.peg').forEach((p) => p.classList.toggle('target', Number(p.dataset.s) === i));
    $$('#hs-strings polyline').forEach((p) => p.classList.toggle('active', Number(p.dataset.s) === i));
  }

  $('#auto-string').addEventListener('change', (e) => {
    if (e.target.checked) {
      tuner.target = null;
      highlightString(-1);
      $('#target-label').textContent = 'Listening for any string';
    } else if (tuner.target === null) {
      selectString(tuner.current >= 0 ? tuner.current : 0, false);
    }
  });

  function setMsg(text) { $('#tune-msg').textContent = text; }
  function setState(s) {
    $('#readout').dataset.state = s;
    if (s === 'idle') {
      $('#note-name').innerHTML = '<i class="ph-bold ph-ear" aria-hidden="true"></i>';
      $('#note-oct').textContent = '';
      $('#hz').textContent = '0.0 Hz';
      $('#cents').textContent = '0 cents';
    }
  }
  function setNeedle(cents) {
    const c = Math.max(-50, Math.min(50, cents));
    $('#needle').style.transform = `rotate(${c * 1.2}deg)`;
  }

  async function startTuner() {
    try {
      await Mic.start();
    } catch (err) {
      setMsg(micErrorMessage(err));
      return;
    }
    tuner.on = true;
    tuner.history = [];
    tuner.pending = 0;
    Pitch.reset();
    $('#mic-label').textContent = 'Stop listening';
    $('#mic-btn').classList.add('is-on');
    setMsg('Pluck one string and let it ring…');
    markPracticed();
    tunerLoop();
  }

  function stopTuner() {
    if (!tuner.on) return;
    tuner.on = false;
    cancelAnimationFrame(tuner.raf);
    $('#mic-label').textContent = 'Start listening';
    $('#mic-btn').classList.remove('is-on');
    setState('idle');
    setNeedle(0);
    setMsg('Paused. Press “Start listening” when you’re ready.');
  }

  $('#mic-btn').addEventListener('click', () => (tuner.on ? (stopTuner(), Mic.stop()) : startTuner()));

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  // Ignore one-off stray readings: a new note must be heard twice in a row before the needle moves to it.
  function acceptReading(f) {
    const h = tuner.history;
    const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));
    if (h.length && cents(f, median(h)) > 80) {
      if (tuner.pending && cents(f, tuner.pending) < 80) {
        tuner.history = [tuner.pending, f];
        tuner.pending = 0;
        return true;
      }
      tuner.pending = f;
      return false;
    }
    tuner.pending = 0;
    h.push(f);
    if (h.length > 7) h.shift();
    return true;
  }

  // Live microphone level, so players can see the tuner is hearing them.
  function showLevel(res) {
    const db = 20 * Math.log10(Math.max(res.level || 0, 1e-5) / 0.0002);
    const bar = $('#mic-level');
    bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, db / 50)).toFixed(3)})`;
    bar.classList.toggle('heard', (res.level || 0) >= (res.gate || 1));
  }

  function tunerLoop() {
    if (!tuner.on || !Mic.wave) return;
    Mic.wave.getFloatTimeDomainData(tuner.buf);
    const now = performance.now();
    const hint = tuner.target === null ? 0 : Sound.midiToFreq(OPEN_STRINGS[tuner.target]);
    const res = now < (tuner.mutedUntil || 0) ? { freq: -1, level: 0, gate: 1 } : Pitch.detect(tuner.buf, Sound.get().sampleRate, hint);
    showLevel(res);
    if (res.freq > 0 && acceptReading(res.freq)) {
      tuner.quiet = 0;
      if (tuner.history.length >= 2) showPitch(median(tuner.history), now);
    } else if (++tuner.quiet > 90) {
      tuner.history = [];
      tuner.goodSince = 0;
      if ($('#readout').dataset.state !== 'idle') {
        setState('idle');
        setNeedle(0);
        setMsg('Pluck one string and let it ring…');
      }
    }
    tuner.raf = requestAnimationFrame(tunerLoop);
  }

  function showPitch(freq, now) {
    const midiF = 69 + 12 * Math.log2(freq / 440);
    let s = tuner.target;
    if (s === null) {
      s = 0;
      OPEN_STRINGS.forEach((m, i) => { if (Math.abs(midiF - m) < Math.abs(midiF - OPEN_STRINGS[s])) s = i; });
      if (s !== tuner.current) highlightString(s);
      $('#target-label').textContent = `Sounds like the ${STRINGS[s].name} string (${STRINGS[s].num})`;
    }
    tuner.current = s;
    const cents = (midiF - OPEN_STRINGS[s]) * 100;
    const nearest = Math.round(midiF);
    $('#note-name').textContent = NOTE_NAMES[((nearest % 12) + 12) % 12];
    $('#note-oct').textContent = Math.floor(nearest / 12) - 1;
    $('#hz').textContent = `${freq.toFixed(1)} Hz`;
    const rc = Math.round(cents);
    $('#cents').textContent = `${rc > 0 ? '+' : rc < 0 ? '−' : ''}${Math.abs(rc)} cents`;
    setNeedle(cents);

    const name = STRINGS[s].name;
    if (Math.abs(cents) <= 5) {
      setState('good');
      setMsg(`${name} is in tune. Nice work.`);
      if (!tuner.goodSince) tuner.goodSince = now;
      if (now - tuner.goodSince > 700 && !tuner.tuned.has(s)) stringTuned(s);
    } else {
      tuner.goodSince = 0;
      const low = cents < 0;
      setState(low ? 'low' : 'high');
      if (Math.abs(cents) > 150) setMsg(low ? `Way too low for ${name}. Tighten the peg a few turns.` : `Way too high for ${name}. Loosen the peg a few turns.`);
      else if (Math.abs(cents) > 25) setMsg(low ? `Too low. Tighten the ${name} peg so the sound goes up.` : `Too high. Loosen the ${name} peg so the sound goes down.`);
      else setMsg(low ? 'Almost there. A tiny bit low, so tighten very slowly.' : 'Almost there. A tiny bit high, so loosen a touch, then come back up.');
    }
  }

  function stringTuned(i) {
    tuner.tuned.add(i);
    $(`.peg[data-s="${i}"]`).insertAdjacentHTML('beforeend', '<i class="ph-fill ph-check-circle peg-done" aria-hidden="true"></i>');
    $(`.peg[data-s="${i}"]`).setAttribute('aria-label', `${STRINGS[i].name} string, in tune. Play its note again.`);
    $(`#hs-strings polyline[data-s="${i}"]`).classList.add('done');
    Sound.chime();
    const rect = $(`.peg[data-s="${i}"]`).getBoundingClientRect();
    confetti.burst(18, (rect.left + rect.width / 2) / innerWidth, (rect.top + rect.height / 2) / innerHeight);
    if (tuner.tuned.size === 6) {
      setMsg('All six strings are in tune. Time to play.');
      $('#to-chords').hidden = false;
      confetti.burst(120);
    } else {
      toast(`${STRINGS[i].name} string tuned. ${6 - tuner.tuned.size} to go.`);
    }
  }

  /* ================= Chords ================= */
  function renderPath() {
    const path = $('#path');
    path.replaceChildren();
    STAGES.forEach((stage) => {
      const li = document.createElement('li');
      li.className = 'stage';
      if (stage.chords.includes(state.chord)) li.classList.add('current');
      const done = stage.chords.filter((c) => state.stars[c]).length;
      const complete = done === stage.chords.length;
      if (complete) li.classList.add('done');
      li.innerHTML = `
        <span class="stage-node" aria-hidden="true">${complete ? '<i class="ph-bold ph-check"></i>' : ''}</span>
        <h3 class="stage-title">${stage.title}</h3>
        <p class="stage-blurb">${stage.blurb}</p>
        <div class="stage-chips"></div>
        <p class="stage-count">${complete ? 'All starred' : `${done} of ${stage.chords.length} starred`}</p>`;
      const chips = $('.stage-chips', li);
      stage.chords.forEach((name) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = name;
        b.setAttribute('aria-pressed', String(name === state.chord));
        if (state.stars[name]) {
          b.insertAdjacentHTML('beforeend', '<i class="ph-fill ph-star" aria-hidden="true"></i>');
          b.setAttribute('aria-label', `${name}, starred`);
        }
        b.addEventListener('click', () => { state.chord = name; save(); stopCheck(); renderChord(); renderPath(); });
        chips.appendChild(b);
      });
      path.appendChild(li);
    });
  }

  function renderChord() {
    const name = state.chord;
    const c = CHORDS[name];
    $('#cd-name').textContent = name;
    $('#cd-full').textContent = c.full;
    $('#cd-level').textContent = ['', 'Easy', 'Getting there', 'A good stretch'][c.level];
    $('#cd-tip').textContent = c.tip;
    mount($('#cd-diagram'), name, true);
    const starred = !!state.stars[name];
    $('#cd-star').setAttribute('aria-pressed', String(starred));
    $('#cd-star-label').textContent = starred ? 'Starred: you can play this one' : 'I can play this one';
    $('.hand-side').textContent = state.lefty ? 'right' : 'left';
  }

  function setStar(name, on) {
    if (on) state.stars[name] = true; else delete state.stars[name];
    save();
    renderStats();
    renderChord();
    renderPath();
    renderSongList();
    const stage = STAGES.find((s) => s.chords.includes(name));
    if (on && stage.chords.every((c) => state.stars[c])) {
      toast(`Every chord in “${stage.title}” is starred.`);
      confetti.burst(100);
    }
  }

  $('#cd-star').addEventListener('click', () => {
    const on = !state.stars[state.chord];
    setStar(state.chord, on);
    if (on) {
      markPracticed();
      const r = $('#cd-star').getBoundingClientRect();
      confetti.burst(30, (r.left + r.width / 2) / innerWidth, r.top / innerHeight);
    }
  });

  $('#cd-strum').addEventListener('click', () => { Sound.strum(chordNotes(state.chord), { gain: 0.5 }); markPracticed(); });

  $('#cd-arp').addEventListener('click', () => {
    const c = CHORDS[state.chord];
    const t0 = Sound.now + 0.05;
    let k = 0;
    c.frets.forEach((f, i) => {
      if (f < 0) return;
      const delay = k * 0.42;
      Sound.pluck(OPEN_STRINGS[i] + f, t0 + delay, 0.55);
      setTimeout(() => {
        const line = $(`#cd-diagram .dg-string[data-s="${i}"]`);
        if (!line) return;
        line.classList.add('ring');
        setTimeout(() => line.classList.remove('ring'), 380);
      }, delay * 1000 + 50);
      k++;
    });
  });

  // ---- "Check my chord": listen, collect which notes ring, compare with the chord
  const check = { on: false, raf: 0, chroma: new Float32Array(12), scratch: null, voiced: 0, t0: 0 };
  const NEEDED_FRAMES = 40;

  async function startCheck() {
    const panel = $('#check-panel');
    panel.hidden = false;
    panel.classList.remove('pass');
    $('#check-notes').replaceChildren();
    $('#check-advice').textContent = '';
    try {
      await Mic.start();
    } catch (err) {
      $('#check-status').textContent = 'Can’t reach the microphone';
      $('#check-advice').textContent = micErrorMessage(err);
      return;
    }
    check.on = true;
    check.chroma.fill(0);
    check.voiced = 0;
    check.t0 = performance.now();
    Pitch.reset();
    check.scratch = new Float32Array(Mic.spectrum.frequencyBinCount);
    check.wave = new Float32Array(Mic.wave.fftSize);
    $('#check-status').textContent = `Strum ${state.chord} now and let it ring…`;
    $('#check-meter').style.width = '0%';
    $('#cd-check').classList.add('is-on');
    markPracticed();
    checkLoop();
  }

  function stopCheck() {
    check.on = false;
    cancelAnimationFrame(check.raf);
    $('#cd-check').classList.remove('is-on');
  }

  function checkLoop() {
    if (!check.on || !Mic.wave) return;
    Mic.wave.getFloatTimeDomainData(check.wave);
    const heard = Pitch.detect(check.wave, Sound.get().sampleRate);
    if (heard.level >= heard.gate * 1.5) {
      check.voiced++;
      Pitch.addChroma(Mic.spectrum, Sound.get().sampleRate, check.chroma, check.scratch);
      $('#check-meter').style.width = `${Math.min(100, (check.voiced / NEEDED_FRAMES) * 100)}%`;
      if (check.voiced === 6) $('#check-status').textContent = 'Listening… keep it ringing';
    }
    if (check.voiced >= NEEDED_FRAMES) { stopCheck(); judgeChord(); return; }
    if (performance.now() - check.t0 > 9000) {
      stopCheck();
      $('#check-status').textContent = 'We didn’t hear a strum';
      $('#check-advice').textContent = 'Move a little closer to your device and strum firmly. Then press “Check my chord” again.';
      return;
    }
    check.raf = requestAnimationFrame(checkLoop);
  }

  function ordinal(n) { return ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][n]; }

  function judgeChord() {
    const name = state.chord;
    const c = CHORDS[name];
    const pcs = chordPitchClasses(name);
    const ch = check.chroma;
    const max = Math.max(...ch) || 1;
    const total = ch.reduce((a, b) => a + b, 0) || 1;
    const inChord = pcs.reduce((a, pc) => a + ch[pc], 0) / total;
    const levels = pcs.map((pc) => ({ pc, lvl: ch[pc] / max }));
    const weak = levels.filter((l) => l.lvl < 0.12).sort((a, b) => a.lvl - b.lvl);
    const extras = [...Array(12).keys()].filter((pc) => !pcs.includes(pc) && ch[pc] / max > 0.45).sort((a, b) => ch[b] - ch[a]);

    const notes = $('#check-notes');
    notes.replaceChildren();
    levels.forEach(({ pc, lvl }) => notes.appendChild(bubble(NOTE_NAMES[pc], lvl, lvl < 0.12 ? 'weak' : '', 'in chord')));
    extras.slice(0, 2).forEach((pc) => notes.appendChild(bubble(NOTE_NAMES[pc], ch[pc] / max, 'extra weak', 'extra')));

    const pass = inChord >= 0.62 && weak.length === 0 && extras.length === 0;
    const panel = $('#check-panel');
    if (pass) {
      panel.classList.add('pass');
      $('#check-status').textContent = `That’s a clean ${name}.`;
      $('#check-advice').textContent = state.stars[name] ? 'Still sounding great. Try switching to it in the Change trainer.' : 'Every note rang out. We’ve given you a star for it.';
      if (!state.stars[name]) setStar(name, true);
      Sound.chime();
      confetti.burst(80);
      return;
    }
    $('#check-status').textContent = 'Almost. Let’s fix one thing.';
    let advice = '';
    if (weak.length) {
      const pc = weak[0].pc;
      const strs = c.frets.map((f, i) => ({ f, i })).filter(({ f, i }) => f >= 0 && (OPEN_STRINGS[i] + f) % 12 === pc);
      const fretted = strs.find((s) => s.f > 0);
      if (fretted) {
        const s = STRINGS[fretted.i];
        advice = `The ${NOTE_NAMES[pc]} note is too quiet. Press the ${ordinal(s.num)} string (${s.name}) firmly with your ${FINGER_NAMES[c.fingers[fretted.i]].toLowerCase()} finger, right behind the fret.`;
      } else if (strs.length) {
        const s = STRINGS[strs[0].i];
        advice = `The ${NOTE_NAMES[pc]} note is too quiet. The open ${ordinal(s.num)} string (${s.name}) may be touched by a finger. Arch your fingers so it can ring.`;
      }
    } else if (extras.length) {
      const muted = c.frets.some((f) => f < 0);
      advice = `We also hear ${NOTE_NAMES[extras[0]]}, which isn’t in ${name}. ${muted ? 'Make sure you skip the strings marked X. ' : ''}Check each finger sits on the right fret.`;
    } else {
      advice = 'Some strings are buzzing or muffled. Pluck one string at a time to find the quiet one, then strum again.';
    }
    $('#check-advice').textContent = advice;
  }

  function bubble(label, lvl, cls, what) {
    const d = document.createElement('div');
    d.className = `note-bubble ${cls}`;
    d.style.setProperty('--lvl', Math.min(1, lvl).toFixed(2));
    d.innerHTML = `<i>${label}</i><span>${what}</span>`;
    return d;
  }

  $('#cd-check').addEventListener('click', () => (check.on ? stopCheck() : startCheck()));

  function setPlayButton(btn, playing, label) {
    btn.innerHTML = `<i class="ph-fill ph-${playing ? 'stop' : 'play'}" aria-hidden="true"></i><span>${label}</span>`;
  }

  /* ================= Change trainer ================= */
  const tr = { beats: 4 };
  const trainerClock = new Clock(trainerStep, trainerVisual);

  function fillSelect(sel, value) {
    sel.replaceChildren();
    STAGES.forEach((stage, si) => {
      const g = document.createElement('optgroup');
      g.label = stage.title;
      stage.chords.forEach((name) => {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = `${name} (${CHORDS[name].full})`;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
    sel.value = value;
  }

  function trChord(beat) { return Math.floor(beat / tr.beats) % 2 ? state.trB : state.trA; }

  function renderTrainer(beat = 0) {
    const now = trChord(beat);
    const next = trChord(beat + tr.beats);
    $('#tr-now-name').textContent = now;
    $('#tr-next-name').textContent = next;
    mount($('#tr-now'), now, true);
    mount($('#tr-next'), next, false);
    const dots = $('#tr-beats');
    if (dots.children.length !== tr.beats) {
      dots.replaceChildren();
      for (let i = 0; i < tr.beats; i++) {
        const d = document.createElement('span');
        d.className = `beat${i === 0 ? ' first' : ''}`;
        dots.appendChild(d);
      }
    }
    renderChallengeBest();
  }

  function trainerStep(step, time) {
    if (step % 2) return;
    const beat = step / 2;
    const pos = beat % tr.beats;
    Sound.click(time, pos === 0);
    if ($('#tr-strum').checked) Sound.strum(chordNotes(trChord(beat)), { at: time + 0.004, gain: pos === 0 ? 0.32 : 0.2 });
  }

  function trainerVisual(step) {
    if (step % 2) return;
    const beat = step / 2;
    const pos = beat % tr.beats;
    $$('#tr-beats .beat').forEach((d, i) => d.classList.toggle('on', i === pos));
    if (pos === 0) {
      renderTrainer(beat);
      const now = $('.trainer .now');
      now.classList.remove('flash');
      void now.offsetWidth;
      now.classList.add('flash');
    }
  }

  function startTrainer() {
    trainerClock.start(Number($('#tr-bpm').value));
    setPlayButton($('#tr-go'), true, 'Stop');
    $('#tr-go').classList.add('is-on');
    markPracticed();
  }
  function stopTrainer() {
    if (!trainerClock.running) return;
    trainerClock.stop();
    setPlayButton($('#tr-go'), false, 'Start');
    $('#tr-go').classList.remove('is-on');
    $$('#tr-beats .beat').forEach((d) => d.classList.remove('on'));
    renderTrainer(0);
  }

  $('#tr-go').addEventListener('click', () => (trainerClock.running ? stopTrainer() : startTrainer()));
  $('#tr-a').addEventListener('change', (e) => { state.trA = e.target.value; save(); renderTrainer(); });
  $('#tr-b').addEventListener('change', (e) => { state.trB = e.target.value; save(); renderTrainer(); });
  $('#tr-swap').addEventListener('click', () => {
    [state.trA, state.trB] = [state.trB, state.trA];
    $('#tr-a').value = state.trA;
    $('#tr-b').value = state.trB;
    save();
    renderTrainer();
  });
  $('#tr-bpm').addEventListener('input', (e) => {
    $('#tr-bpm-out').textContent = e.target.value;
    trainerClock.bpm = Number(e.target.value);
  });
  $$('input[name="tr-beats"]').forEach((r) => r.addEventListener('change', () => {
    tr.beats = Number(r.value);
    const wasRunning = trainerClock.running;
    stopTrainer();
    renderTrainer();
    if (wasRunning) startTrainer();
  }));

  // ---- One-minute changes
  const ch = { phase: 'idle', count: 0, end: 0, timer: 0 };
  const pairKey = () => [state.trA, state.trB].sort().join('|');

  function renderChallengeBest() {
    const best = state.best[pairKey()];
    $('#ch-best').textContent = best ? `${best}` : 'none yet';
    $('#ch-best').classList.toggle('mono', !!best);
  }

  function tapChallenge() {
    if (ch.phase === 'cooldown') return;
    if (ch.phase === 'idle') {
      ch.phase = 'running';
      ch.count = 0;
      ch.end = performance.now() + 60000;
      $('#ch-tap').classList.add('live');
      $('#ch-tap-label').textContent = 'Tap each time you change';
      $('#ch-count').textContent = '0';
      Sound.click(Sound.now + 0.01, true);
      markPracticed();
      ch.timer = setInterval(tickChallenge, 200);
      tickChallenge();
      return;
    }
    ch.count++;
    $('#ch-count').textContent = ch.count;
  }

  function tickChallenge() {
    const left = Math.max(0, ch.end - performance.now());
    const secs = Math.ceil(left / 1000);
    $('#ch-timer').textContent = `0:${String(secs).padStart(2, '0')}`.replace('0:60', '1:00');
    if (left <= 0) endChallenge(false);
  }

  function endChallenge(silent) {
    if (ch.phase !== 'running') return;
    clearInterval(ch.timer);
    $('#ch-tap').classList.remove('live');
    $('#ch-timer').textContent = '1:00';
    if (silent) {
      ch.phase = 'idle';
      $('#ch-tap-label').textContent = 'Start the minute';
      return;
    }
    const key = pairKey();
    const prev = state.best[key] || 0;
    if (ch.count > prev) {
      state.best[key] = ch.count;
      save();
      if (prev) { toast(`New best: ${ch.count} changes, up from ${prev}.`); confetti.burst(90); } else toast(`First score: ${ch.count} changes. Try to beat it tomorrow.`);
    } else {
      toast(`${ch.count} changes. Your best is ${prev}.`);
    }
    Sound.chime();
    renderChallengeBest();
    ch.phase = 'cooldown';
    $('#ch-tap-label').textContent = 'Time’s up';
    setTimeout(() => { ch.phase = 'idle'; $('#ch-tap-label').textContent = 'Try again'; }, 1500);
  }

  $('#ch-tap').addEventListener('click', tapChallenge);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || state.view !== 'trainer' || ch.phase !== 'running') return;
    if (e.target.closest('input, select, button:not(#ch-tap)')) return;
    e.preventDefault();
    tapChallenge();
  });

  /* ================= Songs ================= */
  const COUNT_IN = 8; // eighth-note steps = four beats
  const songClock = new Clock(songStep, songVisual);
  const song = () => SONGS.find((s) => s.id === state.song) || SONGS[0];

  function renderSongList() {
    const list = $('#song-list');
    list.replaceChildren();
    SONGS.forEach((s) => {
      const uniq = [...new Set(s.bars)];
      const known = uniq.filter((c) => state.stars[c]).length;
      const li = document.createElement('li');
      li.innerHTML = `<button class="song" aria-pressed="${s.id === state.song}">
        <span class="song-title">${s.title}</span>
        <span class="song-chords">${uniq.join('  ')}</span>
        <span class="song-meta">${s.vibe}</span>
        ${known === uniq.length ? '<span class="song-ready"><i class="ph-fill ph-star" aria-hidden="true"></i>You know every chord</span>' : `<span class="song-meta">${known} of ${uniq.length} chords starred</span>`}
      </button>`;
      $('button', li).addEventListener('click', () => {
        stopSong();
        state.song = s.id;
        save();
        $('#pl-bpm').value = s.bpm;
        $('#pl-bpm-out').textContent = s.bpm;
        renderSongList();
        renderSong();
      });
      list.appendChild(li);
    });
  }

  function renderSong() {
    const s = song();
    $('#pl-title').textContent = s.title;
    $('#pl-note').textContent = s.note;
    const bars = $('#pl-bars');
    bars.replaceChildren();
    s.bars.forEach((name, i) => {
      const b = document.createElement('div');
      b.className = 'bar';
      b.dataset.i = i;
      b.innerHTML = `<span class="bar-name">${name}</span><div class="diagram"></div>`;
      mount($('.diagram', b), name, false);
      bars.appendChild(b);
    });
    const strums = $('#pl-strums');
    strums.replaceChildren();
    s.pattern.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = `strum ${p === 'D' ? 'down' : p === 'U' ? 'up' : 'rest'}`;
      d.dataset.i = i;
      d.innerHTML = p ? `<i class="ph-bold ph-arrow-${p === 'D' ? 'down' : 'up'}" aria-hidden="true"></i>` : '';
      d.setAttribute('aria-label', p === 'D' ? 'down' : p === 'U' ? 'up' : 'miss');
      strums.appendChild(d);
    });
  }

  function songStep(step, time) {
    if (step < COUNT_IN) {
      if (step % 2 === 0) Sound.click(time, step === 0);
      return;
    }
    const s = song();
    const k = step - COUNT_IN;
    const slot = k % 8;
    const bar = Math.floor(k / 8) % s.bars.length;
    if (slot % 2 === 0) Sound.click(time, slot === 0);
    const p = s.pattern[slot];
    if ($('#pl-backing').checked && p) Sound.strum(chordNotes(s.bars[bar]), { at: time + 0.004, down: p === 'D', gain: 0.3 });
  }

  function songVisual(step) {
    const count = $('#pl-count');
    if (step < COUNT_IN) {
      if (step % 2 === 0) count.textContent = step / 2 + 1;
      return;
    }
    if (step === COUNT_IN) count.textContent = '';
    const s = song();
    const k = step - COUNT_IN;
    const slot = k % 8;
    const bar = Math.floor(k / 8) % s.bars.length;
    $$('#pl-bars .bar').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === bar));
    $$('#pl-strums .strum').forEach((d) => d.classList.toggle('on', Number(d.dataset.i) === slot));
  }

  function startSong() {
    songClock.start(Number($('#pl-bpm').value));
    setPlayButton($('#pl-go'), true, 'Stop');
    $('#pl-go').classList.add('is-on');
    markPracticed();
  }
  function stopSong() {
    if (!songClock.running) return;
    songClock.stop();
    setPlayButton($('#pl-go'), false, 'Play');
    $('#pl-go').classList.remove('is-on');
    $('#pl-count').textContent = '';
    $$('#pl-bars .bar, #pl-strums .strum').forEach((d) => d.classList.remove('on'));
  }

  $('#pl-go').addEventListener('click', () => (songClock.running ? stopSong() : startSong()));
  $('#pl-bpm').addEventListener('input', (e) => {
    $('#pl-bpm-out').textContent = e.target.value;
    songClock.bpm = Number(e.target.value);
  });

  /* ================= boot ================= */
  if (!CHORDS[state.chord]) state.chord = 'Em7';
  if (!CHORDS[state.trA]) state.trA = 'Em';
  if (!CHORDS[state.trB]) state.trB = 'Am';

  applyPrefs();
  buildHeadstock();
  renderStats();
  renderPath();
  renderChord();
  fillSelect($('#tr-a'), state.trA);
  fillSelect($('#tr-b'), state.trB);
  renderTrainer();
  renderSongList();
  renderSong();
  $('#pl-bpm').value = song().bpm;
  $('#pl-bpm-out').textContent = song().bpm;

  const fromHash = location.hash.slice(1);
  showView(VIEWS.includes(fromHash) ? fromHash : state.view);

  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (VIEWS.includes(v) && v !== state.view) showView(v);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopTrainer(); stopSong(); }
    else if (tuner.on || check.on) Sound.get();
  });

  Mic.onlost = () => {
    const wasTuning = tuner.on;
    stopTuner();
    stopCheck();
    Mic.stop();
    const msg = 'The microphone stopped, maybe because another app took it. Press “Start listening” to try again.';
    if (wasTuning) setMsg(msg); else toast(msg);
  };
})();
