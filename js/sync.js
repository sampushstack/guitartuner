/* First Frets: the progress that follows a signed-in player between devices, and how two copies combine. */
'use strict';

const Progress = (() => {
  const MAX_DAYS = 90;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  function empty() { return { stars: {}, best: {}, days: [] }; }

  // Keep only the synced fields, cleaned up, so nothing unexpected reaches the cloud.
  function pick(src) {
    const out = empty();
    if (!src || typeof src !== 'object') return out;
    for (const [k, v] of Object.entries(src.stars || {})) if (v === true && k.length <= 12) out.stars[k] = true;
    for (const [k, v] of Object.entries(src.best || {})) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n > 0 && n < 1000 && k.length <= 25) out.best[k] = n;
    }
    out.days = [...new Set((Array.isArray(src.days) ? src.days : []).filter((d) => typeof d === 'string' && DAY.test(d)))]
      .sort()
      .slice(-MAX_DAYS);
    return out;
  }

  // Two devices never lose anything: stars and practice days are combined, best scores keep the higher.
  function merge(a, b) {
    const x = pick(a);
    const y = pick(b);
    const out = empty();
    out.stars = { ...x.stars, ...y.stars };
    for (const k of new Set([...Object.keys(x.best), ...Object.keys(y.best)])) out.best[k] = Math.max(x.best[k] || 0, y.best[k] || 0);
    out.days = [...new Set([...x.days, ...y.days])].sort().slice(-MAX_DAYS);
    return out;
  }

  function equal(a, b) {
    const x = pick(a);
    const y = pick(b);
    const sameMap = (m, n) => Object.keys(m).length === Object.keys(n).length && Object.keys(m).every((k) => m[k] === n[k]);
    return sameMap(x.stars, y.stars) && sameMap(x.best, y.best) && x.days.join() === y.days.join();
  }

  return { empty, pick, merge, equal };
})();

if (typeof module !== 'undefined') module.exports = Progress;
