const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('./dom-helper');

// jsdom cannot navigate; the page routes navigation through window.openConcept so tests can capture it.
function page() {
  const p = loadPage('index.html');
  const nav = [];
  p.window.openConcept = url => nav.push(url);
  const input = p.$('[data-q]');
  const press = key => input.dispatchEvent(new p.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { ...p, nav, input, press };
}

test('landing page has the search box, cards for published concepts, and the inlined gate', () => {
  const p = page();
  assert.ok(p.input);
  assert.equal(p.$$('.card').length, 2);
  assert.equal(p.$$('.card .tag').length, 2, 'both hand-built pages are tagged with playground');
  assert.equal(p.$$('script[data-inlined="gate.js"]').length, 1);
  assert.doesNotMatch(p.doc.documentElement.outerHTML, /api\.anthropic\.com|sk-ant/);
});

test('typing shows suggestions from the published set only', () => {
  const p = page();
  p.input.focus();
  p.type(p.input, 'blo');
  const items = p.$$('[data-suggest] li');
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, /Bloom filters/);
  assert.match(items[0].textContent, /with playground/);
  p.type(p.input, 'raft');
  assert.equal(p.$$('[data-suggest] li').length, 0, 'known-but-ungenerated concepts do not appear as suggestions');
});

test('Enter on a match navigates to the page', () => {
  const p = page();
  p.type(p.input, 'consistent hashing');
  p.press('Enter');
  assert.deepEqual(p.nav, ['consistent-hashing-explainer.html']);
});

test('arrow keys select a suggestion and Enter opens it', () => {
  const p = page();
  p.input.focus();
  p.type(p.input, '');
  p.press('ArrowDown'); p.press('ArrowDown');
  assert.equal(p.$('[data-suggest] li[aria-selected="true"]').textContent.includes('Consistent hashing'), true);
  p.press('Enter');
  assert.deepEqual(p.nav, ['consistent-hashing-explainer.html']);
});

test('a real but ungenerated concept gets the friendly queue message with the allowlist', () => {
  const p = page();
  p.type(p.input, 'raft');
  p.press('Enter');
  const m = p.$('[data-msg]');
  assert.ok(m.classList.contains('known'));
  assert.match(m.textContent, /Raft.*is a real concept.*hasn't been generated and checked yet/);
  assert.match(m.textContent, /Bloom filters/); assert.match(m.textContent, /Consistent hashing/);
  assert.equal(p.$$('[data-msg] a').length, 2, 'allowlist entries are links');
  assert.deepEqual(p.nav, []);
});

test('nonsense gets the not-supported message with the allowlist', () => {
  const p = page();
  p.type(p.input, "my cat's diet");
  p.press('Enter');
  const m = p.$('[data-msg]');
  assert.ok(m.classList.contains('unknown'));
  assert.match(m.textContent, /Not supported for now\. Please pick one of these/);
  assert.equal(p.$$('[data-msg] a').length, 2);
});

test('message clears when the user keeps typing, and empty Enter shows nothing', () => {
  const p = page();
  p.type(p.input, 'raft'); p.press('Enter');
  assert.ok(p.$('[data-msg]').classList.contains('on'));
  p.type(p.input, 'raft c');
  assert.equal(p.$('[data-msg]').classList.contains('on'), false);
  p.type(p.input, '   '); p.press('Enter');
  assert.equal(p.$('[data-msg]').classList.contains('on'), false);
});

test('typed text is escaped in messages', () => {
  const p = page();
  p.type(p.input, '<img src=x onerror=alert(1)> raft');
  p.press('Enter');
  assert.equal(p.$$('[data-msg] img').length, 0);
});

test('example chips fill the box and submit: one opens, one queues, one is unsupported', () => {
  const p = page();
  const chips = p.$$('[data-try]');
  assert.deepEqual(chips.map(c => c.dataset.try), ['Bloom filter', 'Raft', "my cat's diet"]);
  p.click(chips[0]);
  assert.deepEqual(p.nav, ['bloom-filter-explainer.html']);
  p.click(chips[1]);
  assert.ok(p.$('[data-msg]').classList.contains('known'));
  assert.equal(p.input.value, 'Raft');
  p.click(chips[2]);
  assert.ok(p.$('[data-msg]').classList.contains('unknown'));
});
