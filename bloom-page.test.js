const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('./dom-helper');

const page = () => loadPage('bloom-filter-explainer.html');
const basic = p => p.$('[data-pg]:not([data-advanced])');
const advanced = p => p.$('[data-pg][data-advanced]');

test('page boots with six steps, step 1 active, two playgrounds with 24 bulbs each', () => {
  const p = page();
  assert.equal(p.$$('nav button').length, 6);
  assert.equal(p.activeStep(), '0');
  assert.equal(p.$$('[data-pg]').length, 2);
  assert.equal(p.$$('.bulb', basic(p)).length, 24);
  assert.equal(p.$$('.bulb.on', basic(p)).length, 0);
});

test('nav buttons and next buttons switch steps', () => {
  const p = page();
  p.click(p.$('nav button[data-go="3"]'));
  assert.equal(p.activeStep(), '3');
  assert.equal(p.$('nav button[data-go="3"]').getAttribute('aria-current'), 'step');
  p.click(p.$('.step.on .next button'));           // origin -> where it lives
  assert.equal(p.activeStep(), '4');
});

test('adding a word lights bulbs, shows a chip, and reports positions', () => {
  const p = page(); const pg = basic(p);
  p.type(p.$('[data-in]', pg), 'pineapple');
  p.click(p.$('[data-add]', pg));
  const lit = p.$$('.bulb.on', pg).length;
  assert.ok(lit >= 1 && lit <= 3);
  assert.equal(p.$('[data-n]', pg).textContent, '1');
  assert.equal(p.$('.chip', pg).textContent, 'pineapple');
  assert.match(p.$('[data-verdict]', pg).textContent, /Added pineapple\. It lit bulbs \d+/);
  assert.equal(p.$('[data-in]', pg).value, '', 'input clears after add');
});

test('both playgrounds share one filter', () => {
  const p = page();
  p.type(p.$('[data-in]', basic(p)), 'shared');
  p.click(p.$('[data-add]', basic(p)));
  assert.equal(p.$('[data-n]', advanced(p)).textContent, '1');
  assert.equal(p.$$('.bulb.on', advanced(p)).length, p.$$('.bulb.on', basic(p)).length);
});

test('checking an added word says PROBABLY, an unseen word says DEFINITELY NOT', () => {
  const p = page(); const pg = basic(p);
  p.type(p.$('[data-in]', pg), 'apple'); p.click(p.$('[data-add]', pg));
  p.type(p.$('[data-in]', pg), 'apple'); p.click(p.$('[data-check]', pg));
  assert.ok(p.$('[data-verdict]', pg).classList.contains('yes'));
  assert.match(p.$('[data-verdict]', pg).textContent, /PROBABLY/);
  assert.doesNotMatch(p.$('[data-verdict]', pg).textContent, /false alarm/);

  // a fresh filter with one word and a word chosen to miss
  const q = page(); const qg = basic(q);
  q.type(q.$('[data-in]', qg), 'apple'); q.click(q.$('[data-add]', qg));
  const words = ['zebra', 'quokka', 'umbrella', 'xylophone', 'yak', 'vortex', 'walnut'];
  let saw = false;
  for (const w of words) {
    q.type(q.$('[data-in]', qg), w); q.enter(q.$('[data-in]', qg));   // Enter key triggers Check
    const v = q.$('[data-verdict]', qg);
    if (v.classList.contains('no')) { assert.match(v.textContent, /DEFINITELY NOT.*bulb \d+ is dark/); saw = true; break; }
  }
  assert.ok(saw, 'expected at least one definite miss among the probe words');
});

test('blank input is ignored by Add and Check', () => {
  const p = page(); const pg = basic(p);
  p.type(p.$('[data-in]', pg), '   ');
  p.click(p.$('[data-add]', pg)); p.click(p.$('[data-check]', pg));
  assert.equal(p.$('[data-n]', pg).textContent, '0');
  assert.equal(p.$('[data-verdict]', pg).textContent, 'Nothing checked yet.');
});

test('fill button adds 8 strangers and a saturated strip produces a caught false alarm', () => {
  const p = page(); const pg = advanced(p);
  p.slide(p.$('[data-m]', pg), 8);                   // shrink to 8 bulbs
  p.click(p.$('[data-fill]', pg)); p.click(p.$('[data-fill]', pg)); p.click(p.$('[data-fill]', pg));
  assert.equal(p.$('[data-n]', pg).textContent, '24');
  assert.equal(p.$('[data-lit]', pg).textContent, '100%');
  p.type(p.$('[data-in]', pg), 'definitely-not-added'); p.click(p.$('[data-check]', pg));
  assert.match(p.$('[data-verdict]', pg).textContent, /false alarm/);
  assert.equal(p.$('[data-caught]', pg).textContent, '1');
});

test('sliders rebuild the strip and keep added words', () => {
  const p = page(); const pg = advanced(p);
  p.type(p.$('[data-in]', pg), 'keepme'); p.click(p.$('[data-add]', pg));
  p.slide(p.$('[data-m]', pg), 48);
  assert.equal(p.$$('.bulb', pg).length, 48);
  assert.equal(p.$('[data-mv]', pg).textContent, '48');
  p.slide(p.$('[data-k]', pg), 5);
  assert.equal(p.$('[data-kv]', pg).textContent, '5');
  assert.equal(p.$('[data-n]', pg).textContent, '1');
  assert.ok(p.$$('.bulb.on', pg).length >= 1 && p.$$('.bulb.on', pg).length <= 5);
});

test('start over clears everything', () => {
  const p = page(); const pg = advanced(p);
  p.click(p.$('[data-fill]', pg));
  p.click(p.$('[data-reset]', pg));
  assert.equal(p.$('[data-n]', pg).textContent, '0');
  assert.equal(p.$$('.bulb.on', pg).length, 0);
  assert.equal(p.$('[data-fp]', pg).textContent, '0%');
  assert.match(p.$('[data-verdict]', pg).textContent, /Strip cleared/);
});

test('reading list links are absolute https URLs', () => {
  const p = page();
  const hrefs = p.$$('.read').map(a => a.href);
  assert.equal(hrefs.length, 5);
  hrefs.forEach(h => assert.match(h, /^https:\/\//));
});

test('user-typed words are escaped before being rendered', () => {
  const p = page(); const pg = basic(p);
  p.type(p.$('[data-in]', pg), '<img src=x onerror=alert(1)>');
  p.click(p.$('[data-add]', pg));
  assert.equal(p.$$('img', pg).length, 0, 'no element injected');
  assert.match(p.$('.chip', pg).textContent, /<img src=x/);
});
