const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseJson, createClient } = require('../pipeline/llm');
const { validateDraft, draft, userPrompt } = require('../pipeline/generate');
const V = require('../pipeline/verify');
const S = require('../pipeline/sources');
const R = require('../pipeline/render');
const { fakeLlm, fakeGather, draftFixture } = require('./fixtures/fake-llm');

// ---------- llm.js ----------
test('parseJson tolerates fences and surrounding prose', () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a":1}\n```\nDone.'), { a: 1 });
  assert.deepEqual(parseJson('{"a":{"b":[1,2]}}'), { a: { b: [1, 2] } });
  assert.throws(() => parseJson('no json here'), /no JSON/);
});

test('createClient requires a key and calls the messages endpoint', async () => {
  assert.throws(() => createClient({ apiKey: '' }), /ANTHROPIC_API_KEY/);
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi' }] }) }; };
  const c = createClient({ apiKey: 'k', fetchImpl, model: 'm' });
  assert.equal(await c.complete({ system: 's', user: 'u' }), 'hi');
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.headers['x-api-key'], 'k');
  assert.equal(seen.body.model, 'm');
  assert.equal(seen.body.messages[0].content, 'u');
});

test('createClient surfaces API errors', async () => {
  const c = createClient({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'slow down' }) });
  await assert.rejects(c.complete({ system: '', user: '' }), /429.*slow down/);
});

// ---------- generate.js ----------
test('the fixture draft passes validation', () => {
  assert.deepEqual(validateDraft(draftFixture()), []);
});

test('validation catches structural problems and em dashes', () => {
  const d = draftFixture();
  d.steps.origin.timeline.pop();
  d.steps.uses.items.push({ title: 'x', text: 'y' });
  d.steps.reads.items[0].url = 'http://insecure';
  d.claims = d.claims.slice(0, 2);
  d.steps.why.paras[0] += ' \u2014 dash';
  const errs = validateDraft(d);
  for (const needle of ['timeline', 'uses.items', 'https', 'claims', 'dash']) assert.ok(errs.some(e => e.includes(needle)), 'missing error about ' + needle);
  assert.deepEqual(validateDraft(null), ['missing steps']);
});

test('draft retries once with the validation errors, then throws', async () => {
  const bad = () => { const d = draftFixture(); d.claims = []; return d; };
  const llm = fakeLlm({ draft: bad });
  await assert.rejects(draft({ name: 'X' }, { llm, exampleContent: {}, retries: 1 }), /draft failed validation/);
  assert.equal(llm.calls.length, 2);
  assert.match(llm.calls[1].user, /previous attempt had these problems/);
});

test('draft prompt includes the concept name and the example', () => {
  const p = userPrompt({ name: 'Raft', wikipedia: 'Raft (algorithm)' }, { title: 'EXAMPLE_TITLE' });
  assert.match(p, /"Raft"/); assert.match(p, /Raft \(algorithm\)/); assert.match(p, /EXAMPLE_TITLE/);
});

// ---------- verify.js ----------
test('resolve finds strings, array items, and item.text fields', () => {
  const d = draftFixture();
  assert.equal(V.resolve(d, 'origin.intro').get(), d.steps.origin.intro);
  assert.equal(V.resolve(d, 'why.paras[1]').get(), d.steps.why.paras[1]);
  assert.equal(V.resolve(d, 'uses.items[2]').get(), d.steps.uses.items[2].text);
  assert.equal(V.resolve(d, 'origin.timeline[9]'), null);
  assert.equal(V.resolve(d, 'nonsense'), null);
});

test('soften hedges without deleting, and keeps proper nouns capitalised', () => {
  assert.equal(V.soften('Linux uses token buckets.'), 'Linux is said to use token buckets.');
  assert.equal(V.soften('It was standardised in 1994.'), 'It was standardised around 1994.');
  assert.equal(V.soften('It is used by Stripe.'), 'It is reported to be used by Stripe.');
  assert.equal(V.soften('Amazon built it.'), 'Reportedly, Amazon built it.');
  assert.equal(V.soften('<b>Amazon</b> built it.'), '<b>Reportedly, Amazon</b> built it.');
});

