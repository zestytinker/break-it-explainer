// Renders explainer pages from content/*.json using the six-step layout.
//   node pipeline/render.js              renders every concept in concepts.json plus index.html
//   node pipeline/render.js bloom-filter renders one
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STEP_LABELS = ['1. Why', '2. How', '3. Break it', '4. Origin story', '5. Where it lives', '6. Read further'];

function playgroundParts(name) {
  if (!name) return { css: '', script: '' };
  const p = read(`playgrounds/${name}.html`);
  const css = p.slice(p.indexOf('<style>') + 7, p.indexOf('</style>'));
  const script = p.slice(p.indexOf('<!-- script -->') + 15).trim();
  return { css, script };
}

function renderPage(c) {
  const s = c.steps;
  const pg = playgroundParts(c.playground);
  const lib = c.lib ? `<script data-inlined="${c.lib}">\n${read(c.lib)}</script>\n` : '';
  const paras = arr => arr.map(p => `    <p class="story">${p}</p>`).join('\n');
  const next = (go, label, primary = true) => `    <div class="next"><button class="btn${primary ? ' primary' : ''}" data-go="${go}">${label}</button></div>`;
  const noPlayground = `    <div class="caveat">This concept doesn't have a hands-on playground yet. The prose steps are ready; the interactive part is on the roadmap.</div>`;

  const verified = c.verification && c.verification.sources && c.verification.sources.length
    ? `  <p class="verified">Facts checked against: ${c.verification.sources.map(esc).join('; ')}.</p>\n` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.pageTitle || c.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${read('pipeline/base.css')}${pg.css}</style>
</head>
<body>
<main>
  <h1>${esc(c.title)}</h1>
  <p class="sub">${esc(c.subtitle)}</p>

  <nav aria-label="Steps">
${STEP_LABELS.map((l, i) => `    <button data-go="${i}"${i === 0 ? ' aria-current="step"' : ''}>${l}</button>`).join('\n')}
  </nav>

  <!-- STEP 1 -->
  <section class="step on" data-step="0">
${paras(s.why.paras)}
${next(1, s.why.next)}
  </section>

  <!-- STEP 2 -->
  <section class="step" data-step="1">
${paras(s.how.paras)}
${c.playground ? '    <div class="playground" data-pg></div>' : noPlayground}
${next(2, s.how.next)}
  </section>

  <!-- STEP 3 -->
  <section class="step" data-step="2">
${paras(s.break.paras)}
${c.playground ? '    <div class="playground" data-pg data-advanced></div>' : noPlayground}
${next(3, s.break.next)}
  </section>

  <!-- STEP 4: origin -->
  <section class="step" data-step="3">
    <p class="story">${s.origin.intro}</p>
    <div class="timeline">
${s.origin.timeline.map(t => `      <div class="tl"><span class="tl-year">${esc(t.label)}</span><p>${t.text}</p></div>`).join('\n')}
    </div>
${s.origin.takeaway ? `    <p class="story">${s.origin.takeaway}</p>\n` : ''}${next(4, s.origin.next)}
  </section>

  <!-- STEP 5 -->
  <section class="step" data-step="4">
${s.uses.intro ? `    <p class="story">${s.uses.intro}</p>\n` : ''}    <div class="uses">
${s.uses.items.map(u => `      <div class="use"><h3>${esc(u.title)}</h3><p>${u.text}</p></div>`).join('\n')}
    </div>
    <div class="caveat">${s.uses.caveat}</div>
${next(5, s.uses.next)}
  </section>

  <!-- STEP 6: further reading -->
  <section class="step" data-step="5">
    <p class="story">${s.reads.intro}</p>
    <div class="reads">
${s.reads.items.map(r => `      <a class="read" href="${esc(r.url)}" target="_blank" rel="noopener"><h3>${esc(r.title)}</h3><p>${esc(r.note)}</p></a>`).join('\n')}
    </div>
${next(1, 'Back to the playground', false)}
  </section>

${verified}  <footer>Built as a prototype for explaining tech concepts to curious generalists.</footer>
</main>

${lib}${pg.script || navOnlyScript()}
</body>
</html>
`;
}

// Pages without a playground still need step navigation.
function navOnlyScript() {
  return `<script>
(() => {
  const go = n => {
    document.querySelectorAll('.step').forEach(s => s.classList.toggle('on', s.dataset.step == n));
    document.querySelectorAll('nav button').forEach(b => b.dataset.go == n ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
})();
</script>`;
}

function renderIndex(concepts) {
  const pub = concepts.filter(c => c.published);
  const cards = pub.map(c =>
    `    <a class="card" href="${c.id}-explainer.html"><h2>${esc(c.name)}${c.playground ? ' <span class="tag">with playground</span>' : ''}</h2><p>${esc(c.hook)}</p></a>`).join('\n');
  const published = pub.map(c => ({ id: c.id, name: c.name, aliases: c.aliases || [], playground: !!c.playground }));
  const known = JSON.parse(read('pipeline/known-concepts.json')).concepts;
  const t = read('pipeline/index.template.html');
  return t.replace('<!-- cards -->', cards)
    .replace('<!-- gate.js -->', `<script data-inlined="gate.js">\n${read('gate.js')}</script>`)
    .replace('/*published*/[]', JSON.stringify(published))
    .replace('/*known*/[]', JSON.stringify(known));
}

function renderAll(only) {
  const concepts = JSON.parse(read('concepts.json'));
  const out = [];
  for (const c of concepts) {
    if (only && c.id !== only) continue;
    const file = `content/${c.id}.json`;
    if (!fs.existsSync(path.join(ROOT, file))) { if (only) throw new Error(`no content for ${c.id}; run the pipeline first`); continue; }
    const content = JSON.parse(read(file));
    const html = renderPage({ ...content, playground: c.playground, lib: c.lib });
    fs.writeFileSync(path.join(ROOT, `${c.id}-explainer.html`), html);
    out.push(`${c.id}-explainer.html`);
  }
  if (!only) { fs.writeFileSync(path.join(ROOT, 'index.html'), renderIndex(concepts)); out.push('index.html'); }
  return out;
}

module.exports = { renderPage, renderIndex, renderAll, esc };

if (require.main === module) {
  const files = renderAll(process.argv[2]);
  console.log('rendered ' + files.join(', '));
}
