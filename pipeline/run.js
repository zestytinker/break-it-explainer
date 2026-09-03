#!/usr/bin/env node
// Generate and verify one concept from concepts.json.
//   ANTHROPIC_API_KEY=... node pipeline/run.js token-bucket
//   node pipeline/run.js bloom-filter --dry   (fixtures, no network; writes reports/<id>.dry.md only)
//   node pipeline/run.js bloom-filter         (hand-verified content exists: writes content/<id>.generated.json + report, page untouched)
//   node pipeline/run.js bloom-filter --force (replace the hand-verified content and re-render)
const fs = require('fs');
const path = require('path');
const { createClient } = require('./llm');
const { draft } = require('./generate');
const sources = require('./sources');
const { judge, apply, report } = require('./verify');
const { renderAll } = require('./render');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

async function run(id, { llm, gather = sources.gather, write = true, dry = false, force = false } = {}) {
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
    const contentPath = path.join(ROOT, `content/${concept.id}.json`);
    const existing = fs.existsSync(contentPath) ? JSON.parse(fs.readFileSync(contentPath, 'utf8')) : null;
    const manual = existing && existing.verification && existing.verification.method === 'manual';
    const reportName = dry ? `reports/${concept.id}.dry.md` : `reports/${concept.id}.md`;
    fs.writeFileSync(path.join(ROOT, reportName), md);
    if (dry) {
      console.log(`[4/4] dry run: wrote ${reportName} only (no content or page changed)`);
    } else if (manual && !force) {
      const alt = `content/${concept.id}.generated.json`;
      fs.writeFileSync(path.join(ROOT, alt), JSON.stringify(final, null, 2) + '\n');
      console.log(`[4/4] ${concept.id} has hand-verified content; wrote ${alt} and ${reportName} for comparison. Use --force to replace the page.`);
    } else {
      fs.writeFileSync(contentPath, JSON.stringify(final, null, 2) + '\n');
      console.log(`[4/4] rendering`);
      renderAll(concept.id);
      console.log(`\nwrote content/${concept.id}.json, ${reportName}, ${concept.id}-explainer.html`);
      console.log(`next: read ${reportName}, then set "published": true in concepts.json and run npm run build`);
    }
    console.log(`verdicts: ${JSON.stringify(final.verification.counts)}`);
  }
  return { content: final, verdicts, changes, report: md };
}

if (require.main === module) {
  const id = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!id) { console.error('usage: node pipeline/run.js <concept-id> [--dry]'); process.exit(1); }
  const opts = { dry, force: process.argv.includes('--force') };
  if (dry) Object.assign(opts, require('../test/fixtures/fake-llm').dryFor(id));
  else opts.llm = createClient();
  run(id, opts).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { run };
