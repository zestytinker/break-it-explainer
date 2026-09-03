# Break-it explainer

[![test](https://github.com/zestytinker/break-it-explainer/actions/workflows/test.yml/badge.svg)](https://github.com/zestytinker/break-it-explainer/actions)

Live site: https://zestytinker.github.io/break-it-explainer/


Interactive explainers for tech concepts. Each one lets you build a tiny version of the idea, then break it.

Two self-contained pages that teach a concept in six steps (why, how, break it, origin, where it lives, read further):

- `bloom-filter-explainer.html` (logic in `bloom.js`)
- `consistent-hashing-explainer.html` (logic in `hashring.js`)

Open either HTML file directly; the logic module is inlined by `build.js`.

## Develop

```
npm install          # jsdom, for page tests only
npm test             # builds, then runs unit + page + build tests
npm run coverage     # same, with a coverage report
```

Edit `bloom.js` / `hashring.js`, then `npm test` (which runs `node build.js` first so the pages pick up the change).

## Tests

| file | what it covers |
|---|---|
| `bloom.test.js`, `hashring.test.js` | pure logic: hashing, guarantees (no false negatives, keys never move off a surviving server), formulas, rebuild, validation |
| `bloom-page.test.js`, `hashring-page.test.js` | the UI in jsdom: buttons, sliders, verdicts, shared state between playgrounds, navigation |
| `build.test.js` | the inliner: replacement, idempotence, missing-marker failure |

Statistical properties (load evenness, % keys moved) are asserted only in the module tests with large samples, never in UI tests, to avoid flakiness.

## Adding a concept

Copy one of the HTML files, keep the six steps, write a new pure-logic module with tests, and register the pair in `build.js`. Steps 1, 4, 5 and 6 are prose; the playground in steps 2 and 3 is the part that has to be built fresh each time.

## License

Code is [MIT](LICENSE). Text and visuals (the story copy and SVG designs) are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
