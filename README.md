# Break-it explainer

[![test](https://github.com/zestytinker/break-it-explainer/actions/workflows/test.yml/badge.svg)](https://github.com/zestytinker/break-it-explainer/actions)

Live site: https://zestytinker.github.io/break-it-explainer/


Interactive explainers for tech concepts. Each one lets you build a tiny version of the idea, then break it.

Two self-contained pages that teach a concept in six steps (why, how, break it, origin, where it lives, read further):

- `bloom-filter-explainer.html` (logic in `bloom.js`)
- `consistent-hashing-explainer.html` (logic in `hashring.js`)

Open either HTML file directly; the logic module is inlined by `build.js`.

## How a page gets made

```
concepts.json  ──►  pipeline/run.js <id>  ──►  content/<id>.json  ──►  pipeline/render.js  ──►  <id>-explainer.html
   (the menu)         draft with Claude         (verified prose)        (six-step template        (static, no setup)
                      gather trusted sources                             + playground partial
                      judge every claim                                  + inlined logic)
                      cut / soften / keep
                      write reports/<id>.md
```

Concepts are a fixed menu, so generation happens once, offline, and the site stays static. No API key ever reaches the browser.

1. Add the concept to `concepts.json` with its Wikipedia title (and optional `mdn` query or `references` URLs to open-access sources).
2. `ANTHROPIC_API_KEY=sk-... npm run generate -- <id>`
3. Read `reports/<id>.md`. Every factual claim is listed as supported (with the source phrase), unverified (softened in the text), or contradicted (cut from the text).
4. Set `"published": true` and `npm run build`. Commit the JSON, the report and the HTML together.

`npm run generate -- <id> --dry` runs the whole flow against fixtures with no network and writes only `reports/<id>.dry.md`. For `bloom-filter` the fixtures are excerpts from the real sources the page was checked against by hand, so the dry report doubles as a regression check on the verifier (see `reports/bloom-filter.dry.md`; the offline judge is a keyword stand-in for Claude, so expect it to be stricter on wording).

Running the pipeline for real on a concept that already has hand-verified content writes `content/<id>.generated.json` next to it for comparison and leaves the page alone; add `--force` to replace it.

Trusted sources today: Wikipedia (article text plus its external references, fetched when open access) and MDN for web-platform topics. The judge is told to use only those excerpts, never its own memory.

## Develop

```
npm install          # jsdom, for page tests only
npm test             # renders pages, then runs every test
npm run coverage     # same, with a coverage report
```

Edit logic in `bloom.js` / `hashring.js`, prose in `content/*.json`, layout in `pipeline/render.js`; `npm test` re-renders first so the pages always reflect the source of truth. CI fails if a committed page is out of sync with its content.

## Tests

| file | what it covers |
|---|---|
| `test/bloom.test.js`, `test/hashring.test.js` | pure logic: hashing, guarantees (no false negatives, keys never move off a surviving server), formulas, rebuild, validation |
| `test/bloom-page.test.js`, `test/hashring-page.test.js` | the rendered UI in jsdom: buttons, sliders, verdicts, shared state, navigation, escaping |
| `test/pipeline.test.js` | draft validation and retry, claim verdict application (cut / soften), source parsing, renderer, end-to-end dry run |

Statistical properties (load evenness, % keys moved) are asserted only in the module tests with large samples, never in UI tests, to avoid flakiness.

## Adding a concept

Prose comes from the pipeline. The playground (steps 2 and 3) is still hand-built: add a partial in `playgrounds/`, a logic module with tests, and point the concept at them in `concepts.json`. Concepts without a playground render with a placeholder so the prose can ship first.

## License

Code is [MIT](LICENSE). Text and visuals (the story copy and SVG designs) are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
