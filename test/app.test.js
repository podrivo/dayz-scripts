// Runs site/app.js against a DOM where nothing is found.
//
// The client is a list of feature inits (site/app.js) over a module each
// (site/app/*.js), and every one of them is guarded by whether the element it
// works on is on the page — so on any real page most of them do nothing. That
// makes a mistake in one invisible until someone loads the one page that
// reaches it: an exception stops the entry's remaining inits, so every feature
// listed below the mistake silently stops working with nothing but a console
// entry to say so. It has happened twice.
//
// A stub that answers "no such element" to everything still runs all of those
// guards. So this walks the whole chain without needing a real DOM, and turns
// that class of bug into a failing test.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'site', 'app');
const ENTRY = pathToFileURL(path.join(ROOT, 'site', 'app.js')).href;

/** An element that exists but holds nothing and answers every call. */
function stubEl() {
  const el = {
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], cells: [], hidden: false, textContent: '', innerHTML: '', value: '',
    tagName: 'DIV', id: '', href: '', className: '', type: '', title: '',
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, append() {}, prepend() {}, before() {}, after() {},
    remove() {}, replaceWith() {}, insertBefore() {}, insertAdjacentHTML() {}, cloneNode: () => stubEl(),
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, closest: () => null,
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, matches: () => false,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
  return el;
}

/* Globals the modules read straight off the environment. Kept as one list so
   they can all be taken back off again afterwards: the rest of the suite runs
   in this same process and must not inherit a browser. */
const INSTALLED = [];
function define(name, value) {
  if (!INSTALLED.includes(name)) INSTALLED.push(name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

after(() => {
  for (const name of INSTALLED) delete globalThis[name];
});

function install(overrides = {}) {
  const document = {
    documentElement: stubEl(),
    body: stubEl(),
    head: stubEl(),
    activeElement: stubEl(),
    createElement: () => stubEl(),
    createTextNode: () => stubEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    readyState: 'loading',
    ...overrides,
  };
  define('document', document);
  define('location', { hash: '', pathname: '/', href: 'https://example.test/', search: '', origin: 'https://example.test' });
  define('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  define('sessionStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  define('history', { replaceState() {}, pushState() {} });
  define('navigator', { platform: 'MacIntel', userAgent: 'test', clipboard: { writeText: () => Promise.resolve() } });
  define('fetch', () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  define('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  define('getComputedStyle', () => ({ getPropertyValue: () => '', marginTop: '0px' }));
  define('requestAnimationFrame', (fn) => fn(0));
  define('ResizeObserver', class { observe() {} disconnect() {} });
  define('scrollTo', () => {});
  define('scrollY', 0);
  define('innerHeight', 800);
  define('addEventListener', () => {});
  define('removeEventListener', () => {});
  define('window', globalThis);
  return document;
}

/* The entry is re-imported per run with a fresh query so its inits run again.
   The feature modules behind it stay cached, which is what they would be in a
   browser too: one evaluation, one set of listeners. */
let runs = 0;
const run = (overrides) => {
  install(overrides);
  return import(`${ENTRY}?run=${runs++}`);
};

/** Let the promise chains the inits started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the client runs end to end on a page where every feature is absent', async () => {
  // The failure this catches is any exception out of an init: it takes every
  // feature listed after it in site/app.js down with it.
  await assert.doesNotReject(run());
  await settle();
});

// The compare page is the one feature that hands its work to a second file,
// and the branch that does so is skipped on all ~416k other pages — which is
// the shape of the bug this whole file is here to catch. The import cannot
// resolve outside a browser; that the failure is caught rather than thrown,
// and says so on the page, is the point.
test('the workshop list says so when it cannot load', async () => {
  const box = stubEl();
  await run({ querySelector: (s) => (s === '#workshop-list' ? box : null) });
  await settle();
  assert.match(box.textContent, /could not be loaded/);
});

test('the changelog hands off to compare.js, and says so when it cannot', async () => {
  const compare = stubEl();
  await run({ querySelector: (s) => (s === '#compare' ? compare : null) });
  await settle();
  assert.match(compare.textContent, /could not be loaded/);
});

// A module nothing imports is dead weight that still reads as live code. The
// entry is the only place features are wired up, so every one of them has to
// be named there — bar the ones that exist to be shared.
test('every module in site/app/ is reachable from the entry', () => {
  const entry = fs.readFileSync(path.join(ROOT, 'site', 'app.js'), 'utf8');
  const shared = new Set(['dom.js', 'overlay.js', 'search-index.js', 'highlight.js']);
  const sources = new Map(
    fs.readdirSync(APP_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => [f, fs.readFileSync(path.join(APP_DIR, f), 'utf8')])
  );

  for (const name of sources.keys()) {
    if (shared.has(name)) {
      const importedBy = [...sources].filter(([f, src]) => f !== name && src.includes(`./${name}`));
      assert.ok(importedBy.length, `site/app/${name} is imported by nothing`);
      continue;
    }
    assert.ok(entry.includes(`./app/${name}`), `site/app/${name} is not wired up in site/app.js`);
  }
});
