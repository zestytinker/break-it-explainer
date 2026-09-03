const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BUILD = path.join(__dirname, 'build.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'explainer-'));
const run = (cwd, args = []) => execFileSync('node', [BUILD, ...args], { cwd, encoding: 'utf8' });

test('replaces a <script src> with an inlined block and is idempotent', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'lib.js'), 'window.X = 1;\n');
  fs.writeFileSync(path.join(dir, 'page.html'), '<p>hi</p>\n<script src="lib.js"></script>\n<script>X</script>');
  run(dir, ['page.html', 'lib.js']);
  const once = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  assert.match(once, /<script data-inlined="lib\.js">\nwindow\.X = 1;\n<\/script>/);
  assert.doesNotMatch(once, /src="lib\.js"/);

  fs.writeFileSync(path.join(dir, 'lib.js'), 'window.X = 2;\n');
  run(dir, ['page.html', 'lib.js']);
  const twice = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  assert.match(twice, /window\.X = 2;/);
  assert.doesNotMatch(twice, /window\.X = 1;/);
  assert.equal((twice.match(/data-inlined/g) || []).length, 1, 'still exactly one inlined block');
});

test('fails loudly when the marker is missing', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'lib.js'), '');
  fs.writeFileSync(path.join(dir, 'page.html'), '<p>no script here</p>');
  assert.throws(() => run(dir, ['page.html', 'lib.js']), /marker for lib\.js not found/);
});

test('default run syncs both real explainers without changing them when already in sync', () => {
  const dir = tmp();
  for (const f of ['bloom-filter-explainer.html', 'consistent-hashing-explainer.html', 'bloom.js', 'hashring.js'])
    fs.copyFileSync(path.join(__dirname, f), path.join(dir, f));
  const before = fs.readFileSync(path.join(dir, 'bloom-filter-explainer.html'), 'utf8');
  const out = run(dir);
  assert.match(out, /inlined bloom\.js/); assert.match(out, /inlined hashring\.js/);
  assert.equal(fs.readFileSync(path.join(dir, 'bloom-filter-explainer.html'), 'utf8'), before);
});
