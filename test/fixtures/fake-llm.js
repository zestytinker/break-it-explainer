// Offline stand-ins for the model and the sources. Used by `--dry` runs and by tests.
const fs = require('fs');
const path = require('path');

const draftFixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'token-bucket.draft.json'), 'utf8'));

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

function fakeLlm({ draft = draftFixture, judgeFn = fakeVerdicts } = {}) {
  const calls = [];
  return {
    calls,
    async complete({ system, user }) {
      calls.push({ system, user });
      if (/fact checker/i.test(system)) {
        const ids = [...user.matchAll(/^(c\d+[a-z]?): /gm)].map(m => m[1]);
        return '```json\n' + JSON.stringify(judgeFn(ids)) + '\n```';
      }
      return JSON.stringify(draft());
    }
  };
}

async function fakeGather() {
  return [{ name: 'Wikipedia: Token bucket', url: 'https://en.wikipedia.org/wiki/Token_bucket',
    text: 'The token bucket is an algorithm used in packet-switched and telecommunications networks. Tokens are added at a fixed rate. It can be used to check that data transmissions conform to defined limits on bandwidth and burstiness.', refs: [] }];
}

module.exports = { fakeLlm, fakeGather, fakeVerdicts, draftFixture };
