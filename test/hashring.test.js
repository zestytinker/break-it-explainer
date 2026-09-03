// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const HR = require('../hashring.js');

const keysN = n => Array.from({ length: n }, (_, i) => 'key-' + i);

test('pos is deterministic and inside [0,1)', () => {
  for (const s of ['a', 'server-A#0', '', 'a long key']) {
    const p = HR.pos(s);
    assert.equal(p, HR.pos(s));
    assert.ok(p >= 0 && p < 1);
  }
});

test('empty ring owns nothing', () => {
  const r = HR.create();
  assert.equal(r.owner('x'), null);
  assert.equal(r.modOwner('x'), null);
});

test('single server owns every key, including keys past the last pin (wrap-around)', () => {
  const r = HR.create();
  r.addServer('A');
  keysN(50).forEach(k => assert.equal(r.owner(k), 'A'));
});

test('owner is the next pin clockwise', () => {
  const r = HR.create();
  ['A', 'B', 'C'].forEach(s => r.addServer(s));
  const pins = r.ring();
  for (const k of keysN(30)) {
    const p = HR.pos(k);
    const expected = (pins.find(pin => pin.pos > p) || pins[0]).server;
    assert.equal(r.owner(k), expected);
  }
});

test('ring has servers x vnodes pins, sorted', () => {
  const r = HR.create({ vnodes: 4 });
  ['A', 'B', 'C'].forEach(s => r.addServer(s));
  const pins = r.ring();
  assert.equal(pins.length, 12);
  for (let i = 1; i < pins.length; i++) assert.ok(pins[i].pos >= pins[i - 1].pos);
});

test('adding a server moves only a minority of keys on the ring, but most keys under mod-N', () => {
  const r = HR.create({ vnodes: 8 });
  ['A', 'B', 'C', 'D'].forEach(s => r.addServer(s));
  keysN(400).forEach(k => r.addKey(k));
  const before = r.snapshot();
  r.addServer('E');
  const after = r.snapshot();
  const ringMoved = HR.moved(before.ring, after.ring);
  const modMoved = HR.moved(before.mod, after.mod);
  // ideal is 1/5 = 20% for the ring; allow slack for hash luck
  assert.ok(ringMoved > 0.05 && ringMoved < 0.4, 'ring moved ' + ringMoved);
  assert.ok(modMoved > 0.6, 'mod-N moved ' + modMoved);
});

test('removing a server never moves keys that it did not own', () => {
  const r = HR.create({ vnodes: 3 });
  ['A', 'B', 'C', 'D'].forEach(s => r.addServer(s));
  keysN(200).forEach(k => r.addKey(k));
  const before = r.snapshot().ring;
  r.removeServer('B');
  const after = r.snapshot().ring;
  before.forEach((o, k) => { if (o !== 'B') assert.equal(after.get(k), o, k + ' should stay on ' + o); });
  assert.equal(r.servers.includes('B'), false);
});

test('more virtual nodes gives more even load', () => {
  const spread = vnodes => {
    const r = HR.create({ vnodes });
    ['A', 'B', 'C', 'D'].forEach(s => r.addServer(s));
    keysN(1000).forEach(k => r.addKey(k));
    const l = [...r.loads().values()];
    return Math.max(...l) - Math.min(...l);
  };
  assert.ok(spread(50) < spread(1), 'vnodes=50 should be tighter than vnodes=1');
});

test('loads sum to the number of keys', () => {
  const r = HR.create({ vnodes: 2 });
  ['A', 'B', 'C'].forEach(s => r.addServer(s));
  keysN(77).forEach(k => r.addKey(k));
  const sum = [...r.loads().values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, 77);
});

test('duplicate servers and blank keys are rejected', () => {
  const r = HR.create();
  assert.equal(r.addServer('A'), true);
  assert.equal(r.addServer('A'), false);
  assert.equal(r.addKey('   '), false);
  assert.equal(r.removeServer('nope'), false);
});

test('rebuild keeps servers and keys under a new vnodes count', () => {
  const r = HR.create({ vnodes: 1 });
  ['A', 'B'].forEach(s => r.addServer(s));
  keysN(10).forEach(k => r.addKey(k));
  const g = r.rebuild({ vnodes: 5 });
  assert.equal(g.vnodes, 5);
  assert.deepEqual(g.servers, r.servers);
  assert.equal(g.keys.size, 10);
  assert.equal(r.vnodes, 1, 'original untouched');
});

test('rejects nonsense vnodes', () => {
  assert.throws(() => HR.create({ vnodes: 0 }));
});

test('create() with no options gives one pin per server', () => {
  const r = HR.create(); r.addServer('A'); r.addServer('B');
  assert.equal(r.ring().length, 2);
});

test('modOwner follows insertion order and hash32', () => {
  const r = HR.create(); ['A', 'B', 'C'].forEach(s => r.addServer(s));
  assert.equal(r.modOwner('k'), ['A', 'B', 'C'][HR.hash32('k') % 3]);
});

test('moved ignores keys that only exist on one side and returns 0 for empty input', () => {
  const before = new Map([['a', 'A'], ['b', 'B']]);
  const after = new Map([['a', 'C'], ['zzz', 'A']]);
  assert.equal(HR.moved(before, after), 1);          // only "a" is shared, and it moved
  assert.equal(HR.moved(new Map(), new Map()), 0);
});

test('rebuild() with no options keeps vnodes', () => {
  const r = HR.create({ vnodes: 7 }); r.addServer('A');
  assert.equal(r.rebuild().vnodes, 7);
});