test('cutSentence removes only the sentence carrying the claim', () => {
  const p = 'First sentence stays. The token bucket was standardised for ATM networks in 1994. Last one stays too.';
  assert.equal(V.cutSentence(p, 'standardised for ATM networks in 1994'), 'First sentence stays. Last one stays too.');
  assert.match(V.cutSentence('Only sentence about ATM networks.', 'ATM networks'), /removed because a trusted source disagreed/);
});

test('apply cuts contradicted, softens unverified, leaves supported, and records counts', () => {
  const d = draftFixture();
  const verdicts = [
    { id: 'c1', verdict: 'supported', source: 'Wikipedia: Token bucket' },
    { id: 'c2', verdict: 'contradicted', note: 'wrong year' },
    { id: 'c4', verdict: 'unverified' },
    { id: 'c7', verdict: 'supported', source: 'Wikipedia: Token bucket' }
  ];
  const { content, changes } = V.apply(d, verdicts);
  assert.equal(content.steps.origin.intro, d.steps.origin.intro, 'supported text untouched');
  assert.doesNotMatch(content.steps.origin.timeline[3].text, /1994/, 'contradicted sentence cut');
  assert.match(content.steps.uses.items[0].text, /said to use/, 'unverified softened');
  assert.deepEqual(content.verification.counts, { supported: 2, softened: 1, cut: 1, total: 4 });
  assert.deepEqual(content.verification.sources, ['Wikipedia: Token bucket']);
  assert.equal(content.claims, undefined, 'claims are stripped from published content');
  assert.equal(d.steps.origin.timeline[3].text.includes('1994'), true, 'input not mutated');
  assert.deepEqual(changes.map(c => c.action), ['cut', 'softened']);
});

test('apply skips verdicts whose step cannot be located', () => {
  const d = draftFixture(); d.claims.push({ id: 'c9', step: 'nowhere[3]', text: 'x' });
  const { changes } = V.apply(d, [{ id: 'c9', verdict: 'contradicted' }]);
  assert.equal(changes[0].action, 'skipped');
});

test('judge batches claims and defaults unknown verdicts to unverified', async () => {
  const claims = Array.from({ length: 25 }, (_, i) => ({ id: 'c' + i, step: 'why.paras[0]', text: 't' + i }));
  const llm = fakeLlm({ judgeFn: ids => ({ verdicts: ids.slice(1).map(id => ({ id, verdict: 'bogus' })) }) });
  const verdicts = await V.judge(claims, await fakeGather(), { llm, batch: 20 });
  assert.equal(llm.calls.length, 2, 'two batches');
  assert.equal(verdicts.length, 25);
  assert.ok(verdicts.every(v => v.verdict === 'unverified'));
});

test('judge with no sources marks everything unverified without calling the model', async () => {
  const llm = fakeLlm();
  const verdicts = await V.judge([{ id: 'c1', step: 'why.paras[0]', text: 'x' }], [], { llm });
  assert.equal(verdicts[0].verdict, 'unverified');
  assert.equal(llm.calls.length, 0);
});

