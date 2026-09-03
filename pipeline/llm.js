// Minimal Claude client. Reads ANTHROPIC_API_KEY from the environment.
// Every function that needs the model takes an `llm` argument so tests can pass a fake.
const MODEL = process.env.EXPLAINER_MODEL || 'claude-sonnet-4-6';

function createClient({ fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY, model = MODEL } = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return {
    // Returns the text of the first text block. `system` and `user` are strings.
    async complete({ system, user, maxTokens = 4000 }) {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (!text) throw new Error('empty completion');
      return text;
    }
  };
}

// Pulls a JSON object out of a completion, tolerating ```json fences and stray prose around it.
function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no JSON object in completion');
  return JSON.parse(body.slice(start, end + 1));
}

module.exports = { createClient, parseJson, MODEL };
