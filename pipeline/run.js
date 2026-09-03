#!/usr/bin/env node
// Generate and verify one concept from concepts.json.
//   ANTHROPIC_API_KEY=... node pipeline/run.js token-bucket
//   node pipeline/run.js token-bucket --dry   (uses fixtures, no network; for trying the flow)
const fs = require('fs');
const path = require('path');
const { createClient } = require('./llm');
const { draft } = require('./generate');
const sources = require('./sources');
const { judge, apply, report } = require('./verify');
const { renderAll } = require('./render');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

async function run(id, { llm, gather = sources.gather, write = true } = {}) {
  const concepts = JSON.parse(read('concepts.json'));
  const concept = concepts.find(c => c.id === id);
  if (!concept) throw new Error(`${id} is not in concepts.json. Add it to the menu first.`);

  // Tone example: the first published concept's content (facts differ, shape matches).
  const exampleId = concepts.find(c => c.published && c.id !== id).id;
  const example = JSON.parse(read(`content/${exampleId}.json`));
  delete example.verification;

  console.log(`[1/4] drafting ${concept.name}`);
  const d = await draft(concept, { llm, exampleContent: example });

  console.log(`[2/4] gathering sources`);
  const srcs = await gather(concept);
  console.log(`      ${srcs.length} source(s): ${srcs.map(s => s.name).join('; ') || 'none'}`);

  console.log(`[3/4] judging ${d.claims.length} claims`);
  const verdicts = await judge(d.claims, srcs, { llm });
  const { content, changes } = apply(d, verdicts);
  const md = report(concept, d, verdicts, changes, srcs);

  const final = { id: concept.id, name: concept.name, hook: concept.hook, ...content };
  if (write) {
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, `content/${concept.id}.json`), JSON.stringify(final, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, `reports/${concept.id}.md`), md);
    console.log(`[4/4] rendering`);
    renderAll(concept.id);
    console.log(`\nwrote content/${concept.id}.json, reports/${concept.id}.md, ${concept.id}-explainer.html`);
    console.log(`verdicts: ${JSON.stringify(final.verification.counts)}`);
    console.log(`next: read reports/${concept.id}.md, then set "published": true in concepts.json and run npm run build`);
  }
  return { content: final, verdicts, changes, report: md };
}

if (require.main === module) {
  const id = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!id) { console.error('usage: node pipeline/run.js <concept-id> [--dry]'); process.exit(1); }
  const opts = {};
  if (dry) {
    const fx = require('../test/fixtures/fake-llm');
    opts.llm = fx.fakeLlm(); opts.gather = fx.fakeGather;
  } else {
    opts.llm = createClient();
  }
  run(id, opts).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { run };
