// Draft stage. Produces content JSON in the same shape as content/*.json, plus a list of
// factual claims (each pointing at the sentence it came from) for the verifier.
const { parseJson } = require('./llm');

const SYSTEM = `You write short, playful, accurate explainers of tech concepts for curious 20-somethings with a little software knowledge.
Style rules: everyday analogies, plain words, no jargon without a one-line gloss, no em dashes (use commas or full stops), sentences that mean something, no filler.
Honesty rules: every date, name, number, and "X uses Y" statement must be a real fact you are confident about. If unsure, leave it out rather than guess. Prefer the original motivation (why people invented it) and one concrete first use.
Output: a single JSON object, no prose around it.`;

function userPrompt(concept, exampleContent) {
  return `Write the explainer for: "${concept.name}".${concept.wikipedia ? ` (Wikipedia title: "${concept.wikipedia}")` : ''}

Follow this exact JSON shape. The example is the finished explainer for a different concept; match its tone, length and structure, not its facts.

EXAMPLE (for tone and shape only):
${JSON.stringify(exampleContent, null, 1)}

Requirements for your output:
- "steps.why.paras": 2 or 3 short paragraphs. Open with a concrete pain, then the analogy. Bold key phrases with <b>.
- "steps.how.paras" and "steps.break.paras": 2 paragraphs each, describing what a hands-on playground would let the reader do and what breaks. Write them even though the playground may not exist yet.
- "steps.origin": "intro" names who, when, where, and the paper or product; "timeline" has exactly four entries labelled "The problem", "The naive fix", "The insight", "Since then"; "takeaway" states the trade-off in one or two sentences.
- "steps.uses.items": exactly 3 real systems. "caveat": what the idea cannot do.
- "steps.reads.items": 3 to 5 links, source first. Only include URLs you are confident exist; prefer official docs, the original paper's DOI page, Wikipedia.
- Every "next" is a short playful button label.
- "claims": an array of every checkable factual statement in the text (names, years, numbers, "X uses Y", "first appeared in"). Each: {"id":"c1","step":"origin.timeline[0]","text":"<the claim in one plain sentence>"}. Aim for 8 to 20 claims. Do not include opinions or analogies.

Return: {"pageTitle","title","subtitle","steps":{...},"claims":[...]}`;
}

function validateDraft(d) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(d && typeof d === 'object', 'not an object');
  if (!d || !d.steps) return ['missing steps'];
  const s = d.steps;
  need(typeof d.title === 'string' && d.title.length > 3, 'title');
  need(typeof d.subtitle === 'string', 'subtitle');
  need(Array.isArray(s.why && s.why.paras) && s.why.paras.length >= 2, 'why.paras');
  need(Array.isArray(s.how && s.how.paras) && s.how.paras.length >= 1, 'how.paras');
  need(Array.isArray(s.break && s.break.paras) && s.break.paras.length >= 1, 'break.paras');
  need(s.origin && typeof s.origin.intro === 'string', 'origin.intro');
  need(s.origin && Array.isArray(s.origin.timeline) && s.origin.timeline.length === 4, 'origin.timeline must have 4 entries');
  need(s.uses && Array.isArray(s.uses.items) && s.uses.items.length === 3, 'uses.items must have 3 entries');
  need(s.uses && typeof s.uses.caveat === 'string', 'uses.caveat');
  need(s.reads && Array.isArray(s.reads.items) && s.reads.items.length >= 3, 'reads.items');
  if (s.reads && Array.isArray(s.reads.items)) s.reads.items.forEach((r, i) => need(/^https:\/\//.test(r.url || ''), `reads.items[${i}].url must be https`));
  need(Array.isArray(d.claims) && d.claims.length >= 5, 'claims (at least 5)');
  if (Array.isArray(d.claims)) d.claims.forEach((c, i) => need(c && c.id && c.text && c.step, `claims[${i}] needs id, step, text`));
  ['why', 'how', 'break', 'origin', 'uses'].forEach(k => need(s[k] && typeof s[k].next === 'string', `${k}.next`));
  // house style: no em dashes anywhere
  const flat = JSON.stringify(d);
  need(!/[\u2014\u2013]/.test(flat), 'contains an em/en dash');
  return errs;
}

async function draft(concept, { llm, exampleContent, retries = 1 }) {
  let lastErrs = [];
  for (let attempt = 0; attempt <= retries; attempt++) {
    const text = await llm.complete({ system: SYSTEM, user: userPrompt(concept, exampleContent) + (lastErrs.length ? `\n\nYour previous attempt had these problems, fix them: ${lastErrs.join('; ')}` : '') });
    const d = parseJson(text);
    lastErrs = validateDraft(d);
    if (!lastErrs.length) return d;
  }
  throw new Error('draft failed validation: ' + lastErrs.join('; '));
}

module.exports = { draft, validateDraft, userPrompt, SYSTEM };
