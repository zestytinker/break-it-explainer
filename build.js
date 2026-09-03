// Inlines a pure-logic module into an explainer so the HTML works as a single file.
//   node build.js                                     (syncs all known pairs)
//   node build.js some-explainer.html some-lib.js     (one pair)
const fs = require('fs');
const pairs = process.argv.length > 3 ? [[process.argv[2], process.argv[3]]]
  : [['bloom-filter-explainer.html', 'bloom.js'], ['consistent-hashing-explainer.html', 'hashring.js']];
for (const [htmlFile, libFile] of pairs) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const lib = fs.readFileSync(libFile, 'utf8');
  const esc = libFile.replace('.', '\\.');
  const re = new RegExp(`<script data-inlined="${esc}">[\\s\\S]*?<\\/script>|<script src="${esc}"><\\/script>`);
  if (!re.test(html)) throw new Error(`marker for ${libFile} not found in ${htmlFile}`);
  fs.writeFileSync(htmlFile, html.replace(re, `<script data-inlined="${libFile}">\n${lib}</script>`));
  console.log(`inlined ${libFile} into ${htmlFile}`);
}