test('report is skimmable markdown with one row per claim', () => {
  const d = draftFixture();
  const md = V.report({ name: 'T' }, d, [{ id: 'c1', verdict: 'supported', source: 'W', quote: 'q' }, { id: 'c2', verdict: 'unverified' }], [{ id: 'c2', action: 'softened', step: 'origin.timeline[3]' }], [{ name: 'W', url: 'https://w' }]);
  assert.match(md, /# Verification report: T/);
  assert.match(md, /supported: 1, contradicted: 0, unverified: 1/);
  assert.match(md, /\| c1 \| supported \|/);
  assert.match(md, /c2: softened in origin\.timeline\[3\]/);
});

// ---------- sources.js ----------
test('wikipedia parses the query API and builds refs and a canonical url', async () => {
  const fetchImpl = async url => ({ ok: true, json: async () => ({ query: { pages: [{ title: 'Token bucket', extract: 'Tokens are added at a fixed rate.<ref>[1]</ref>', extlinks: [{ url: 'https://example.org/paper' }, { url: 'ftp://nope' }] }] } }) });
  const w = await S.wikipedia('token bucket', { fetchImpl });
  assert.equal(w.name, 'Wikipedia: Token bucket');
  assert.equal(w.url, 'https://en.wikipedia.org/wiki/Token_bucket');
  assert.equal(w.text, 'Tokens are added at a fixed rate.');
  assert.deepEqual(w.refs, ['https://example.org/paper']);
});

test('wikipedia returns null for missing pages and non-200s', async () => {
  assert.equal(await S.wikipedia('x', { fetchImpl: async () => ({ ok: true, json: async () => ({ query: { pages: [{ missing: true }] } }) }) }), null);
  assert.equal(await S.wikipedia('x', { fetchImpl: async () => ({ ok: false }) }), null);
});

test('wikipediaIsComputing looks at categories', async () => {
  const mk = cats => async () => ({ ok: true, json: async () => ({ query: { pages: [{ categories: cats.map(c => ({ title: c })) }] } }) });
  assert.equal(await S.wikipediaIsComputing('x', { fetchImpl: mk(['Category:Computer networking']) }), true);
  assert.equal(await S.wikipediaIsComputing('x', { fetchImpl: mk(['Category:Cat breeds']) }), false);
});

test('reference keeps only sizeable html/text pages', async () => {
  const html = async () => ({ ok: true, headers: new Map([['content-type', 'text/html']]), text: async () => '<p>' + 'word '.repeat(300) + '</p>' });
  const pdf = async () => ({ ok: true, headers: new Map([['content-type', 'application/pdf']]), text: async () => '' });
  assert.ok((await S.reference('https://a', { fetchImpl: html })).text.length > 500);
  assert.equal(await S.reference('https://a', { fetchImpl: pdf }), null);
  assert.equal(await S.reference('https://a', { fetchImpl: async () => { throw new Error('net'); } }), null);
});

test('gather combines wikipedia, mdn and references and tolerates misses', async () => {
  const fetchImpl = async url => {
    if (/wikipedia/.test(url)) return { ok: true, json: async () => ({ query: { pages: [{ title: 'X', extract: 'wiki text', extlinks: [] }] } }) };
    if (/mozilla.*search/.test(url)) return { ok: true, json: async () => ({ documents: [{ title: 'Fetch API', mdn_url: '/en-US/docs/Web/API/Fetch_API' }] }) };
    if (/mozilla.*index\.json/.test(url)) return { ok: true, json: async () => ({ doc: { body: [{ value: { content: '<p>mdn text</p>' } }] } }) };
    return { ok: false, headers: new Map() };
  };
  const srcs = await S.gather({ name: 'X', wikipedia: 'X', mdn: 'fetch', references: ['https://dead.example'] }, { fetchImpl });
  assert.deepEqual(srcs.map(s => s.name), ['Wikipedia: X', 'MDN: Fetch API']);
  assert.equal(srcs[1].text, 'mdn text');
});

// ---------- render.js ----------
test('renderPage escapes titles and renders a no-playground fallback with nav', () => {
  const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'token-bucket.json'), 'utf8'));
  c.title = '<script>x</script>';
  const html = R.renderPage({ ...c, playground: null, lib: null });
  assert.match(html, /<h1>&lt;script&gt;x&lt;\/script&gt;<\/h1>/);
  assert.match(html, /doesn't have a hands-on playground yet/);
  assert.doesNotMatch(html, /data-inlined/);
  assert.match(html, /data-go="5"/);
  assert.match(html, /Facts checked against:/);
});

test('rendered pages are in sync with content and concepts (what CI enforces)', () => {
  const before = fs.readFileSync(path.join(__dirname, '..', 'bloom-filter-explainer.html'), 'utf8');
  R.renderAll();
  const after = fs.readFileSync(path.join(__dirname, '..', 'bloom-filter-explainer.html'), 'utf8');
  assert.equal(after, before);
});

test('index lists only published concepts', () => {
  const html = R.renderIndex([{ id: 'a', name: 'A', hook: 'h', published: true }, { id: 'b', name: 'B', hook: 'h', published: false }]);
  assert.match(html, /a-explainer\.html/); assert.doesNotMatch(html, /b-explainer\.html/);
});

