// Verify stage.
//   judge(claims, sources, llm)  -> verdicts, one per claim: supported | contradicted | unverified
//   apply(draft, verdicts)       -> new draft with contradicted claims cut and unverified ones softened (pure, tested)
//   report(concept, verdicts)    -> markdown a human can skim in two minutes
const { parseJson } = require('./llm');

const JUDGE_SYSTEM = `You are a strict fact checker. You will get a list of claims and excerpts from trusted sources.
For each claim decide:
- "supported": a source states it, or states something that clearly implies it.
- "contradicted": a source states something incompatible with it (wrong year, wrong person, wrong number).
- "unverified": the sources do not address it. Do NOT use your own memory to mark a claim supported; only the sources count.
Quote the shortest source phrase (under 15 words) that decided it. Output a single JSON object, no prose.`;

function chunk(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function judgePrompt(claims, sources, maxPerSource) {
  const excerpts = sources.map(s => `### ${s.name} (${s.url})\n${s.text.slice(0, maxPerSource)}`).join('\n\n');
  return `CLAIMS:\n${claims.map(c => `${c.id}: ${c.text}`).join('\n')}\n\nSOURCES:\n${excerpts}\n\nReturn {"verdicts":[{"id":"c1","verdict":"supported|contradicted|unverified","source":"<source name or empty>","quote":"<short phrase or empty>","note":"<one line, only if contradicted: what the source says instead>"}]}`;
}

async function judge(claims, sources, { llm, maxPerSource = 40000, batch = 20 }) {
  if (!sources.length) return claims.map(c => ({ id: c.id, verdict: 'unverified', source: '', quote: '', note: 'no sources available' }));
  const verdicts = [];
  for (const group of chunk(claims, batch)) {
    const text = await llm.complete({ system: JUDGE_SYSTEM, user: judgePrompt(group, sources, maxPerSource), maxTokens: 3000 });
    const parsed = parseJson(text);
    const byId = new Map((parsed.verdicts || []).map(v => [v.id, v]));
    for (const c of group) {
      const v = byId.get(c.id) || {};
      const verdict = ['supported', 'contradicted', 'unverified'].includes(v.verdict) ? v.verdict : 'unverified';
      verdicts.push({ id: c.id, verdict, source: v.source || '', quote: (v.quote || '').slice(0, 120), note: v.note || '' });
    }
  }
  return verdicts;
}

// ---------- deterministic application of verdicts ----------

// Resolve a "step" path like "origin.timeline[2]" or "uses.items[1]" or "why.paras[0]" to a getter/setter on the draft.
function resolve(draft, stepPath) {
  const m = stepPath.match(/^(why|how|break|origin|uses|reads)(?:\.(\w+))?(?:\[(\d+)\])?$/);
  if (!m) return null;
  const [, step, field, idx] = m;
  const node = draft.steps[step];
  if (!node) return null;
  if (field && idx != null) {
    const arr = node[field]; if (!Array.isArray(arr) || !arr[+idx]) return null;
    const item = arr[+idx];
    if (typeof item === 'string') return { get: () => arr[+idx], set: v => { arr[+idx] = v; } };
    if (item && typeof item.text === 'string') return { get: () => item.text, set: v => { item.text = v; } };
    return null;
  }
  if (field && typeof node[field] === 'string') return { get: () => node[field], set: v => { node[field] = v; } };
  return null;
}

const SOFTENERS = [
  [/\b(is|are) used (by|in)\b/i, (m, a, b) => `${a} reported to be used ${b}`],
  [/\b(uses|use)\b/i, (m, a) => (a === 'uses' ? 'is said to use' : 'are said to use')],
  [/\bin (\d{4})\b/, 'around $1'],
  [/\babout (\d+)/i, 'roughly $1'],
];

// Insert a hedge into a sentence that contains the claim, without deleting it.
function soften(sentence) {
  for (const [re, rep] of SOFTENERS) if (re.test(sentence)) return sentence.replace(re, rep);
  return sentence.replace(/^(\s*(?:<b>)?)/, '$1' + 'Reportedly, ');
}

// Remove the sentence that carries the claim; if it was the whole passage, replace with a neutral line.
function cutSentence(passage, claimText) {
  const sentences = passage.split(/(?<=[.!?])\s+/);
  const words = claimText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const score = s => words.filter(w => s.toLowerCase().includes(w)).length;
  let best = 0, bi = -1;
  sentences.forEach((s, i) => { const sc = score(s); if (sc > best) { best = sc; bi = i; } });
  if (bi < 0) return passage;
  const rest = sentences.filter((_, i) => i !== bi).join(' ').trim();
  return rest || 'Details here were removed because a trusted source disagreed with the draft.';
}

function apply(draft, verdicts) {
  const out = JSON.parse(JSON.stringify(draft));
  const byId = new Map((out.claims || []).map(c => [c.id, c]));
  const changes = [];
  for (const v of verdicts) {
    const claim = byId.get(v.id); if (!claim || v.verdict === 'supported') continue;
    const ref = resolve(out, claim.step); if (!ref) { changes.push({ id: v.id, action: 'skipped', reason: `cannot locate ${claim.step}` }); continue; }
    const before = ref.get();
    if (v.verdict === 'contradicted') { ref.set(cutSentence(before, claim.text)); changes.push({ id: v.id, action: 'cut', step: claim.step, note: v.note }); }
    else {
      // soften only the sentence that carries the claim
      const sentences = before.split(/(?<=[.!?])\s+/);
      const words = claim.text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      let bi = 0, best = -1;
      sentences.forEach((s, i) => { const sc = words.filter(w => s.toLowerCase().includes(w)).length; if (sc > best) { best = sc; bi = i; } });
      sentences[bi] = soften(sentences[bi]);
      ref.set(sentences.join(' '));
      changes.push({ id: v.id, action: 'softened', step: claim.step });
    }
  }
  const supported = verdicts.filter(v => v.verdict === 'supported');
  out.verification = {
    method: 'llm-judged',
    counts: { supported: supported.length, softened: changes.filter(c => c.action === 'softened').length, cut: changes.filter(c => c.action === 'cut').length, total: verdicts.length },
    sources: [...new Set(supported.map(v => v.source).filter(Boolean))]
  };
  delete out.claims;
  return { content: out, changes };
}

function report(concept, draft, verdicts, changes, sources) {
  const byId = new Map((draft.claims || []).map(c => [c.id, c]));
  const line = v => `| ${v.id} | ${v.verdict} | ${(byId.get(v.id) || {}).text || ''} | ${v.source || ''} | ${v.quote ? `"${v.quote}"` : ''} ${v.note || ''} |`;
  const counts = ['supported', 'contradicted', 'unverified'].map(k => `${k}: ${verdicts.filter(v => v.verdict === k).length}`).join(', ');
  return `# Verification report: ${concept.name}

Sources read: ${sources.length ? sources.map(s => `[${s.name}](${s.url})`).join(', ') : 'none'}

Claims: ${verdicts.length} (${counts})

| id | verdict | claim | source | evidence |
|---|---|---|---|---|
${verdicts.map(line).join('\n')}

## Changes applied
${changes.length ? changes.map(c => `- ${c.id}: ${c.action}${c.step ? ` in ${c.step}` : ''}${c.note ? `: ${c.note}` : ''}${c.reason ? ` (${c.reason})` : ''}`).join('\n') : '- none'}

## What to do
- Skim the unverified rows. If you know a source, add its URL to \`references\` in concepts.json and re-run.
- Contradicted rows were cut from the page; check the surrounding sentence still reads well.
- Then set \`"published": true\` in concepts.json and run \`npm run build\`.
`;
}

module.exports = { judge, apply, report, soften, cutSentence, resolve, judgePrompt };
