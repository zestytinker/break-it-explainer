// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Bloom = require('../bloom.js');

test('hash is deterministic and stays inside the strip', () => {
  const m = 24;
  for (const w of ['apple', 'banana', '', 'a very long word indeed']) {
    for (let seed = 1; seed <= 6; seed++) {
      const a = Bloom.hash(w, seed, m), b = Bloom.hash(w, seed, m);
      assert.equal(a, b);
      assert.ok(a >= 0 && a < m);
    }
  }
});

test('different seeds usually point at different bulbs', () => {
  const m = 64;
  let distinct = 0;
  for (const w of ['pretzel', 'lantern', 'octopus', 'kazoo', 'tundra']) {
    const s = new Set([1, 2, 3].map(seed => Bloom.hash(w, seed, m)));
    if (s.size === 3) distinct++;
  }
  assert.ok(distinct >= 4, 'seeds should spread across bulbs for most words');
});

test('positions returns k bulbs and ignores case and whitespace', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  assert.equal(f.positions('Apple').length, 3);
  assert.deepEqual(f.positions('Apple'), f.positions('  apple '));
});

test('empty filter rejects everything', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  for (const w of ['x', 'hello', 'bloom']) assert.equal(f.check(w).maybe, false);
  assert.equal(f.fpRate(), 0);
});

test('no false negatives: every added word comes back as maybe', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  const words = ['pretzel', 'lantern', 'octopus', 'kazoo', 'tundra', 'velvet'];
  words.forEach(w => f.add(w));
  for (const w of words) {
    const r = f.check(w);
    assert.equal(r.maybe, true, `${w} should be maybe`);
    assert.equal(r.truly, true);
  }
});

test('check reports which bulb is dark on a definite miss', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  f.add('pretzel');
  const r = f.check('zzzz-unlikely-word-qqq');
  if (!r.maybe) {
    assert.ok(r.firstDark >= 0 && r.firstDark < 24);
    assert.equal(f.bits[r.firstDark], 0);
  }
});

test('adding blank input is a no-op', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  assert.equal(f.add('   '), false);
  assert.equal(f.added.size, 0);
  assert.equal(f.litFraction(), 0);
});

test('a saturated tiny filter produces a false positive', () => {
  const f = Bloom.create({ m: 8, k: 2 });
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].forEach(w => f.add(w));
  assert.equal(f.litFraction(), 1, 'all bulbs should be lit');
  const r = f.check('never-added');
  assert.equal(r.maybe, true);
  assert.equal(r.truly, false);
});

test('false positive formula matches known values', () => {
  // n = 0 -> 0. m=24, k=3, n=8 -> (1 - e^-1)^3 ≈ 0.2526
  assert.equal(Bloom.theoreticalFP(24, 3, 0), 0);
  assert.ok(Math.abs(Bloom.theoreticalFP(24, 3, 8) - 0.2526) < 0.001);
  // more bulbs -> lower rate, holding k and n fixed
  assert.ok(Bloom.theoreticalFP(64, 3, 8) < Bloom.theoreticalFP(24, 3, 8));
});

test('rebuild keeps the same words under new m and k', () => {
  const f = Bloom.create({ m: 24, k: 3 });
  ['pretzel', 'lantern'].forEach(w => f.add(w));
  const g = f.rebuild({ m: 48, k: 5 });
  assert.equal(g.m, 48);
  assert.equal(g.k, 5);
  assert.deepEqual([...g.added], [...f.added]);
  for (const w of f.added) assert.equal(g.check(w).maybe, true);
  assert.equal(f.m, 24, 'original is untouched');
});

test('rejects nonsense sizes', () => {
  assert.throws(() => Bloom.create({ m: 0, k: 3 }));
  assert.throws(() => Bloom.create({ m: 24, k: -1 }));
});

test('create() with no options uses the defaults', () => {
  const f = Bloom.create();
  assert.equal(f.m, 24); assert.equal(f.k, 3);
  assert.equal(f.positions('x').length, 3);
});

test('rebuild() with no options keeps m and k', () => {
  const f = Bloom.create({ m: 16, k: 2 }); f.add('w');
  const g = f.rebuild();
  assert.equal(g.m, 16); assert.equal(g.k, 2); assert.equal(g.check('w').maybe, true);
});

test('normalize lowercases and trims', () => {
  assert.equal(Bloom.normalize('  HeLLo '), 'hello');
});