// ---------- run.js end to end (offline) ----------
test('dry run produces content, a report and a page for token-bucket', async () => {
  const { run } = require('../pipeline/run');
  const out = await run('token-bucket', { llm: fakeLlm(), gather: fakeGather, write: false });
  assert.equal(out.content.id, 'token-bucket');
  assert.deepEqual(out.content.verification.counts, { supported: 4, softened: 2, cut: 1, total: 7 });
  assert.match(out.report, /# Verification report/);
  assert.equal(out.content.claims, undefined);
  await assert.rejects(run('not-a-concept', { llm: fakeLlm(), gather: fakeGather, write: false }), /not in concepts\.json/);
});

// ---------- Bloom filter regression run (offline) ----------
test('dry run on the hand-verified Bloom page: memory-only claims come back unverified', async () => {
  const { run } = require('../pipeline/run');
  const { dryFor } = require('./fixtures/fake-llm');
  const out = await run('bloom-filter', { ...dryFor('bloom-filter'), write: false });
  const byId = Object.fromEntries(out.verdicts.map(v => [v.id, v.verdict]));
  // facts that are in the 1970 paper / official docs excerpts
  for (const id of ['c2', 'c3', 'c5', 'c6', 'c10', 'c11']) assert.equal(byId[id], 'supported', id);
  // counting and cuckoo filters were never in the sources we read; the page should hedge them
  assert.equal(byId.c8, 'unverified'); assert.equal(byId.c9, 'unverified');
  assert.equal(out.content.verification.counts.cut, 0, 'nothing contradicted');
  assert.match(out.content.steps.origin.timeline[3].text, /Reportedly|said to|around|reported to/);
});

test('dry run writes only the .dry report and never touches hand-verified content', async () => {
  const { run } = require('../pipeline/run');
  const { dryFor } = require('./fixtures/fake-llm');
  const root = path.join(__dirname, '..');
  const contentBefore = fs.readFileSync(path.join(root, 'content/bloom-filter.json'), 'utf8');
  const pageBefore = fs.readFileSync(path.join(root, 'bloom-filter-explainer.html'), 'utf8');
  await run('bloom-filter', { ...dryFor('bloom-filter'), write: true, dry: true });
  assert.equal(fs.readFileSync(path.join(root, 'content/bloom-filter.json'), 'utf8'), contentBefore);
  assert.equal(fs.readFileSync(path.join(root, 'bloom-filter-explainer.html'), 'utf8'), pageBefore);
  assert.ok(fs.existsSync(path.join(root, 'reports/bloom-filter.dry.md')));
});

test('overlap judge supports claims whose anchors appear in a source and never contradicts', () => {
  const { overlapVerdicts } = require('./fixtures/fake-llm');
  const sources = [{ name: 'S', text: 'Burton H. Bloom published in 1970 in Communications of the ACM.' }];
  const v = overlapVerdicts([{ id: 'a', text: 'Bloom published in 1970.' }, { id: 'b', text: 'Zebras invented Raft in 2013.' }], sources).verdicts;
  assert.equal(v[0].verdict, 'supported'); assert.equal(v[0].source, 'S');
  assert.equal(v[1].verdict, 'unverified');
});

// ---------- fixes found by the manual Bloom preview ----------
test('splitSentences keeps initials and abbreviations together but splits after years', () => {
  assert.deepEqual(V.splitSentences('Burton H. Bloom of Computer Usage Co. wrote it. It was 1970. Done.'),
    ['Burton H. Bloom of Computer Usage Co. wrote it.', 'It was 1970.', 'Done.']);
});

test('a sentence is hedged at most once even when several claims point at it', () => {
  const d = draftFixture();
  d.steps.origin.intro = 'In 1970, Burton H. Bloom published a paper in Communications of the ACM.';
  d.claims = [
    { id: 'a', step: 'origin.intro', text: 'Bloom published in 1970' },
    { id: 'b', step: 'origin.intro', text: 'Communications of the ACM' },
    { id: 'c', step: 'origin.intro', text: 'Burton H. Bloom' }
  ];
  const { content } = V.apply(d, [{ id: 'a', verdict: 'unverified' }, { id: 'b', verdict: 'unverified' }, { id: 'c', verdict: 'unverified' }]);
  assert.equal(content.steps.origin.intro, 'Around 1970, Burton H. Bloom published a paper in Communications of the ACM.');
});

test('softening keeps proper nouns capitalised and lowercases only function words', () => {
  assert.equal(V.soften('The idea spread.'), 'Reportedly, the idea spread.');
  assert.equal(V.soften('Cassandra keeps one per file.'), 'Reportedly, Cassandra keeps one per file.');
  assert.equal(V.soften('In 1994 it was standardised.'), 'Around 1994 it was standardised.');
  assert.equal(V.soften(V.soften('The idea spread.')), 'Reportedly, the idea spread.', 'idempotent');
});

// ---------- PDF references ----------
test('reference extracts text from a real PDF', async () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-ref.pdf'));
  const fetchImpl = async () => ({ ok: true, headers: new Map([['content-type', 'application/pdf']]), arrayBuffer: async () => buf });
  const r = await S.reference('https://example.org/survey.pdf', { fetchImpl, minChars: 50 });
  assert.ok(r, 'reference returned');
  assert.match(r.text, /only in recent years have they become popular in the networking literature/);
  assert.equal(r.name, 'Reference: https://example.org/survey.pdf');
});

