# break-it-explainer

Interactive explainers for tech concepts. Each page: build a tiny version of the idea, then break it.
Live: https://zestytinker.github.io/break-it-explainer/ (GitHub Pages, deploys from `main` root, no build step).

## Loop

`npm test` renders every page from `content/*.json`, then runs all tests (unit, jsdom page tests, pipeline). It must pass before any commit. CI re-runs it and fails if a committed HTML page differs from what rendering produces, so always commit content JSON and the rendered HTML together.

## Layout

- `concepts.json`: the menu. `published: false` hides a concept from `index.html` but still renders its page.
- `content/<id>.json`: verified prose. `verification.method` is `manual` (checked by a human) or `llm-judged` (pipeline).
- `playgrounds/<name>.html`: step 2/3 widget (CSS + script). `bloom.js` / `hashring.js`: their pure logic, unit tested.
- `pipeline/`: `render.js` (JSON -> page), `run.js` (draft -> gather sources -> judge claims -> apply -> report), `generate.js`, `verify.js`, `sources.js`, `llm.js`.
- `reports/<id>.md`: per-claim verdicts for human review. `*.dry.md` are offline fixture runs, not real verdicts.
- `test/`: everything. Fixtures under `test/fixtures/`.

## Adding or regenerating a concept

1. Add it to `concepts.json` with its Wikipedia title; add `references` URLs (original paper, official docs) when known.
2. `ANTHROPIC_API_KEY=... npm run generate -- <id>` (`--dry` for the offline fixture flow; `--force` to overwrite hand-verified content).
3. Read `reports/<id>.md`. Unverified claims were hedged in the text, contradicted ones cut.
4. Flip `published: true`, `npm test`, commit JSON + report + HTML, push.

## Style rules for prose

- Playful, plain words, everyday analogies. Explain the original motivation first, then the mechanism, then the trade-off.
- No em dashes or en dashes anywhere (the draft validator rejects them).
- Every date, name, number and "X uses Y" must trace to a source in the report or be softened.
- Step 5 "caveat" always says what the idea cannot do.

## Engineering rules

- Pure logic lives in a module with tests; pages are thin renderers over it.
- User-typed text goes through `esc()` before `innerHTML`.
- Statistical properties (load evenness, % keys moved, false-positive rate) are asserted only in module tests with large samples, never in jsdom tests.
- Keep pages self-contained: logic modules are inlined by the renderer, no external scripts except the Google Font.
- No new frameworks or bundlers. Node built-ins plus jsdom for tests.

## Playground templates

Hand-built only. Existing: `bloom` (set with membership, light bulbs) and `ring` (consistent hashing ring). Next planned: queue/bucket (token-bucket rate limiting). A new template needs a logic module, unit tests, a jsdom page test, and a partial in `playgrounds/`.
