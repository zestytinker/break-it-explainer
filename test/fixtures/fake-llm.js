// Offline stand-ins for the model and the sources. Used by `--dry` runs and by tests.
const fs = require('fs');
const path = require('path');

const draftFixture = (id = 'token-bucket') => JSON.parse(fs.readFileSync(path.join(__dirname, `${id}.draft.json`), 'utf8'));

// A judge that only looks at the sources: a claim is supported when most of its anchor tokens
// (numbers, capitalised names, long words) appear in one source's text. Never contradicts.
function overlapVerdicts(claims, sources) {
  const anchors = t => [...new Set(t.replace(/[^\w%./-]/g, ' ').split(/\s+/).filter(w => /\d/.test(w) || /^[A-Z]/.test(w) || w.length > 8).map(w => w.toLowerCase()))];
  return { verdicts: claims.map(c => {
    const a = anchors(c.text); let best = null, bestScore = 0;
    for (const s of sources) { const low = s.text.toLowerCase(); const hit = a.filter(w => low.includes(w)).length / Math.max(1, a.length); if (hit > bestScore) { bestScore = hit; best = s; } }
    return bestScore >= 0.6 ? { id: c.id, verdict: 'supported', source: best.name, quote: a.filter(w => best.text.toLowerCase().includes(w)).slice(0, 4).join(' ') } : { id: c.id, verdict: 'unverified', source: '', quote: '' };
  }) };
}

// The fake judge marks claims by id prefix so tests can steer outcomes:
// ids ending in "x" are contradicted, ending in "u" are unverified, everything else supported.
function fakeVerdicts(claimIds) {
  return { verdicts: claimIds.map(id => ({
    id,
    verdict: /x$/.test(id) ? 'contradicted' : /u$/.test(id) ? 'unverified' : 'supported',
    source: /[xu]$/.test(id) ? '' : 'Wikipedia: Token bucket',
    quote: /[xu]$/.test(id) ? '' : 'tokens are added at a fixed rate',
    note: /x$/.test(id) ? 'the source gives a different year' : ''
  })) };
}

function fakeLlm({ draft = draftFixture, judgeFn = fakeVerdicts, sources = null } = {}) {
  const calls = [];
  return {
    calls,
    async complete({ system, user }) {
      calls.push({ system, user });
      if (/fact checker/i.test(system)) {
        if (sources) {
          const claims = [...user.matchAll(/^(c\d+[a-z]?): (.*)$/gm)].map(m => ({ id: m[1], text: m[2] }));
          return JSON.stringify(overlapVerdicts(claims, sources));
        }
        const ids = [...user.matchAll(/^(c\d+[a-z]?): /gm)].map(m => m[1]);
        return '```json\n' + JSON.stringify(judgeFn(ids)) + '\n```';
      }
      return JSON.stringify(draft());
    }
  };
}

// Offline setup for a given concept id: fixture draft, fixture sources, overlap judge.
function dryFor(id) {
  const sources = id === 'bloom-filter' ? require('./bloom-sources') : null;
  return { llm: fakeLlm({ draft: () => draftFixture(id), sources }), gather: sources ? async () => sources : fakeGather };
}

async function fakeGather() {
  return [{ name: 'Wikipedia: Token bucket', url: 'https://en.wikipedia.org/wiki/Token_bucket',
    text: 'The token bucket is an algorithm used in packet-switched and telecommunications networks. Tokens are added at a fixed rate. It can be used to check that data transmissions conform to defined limits on bandwidth and burstiness.', refs: [] }];
}

module.exports = { fakeLlm, fakeGather, fakeVerdicts, draftFixture, overlapVerdicts, dryFor };