test('reference treats a .pdf URL as PDF even without a content-type, via injected parser', async () => {
  const fetchImpl = async () => ({ ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(8) });
  const pdfText = async () => 'x '.repeat(400) + 'consistent hashing was introduced in 1997';
  const r = await S.reference('https://example.org/paper.pdf', { fetchImpl, pdfText });
  assert.ok(r && /1997/.test(r.text));
});

test('gather follows paper-like Wikipedia references, skips archive.org, caps the count', async () => {
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    if (/wikipedia/.test(url)) return { ok: true, json: async () => ({ query: { pages: [{ title: 'X', extract: 'wiki', extlinks: [
      { url: 'https://web.archive.org/web/2020/https://a.edu/p.pdf' }, { url: 'https://a.edu/p.pdf' }, { url: 'https://doi.org/10.1/x' }, { url: 'https://example.com/blog' } ] }] } }) };
    return { ok: true, headers: new Map([['content-type', 'text/html']]), text: async () => '<p>' + 'ref text '.repeat(100) + '</p>', arrayBuffer: async () => new ArrayBuffer(8) };
  };
  const pdfText = async () => 'pdf text '.repeat(100);
  const srcs = await S.gather({ name: 'X', wikipedia: 'X' }, { fetchImpl, pdfText });
  assert.deepEqual(srcs.map(s => s.name), ['Wikipedia: X', 'Reference: https://a.edu/p.pdf', 'Reference: https://doi.org/10.1/x']);
  assert.ok(!seen.some(u => /web\.archive\.org|example\.com\/blog/.test(u)));
});

// ---------- the manual no-key preview, frozen as a regression ----------
// Draft written by Claude from the pipeline prompt; verdicts judged by Claude against the full Wikipedia article.
test('preview: fresh Bloom draft + Wikipedia-only verdicts apply cleanly', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bloom-filter.generated.draft.json'), 'utf8'));
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bloom-filter.wikipedia.verdicts.json'), 'utf8')).verdicts;
  assert.deepEqual(validateDraft(d), []);
  const { content, changes } = V.apply(d, v);
  assert.deepEqual(content.verification.counts, { supported: 10, softened: 6, cut: 0, total: 16 });
  const intro = content.steps.origin.intro;
  assert.equal((intro.match(/Reportedly/g) || []).length, 0, 'year softener used, not a prefix');
  assert.match(intro, /^Around 1970, <b>Burton H\. Bloom<\/b>/);
  assert.doesNotMatch(intro, /Reportedly, Reportedly/);
  assert.match(content.steps.uses.items[0].text, /^Apache Cassandra keeps .* Reportedly, RocksDB/);
  // page renders from it
  const html = R.renderPage({ ...content, id: 'x', name: 'x', hook: 'x', playground: 'bloom', lib: 'bloom.js' });
  assert.match(html, /Facts checked against: Wikipedia: Bloom filter/);
});
