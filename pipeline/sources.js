// Trusted sources the verifier reads. Each returns { name, url, text } or null.
// Kept small and dependency-free; `fetchImpl` is injectable for tests.

const UA = 'break-it-explainer/0.1 (verification bot; https://github.com/zestytinker/break-it-explainer)';

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

// Strip wikitext/HTML noise down to readable plain text.
function cleanText(s) {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

// Wikipedia: plain-text extract of the whole article plus its external reference URLs.
async function wikipedia(title, { fetchImpl = globalThis.fetch, lang = 'en' } = {}) {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const q = new URLSearchParams({ action: 'query', prop: 'extracts|extlinks', explaintext: '1', exsectionformat: 'plain', ellimit: '200', titles: title, redirects: '1', format: 'json', formatversion: '2' });
  const data = await getJson(fetchImpl, `${api}?${q}`);
  const page = data && data.query && data.query.pages && data.query.pages[0];
  if (!page || page.missing) return null;
  const refs = (page.extlinks || []).map(l => l.url).filter(u => /^https?:/.test(u));
  return {
    name: `Wikipedia: ${page.title}`,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    text: cleanText(page.extract || ''),
    refs
  };
}

// Does Wikipedia consider this a computing topic? Used by the menu-curation helper, not at runtime.
async function wikipediaIsComputing(title, { fetchImpl = globalThis.fetch } = {}) {
  const q = new URLSearchParams({ action: 'query', prop: 'categories', cllimit: '100', titles: title, redirects: '1', format: 'json', formatversion: '2' });
  const data = await getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?${q}`);
  const page = data && data.query && data.query.pages && data.query.pages[0];
  if (!page || page.missing) return false;
  return (page.categories || []).some(c => /comput|software|algorithm|data structure|network|programming|cryptograph|database/i.test(c.title));
}

// MDN: search, then fetch the top article as plain text. Only useful for web-platform concepts.
async function mdn(query, { fetchImpl = globalThis.fetch } = {}) {
  const data = await getJson(fetchImpl, `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`);
  const doc = data && data.documents && data.documents[0];
  if (!doc) return null;
  const res = await fetchImpl(`https://developer.mozilla.org${doc.mdn_url}/index.json`, { headers: { 'user-agent': UA } });
  if (!res.ok) return null;
  const body = await res.json();
  const text = cleanText(((body.doc && body.doc.body) || []).map(s => (s.value && s.value.content) || '').join(' '));
  return { name: `MDN: ${doc.title}`, url: `https://developer.mozilla.org${doc.mdn_url}`, text };
}

// Extract text from a PDF buffer. Injectable so tests need no real parser.
async function defaultPdfText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try { return (await parser.getText()).text || ''; } finally { if (parser.destroy) await parser.destroy(); }
}

// Fetch an open-access reference (the original paper, official docs) as text.
// Handles HTML, plain text, and PDF (by content-type or .pdf in the URL).
async function reference(url, { fetchImpl = globalThis.fetch, maxChars = 60000, minChars = 500, pdfText = defaultPdfText } = {}) {
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    let raw;
    if (/application\/pdf/.test(type) || /\.pdf(\?|$)/i.test(url)) {
      raw = await pdfText(Buffer.from(await res.arrayBuffer()));
    } else if (/text\/html|text\/plain/.test(type)) {
      raw = await res.text();
    } else return null;
    const text = cleanText(raw).slice(0, maxChars);
    return text.length >= minChars ? { name: `Reference: ${url}`, url, text } : null;
  } catch { return null; }
}

// Gather everything the verifier should read for a concept.
async function gather(concept, opts = {}) {
  const sources = [];
  const wiki = await wikipedia(concept.wikipedia || concept.name, opts);
  if (wiki) sources.push(wiki);
  if (concept.mdn) { const m = await mdn(concept.mdn, opts); if (m) sources.push(m); }
  for (const url of concept.references || []) { const r = await reference(url, opts); if (r) sources.push(r); }
  // Also read Wikipedia's own references when they look like papers or official docs (open-access only; PDFs handled).
  if (wiki && !opts.skipWikiRefs) {
    const picked = wiki.refs.filter(u => /\.pdf(\?|$)|doi\.org|acm\.org|arxiv\.org|\.edu\/|docs\.|\/wiki\//i.test(u) && !/web\.archive\.org/.test(u)).slice(0, opts.maxWikiRefs || 4);
    for (const url of picked) { const r = await reference(url, opts); if (r) sources.push(r); }
  }
  return sources;
}

module.exports = { wikipedia, wikipediaIsComputing, mdn, reference, gather, cleanText };
