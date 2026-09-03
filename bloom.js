// Pure Bloom filter logic, no DOM. Loaded by the explainer page and by the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bloom = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // FNV-1a with a seed twist and a final mix. Not crypto, just spread out.
  function hash(str, seed, m) {
    let h = 2166136261 ^ (seed * 0x9E3779B1);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) % m;
  }

  function normalize(w) { return String(w).toLowerCase().trim(); }

  // Expected false positive rate after n inserts: (1 - e^(-kn/m))^k
  function theoreticalFP(m, k, n) {
    return n === 0 ? 0 : Math.pow(1 - Math.exp(-k * n / m), k);
  }

  function create(opts) {
    const m = opts && opts.m != null ? opts.m : 24;
    const k = opts && opts.k != null ? opts.k : 3;
    if (!(m > 0) || !(k > 0)) throw new Error('m and k must be positive');
    const bits = new Array(m).fill(0);
    const added = new Set();

    const positions = w => {
      const key = normalize(w);
      const p = [];
      for (let i = 0; i < k; i++) p.push(hash(key, i + 1, m));
      return p;
    };

    return {
      m, k, bits, added,
      positions,
      add(w) {
        const key = normalize(w);
        if (!key) return false;
        positions(key).forEach(i => { bits[i] = 1; });
        added.add(key);
        return true;
      },
      // returns { maybe, truly, positions, firstDark }
      check(w) {
        const key = normalize(w);
        const pos = positions(key);
        const maybe = pos.every(i => bits[i] === 1);
        return { maybe, truly: added.has(key), positions: pos, firstDark: maybe ? -1 : pos.find(i => !bits[i]) };
      },
      litFraction() { return bits.filter(Boolean).length / m; },
      fpRate() { return theoreticalFP(m, k, added.size); },
      // build a fresh filter with new m/k from the same words
      rebuild(next) {
        const f = create({ m: (next && next.m) || m, k: (next && next.k) || k });
        added.forEach(w => f.add(w));
        return f;
      }
    };
  }

  return { create, hash, theoreticalFP, normalize };
});
