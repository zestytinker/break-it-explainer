const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('./dom-helper');

const page = () => loadPage('consistent-hashing-explainer.html');
const basic = p => p.$('[data-pg]:not([data-advanced])');
const advanced = p => p.$('[data-pg][data-advanced]');
const pct = el => parseInt(el.textContent, 10);

test('page boots seeded with 3 servers and 30 keys, drawn as pins, dots and bars', () => {
  const p = page(); const pg = basic(p);
  assert.equal(p.$$('nav button').length, 6);
  assert.equal(p.$('[data-ns]', pg).textContent, '3');
  assert.equal(p.$('[data-nk]', pg).textContent, '30');
  assert.equal(p.$$('.bar', pg).length, 3);
  assert.equal(p.$$('svg text', pg).length, 3, 'one label per server');
  assert.equal(p.$$('svg path', pg).length, 3, 'one arc per pin');
  const loads = p.$$('.bar b', pg).map(b => +b.textContent);
  assert.equal(loads.reduce((a, b) => a + b, 0), 30);
});

test('adding a server moves few keys on the ring and many under modulo', () => {
  const p = page(); const pg = basic(p);
  p.click(p.$('[data-addkeys]', pg)); p.click(p.$('[data-addkeys]', pg)); // 70 keys for a stable %
  p.click(p.$('[data-addsrv]', pg));
  assert.equal(p.$('[data-ns]', pg).textContent, '4');
  assert.match(p.$('[data-what]', pg).textContent, /added D/);
  const ring = pct(p.$('[data-mr]', pg)), mod = pct(p.$('[data-mm]', pg));
  assert.ok(ring < mod, `ring ${ring}% should be below modulo ${mod}%`);
  assert.ok(mod > 40);
});

test('removing the last server updates the count and the label', () => {
  const p = page(); const pg = basic(p);
  p.click(p.$('[data-rmsrv]', pg));
  assert.equal(p.$('[data-ns]', pg).textContent, '2');
  assert.match(p.$('[data-what]', pg).textContent, /removed C/);
  assert.equal(p.$$('.bar', pg).length, 2);
});

test('removing every server shows the empty message and zero busiest', () => {
  const p = page(); const pg = basic(p);
  for (let i = 0; i < 3; i++) p.click(p.$('[data-rmsrv]', pg));
  p.click(p.$('[data-rmsrv]', pg));   // extra click on empty ring is harmless
  assert.match(p.$('[data-bars]', pg).textContent, /homeless/);
  assert.equal(p.$('[data-max]', pg).textContent, '0');
  assert.equal(p.$$('svg path', pg).length, 0);
});

test('server names stop at H', () => {
  const p = page(); const pg = basic(p);
  for (let i = 0; i < 10; i++) p.click(p.$('[data-addsrv]', pg));
  assert.equal(p.$('[data-ns]', pg).textContent, '8');
});

test('advanced playground removes the server picked in the dropdown', () => {
  const p = page(); const pg = advanced(p);
  const sel = p.$('[data-rm]', pg);
  assert.deepEqual([...sel.options].map(o => o.value), ['A', 'B', 'C']);
  sel.value = 'A';
  p.click(p.$('[data-rmsrv]', pg));
  assert.match(p.$('[data-what]', pg).textContent, /removed A/);
  assert.deepEqual([...p.$('[data-rm]', pg).options].map(o => o.value), ['B', 'C']);
});

test('virtual nodes slider multiplies pins and keeps keys', () => {
  const p = page(); const pg = advanced(p);
  p.click(p.$('[data-addkeys]', pg)); p.click(p.$('[data-addkeys]', pg)); p.click(p.$('[data-addkeys]', pg));
  p.slide(p.$('[data-v]', pg), 50);
  assert.equal(p.$('[data-vv]', pg).textContent, '50');
  assert.equal(p.$$('svg path', pg).length, 150, '3 servers x 50 pins');
  assert.equal(p.$$('svg text', pg).length, 3, 'still one label per server');
  assert.equal(p.$('[data-nk]', pg).textContent, '90', 'keys survive rebuild');
  const loads = p.$$('.bar b', pg).map(b => +b.textContent);
  assert.equal(loads.reduce((a, b) => a + b, 0), 90, 'every key still has an owner');
  // load evenness is statistical; it is asserted with 1000 keys in hashring.test.js, not here
});

test('adding keys resets the moved readout and start over reseeds', () => {
  const p = page(); const pg = advanced(p);
  p.click(p.$('[data-addsrv]', pg));
  assert.notEqual(p.$('[data-what]', pg).textContent, '');
  p.click(p.$('[data-addkeys]', pg));
  assert.equal(p.$('[data-what]', pg).textContent, '');
  assert.equal(p.$('[data-nk]', pg).textContent, '50');
  p.click(p.$('[data-reset]', pg));
  assert.equal(p.$('[data-ns]', pg).textContent, '3');
  assert.equal(p.$('[data-nk]', pg).textContent, '30');
});

test('both playgrounds share one ring', () => {
  const p = page();
  p.click(p.$('[data-addsrv]', basic(p)));
  assert.equal(p.$('[data-ns]', advanced(p)).textContent, '4');
});

test('nav switches steps and reading list links are https', () => {
  const p = page();
  p.click(p.$('nav button[data-go="5"]'));
  assert.equal(p.activeStep(), '5');
  const hrefs = p.$$('.read').map(a => a.href);
  assert.equal(hrefs.length, 5);
  hrefs.forEach(h => assert.match(h, /^https:\/\//));
});
