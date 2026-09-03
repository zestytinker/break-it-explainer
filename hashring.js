// Pure consistent-hashing logic, no DOM. Loaded by the explainer page and by the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HashRing = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Same FNV-1a mix as bloom.js. Returns a 32-bit unsigned int.
  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }
  // Position on the ring as a fraction in [0, 1).
  function pos(str) { return hash32(str) / 4294967296; }

  function create(opts) {
    const vnodes = opts && opts.vnodes != null ? opts.vnodes : 1;
    if (!(vnodes >= 1)) throw new Error('vnodes must be at least 1');
    const servers = [];       // insertion order matters for the naive mod-N comparison
    const keys = new Set();

    // Sorted pins: each server contributes `vnodes` pins.
    const ring = () => {
      const pins = [];
      servers.forEach(s => { for (let i = 0; i < vnodes; i++) pins.push({ pos: pos(s + '#' + i), server: s, vnode: i }); });
      return pins.sort((a, b) => a.pos - b.pos);
    };

    // Walk clockwise to the next pin; wrap to the first one.
    const owner = key => {
      const pins = ring();
      if (!pins.length) return null;
      const p = pos(key);
      const hit = pins.find(pin => pin.pos > p);
      return (hit || pins[0]).server;
    };

    // The naive scheme this replaces: hash(key) mod number of servers.
    const modOwner = key => servers.length ? servers[hash32(key) % servers.length] : null;

    const assignment = fn => { const m = new Map(); keys.forEach(k => m.set(k, fn(k))); return m; };
    const loads = () => {
      const m = new Map(servers.map(s => [s, 0]));
      keys.forEach(k => { const o = owner(k); if (o !== null) m.set(o, m.get(o) + 1); });
      return m;
    };

    return {
      vnodes, servers, keys, ring, owner, modOwner, loads,
      snapshot() { return { ring: assignment(owner), mod: assignment(modOwner) }; },
      addServer(name) { if (!name || servers.includes(name)) return false; servers.push(name); return true; },
      removeServer(name) { const i = servers.indexOf(name); if (i < 0) return false; servers.splice(i, 1); return true; },
      addKey(k) { const key = String(k).trim(); if (!key) return false; keys.add(key); return true; },
      rebuild(next) {
        const f = create({ vnodes: (next && next.vnodes) || vnodes });
        servers.forEach(s => f.addServer(s));
        keys.forEach(k => f.addKey(k));
        return f;
      }
    };
  }

  // Fraction of keys (present in both) whose owner changed.
  function moved(before, after) {
    let total = 0, changed = 0;
    before.forEach((o, k) => { if (after.has(k)) { total++; if (after.get(k) !== o) changed++; } });
    return total ? changed / total : 0;
  }

  return { create, hash32, pos, moved };
});
