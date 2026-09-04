const test = require('node:test');
const assert = require('node:assert/strict');
const Gate = require('../gate.js');
const known = require('../pipeline/known-concepts.json').concepts;

const published = [
  { id: 'bloom-filter', name: 'Bloom filters', aliases: ['bloom filter'], playground: 'bloom' },
  { id: 'consistent-hashing', name: 'Consistent hashing', aliases: ['hash ring'], playground: 'ring' }
];
const gate = Gate.create({ published, known });

test('exact and near-exact names open the page', () => {
  assert.equal(gate.decide('Bloom filter').concept.id, 'bloom-filter');
  assert.equal(gate.decide('bloom filters').concept.id, 'bloom-filter');
  assert.equal(gate.decide('  BLOOM   FILTER ').concept.id, 'bloom-filter');
  assert.equal(gate.decide('consistent-hashing').concept.id, 'consistent-hashing');
  assert.equal(gate.decide('hash ring').concept.id, 'consistent-hashing');
});

test('prefixes and token prefixes open the page too', () => {
  assert.equal(gate.decide('bloom').concept.id, 'bloom-filter');
  assert.equal(gate.decide('consist hash').concept.id, 'consistent-hashing');
});

test('known but ungenerated concepts get the queue message with the canonical name', () => {
  assert.deepEqual(gate.decide('raft'), { kind: 'known', name: 'Raft' });
  assert.deepEqual(gate.decide('LRU'), { kind: 'known', name: 'LRU cache' });
  assert.deepEqual(gate.decide('token bucket'), { kind: 'known', name: 'Rate limiting' });
  assert.deepEqual(gate.decide('Merkle trees'), { kind: 'known', name: 'Merkle tree' });
  assert.deepEqual(gate.decide('k8s'), { kind: 'known', name: 'Kubernetes' });
});

test('nonsense and non-tech input is unknown', () => {
  for (const q of ["my cat's diet", 'quantum blockchain synergy', 'asdfgh', 'how to bake bread', 'taylor swift']) {
    assert.equal(gate.decide(q).kind, 'unknown', q);
  }
});

test('empty input is empty, not unknown', () => {
  assert.deepEqual(gate.decide(''), { kind: 'empty' });
  assert.deepEqual(gate.decide('   '), { kind: 'empty' });
});

test('published wins over known when both match', () => {
  assert.equal(gate.decide('bloom filter').kind, 'open', 'Bloom filter is in both lists');
  assert.equal(gate.decide('consistent hashing').kind, 'open');
});

test('suggest returns published entries best first and respects the limit', () => {
  assert.deepEqual(gate.suggest('').map(e => e.id), ['bloom-filter', 'consistent-hashing']);
  assert.deepEqual(gate.suggest('hash').map(e => e.id), ['consistent-hashing']);
  assert.deepEqual(gate.suggest('blo').map(e => e.id), ['bloom-filter']);
  assert.deepEqual(gate.suggest('b'), [], 'one letter is too little to suggest on');
  assert.deepEqual(gate.suggest('zzz'), []);
  assert.equal(gate.suggest('', 1).length, 1);
});

test('score ranks exact > token-equal > prefix > substring > token-prefix > none', () => {
  assert.equal(Gate.score('raft', 'Raft'), 100);
  assert.equal(Gate.score('bloom filters', 'bloom filter'), 95);
  assert.equal(Gate.score('blo', 'bloom filter'), 80);
  assert.equal(Gate.score('filter', 'bloom filter'), 70);
  assert.equal(Gate.score('blo fil', 'bloom filter'), 60);
  assert.equal(Gate.score('xyz', 'bloom filter'), 0);
});

test('known-concepts list is well formed: unique names, lowercase aliases, no duplicates across entries', () => {
  const names = known.map(k => k.name);
  assert.equal(new Set(names).size, names.length, 'duplicate names');
  const all = [];
  for (const k of known) for (const a of k.aliases) { assert.equal(a, a.toLowerCase(), `alias not lowercase: ${a}`); all.push(a); }
  const dup = all.filter((a, i) => all.indexOf(a) !== i);
  assert.deepEqual(dup, [], 'aliases shared by more than one concept');
  assert.ok(known.length >= 120);
});

test('short queries only match at word boundaries, never inside a word', () => {
  assert.equal(Gate.score('llm', 'Diffie-Hellman key exchange'), 0);
  assert.equal(Gate.score('hash', 'consistent hashing'), 70);
  assert.equal(Gate.score('ing', 'consistent hashing'), 0);
  assert.deepEqual(gate.decide('llm'), { kind: 'known', name: 'Large language model' });
  assert.deepEqual(gate.decide('LLMs'), { kind: 'known', name: 'Large language model' });
});

test('two-letter queries only match exact aliases', () => {
  assert.deepEqual(gate.decide('ml'), { kind: 'known', name: 'Machine learning' });
  assert.deepEqual(gate.decide('AI'), { kind: 'known', name: 'Artificial intelligence' });
  assert.equal(Gate.score('ml', 'mlp'), 0, 'no prefix matching for 2-letter tokens');
  assert.equal(gate.decide('zq').kind, 'unknown');
});
