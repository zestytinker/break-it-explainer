// Loads a built (inlined) explainer HTML into jsdom so the page script runs for real.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function loadPage(file) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (!html.includes('data-inlined=')) throw new Error(`${file} is not built. Run: node build.js`);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};                       // jsdom doesn't implement it
  const doc = window.document;
  const $ = (sel, root = doc) => root.querySelector(sel);
  const $$ = (sel, root = doc) => [...root.querySelectorAll(sel)];
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const type = (input, text) => { input.value = text; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const slide = (input, value) => { input.value = String(value); input.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const enter = input => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const activeStep = () => $('.step.on').dataset.step;
  return { window, doc, $, $$, click, type, slide, enter, activeStep };
}

module.exports = { loadPage };
