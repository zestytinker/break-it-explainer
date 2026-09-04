// Client-side gate for the landing page search box. Pure, no DOM, no network.
// Inlined into index.html by the renderer and unit-tested in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gate = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9+/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const singular = w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  const tokens = s => norm(s).split(' ').filter(Boolean).map(singular);

  // Score how well a query matches a name or alias. 0 = no match.
  function score(query, candidate) {
    const q = norm(query), c = norm(candidate);
    if (!q || !c) return 0;
    if (q === c) return 100;
    const qt = tokens(q), ct = tokens(c);
    if (qt.join(' ') === ct.join(' ')) return 95;
    if (q.length < 3) return 0;
    if (c.startsWith(q)) return 80;
    // substring only at a word boundary: "hash" matches "consistent hashing", "llm" must not match "hellman"
    if (new RegExp('(^| )' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(c)) return 70;
    // every query token is a prefix of some candidate token
    // every query token (3+ chars) is a prefix of some candidate token; short tokens only match exactly above
    if (qt.length && qt.every(t => t.length >= 3) && qt.every(t => ct.some(x => x.startsWith(t)))) return 60;
    return 0;
  }

  function best(query, entries) {
    let top = null;
    for (const e of entries) {
      const s = Math.max(score(query, e.name), ...(e.aliases || []).map(a => score(query, a)));
      if (s > (top ? top.score : 0)) top = { entry: e, score: s };
    }
    return top;
  }

  function create({ published = [], known = [] } = {}) {
    // published: [{id, name, aliases?, playground?}], known: [{name, aliases}]
    return {
      // Typeahead suggestions from the published set, best first, up to `limit`.
      suggest(query, limit = 6) {
        const q = norm(query);
        if (!q) return published.slice(0, limit);
        return published
          .map(e => ({ e, s: Math.max(score(q, e.name), ...(e.aliases || []).map(a => score(q, a))) }))
          .filter(x => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, limit)
          .map(x => x.e);
      },
      // Decide what to do with a submitted query.
      //   { kind: 'open', concept }          exact or strong match on a published page
      //   { kind: 'known', name }            a real concept we have not generated yet
      //   { kind: 'unknown' }                does not look like a tech concept we cover
      //   { kind: 'empty' }                  nothing typed
      decide(query) {
        if (!norm(query)) return { kind: 'empty' };
        const p = best(query, published);
        if (p && p.score >= 60) return { kind: 'open', concept: p.entry };
        const k = best(query, known);
        if (k && k.score >= 60) return { kind: 'known', name: k.entry.name };
        return { kind: 'unknown' };
      }
    };
  }

  return { create, score, norm };
});
