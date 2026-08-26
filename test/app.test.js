// Runs site/app.js against a DOM where nothing is found.
//
// It is one long IIFE of independent features, each guarded by whether the
// element it works on is on the page, so on any real page most of it is
// skipped. That makes an ordering mistake — reading a `const` declared further
// down — invisible until someone loads the one page that reaches it: the
// exception kills the rest of the handler, so every feature below the mistake
// silently stops working with nothing but a console entry to say so. It has
// happened twice.
//
// A stub that answers "no such element" to everything still *evaluates* those
// guards, and reading a binding before its declaration throws whether or not
// the answer would have been null. So this walks the whole file in order
// without needing a real DOM, and turns that class of bug into a failing test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'site', 'app.js'), 'utf8');

/** An element that exists but holds nothing and answers every call. */
function stubEl() {
  const el = {
    dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], hidden: false, textContent: '', innerHTML: '', value: '',
    tagName: 'DIV', id: '', href: '', className: '',
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, append() {}, prepend() {}, before() {}, after() {},
    remove() {}, replaceWith() {}, insertBefore() {}, insertAdjacentHTML() {}, cloneNode: () => stubEl(),
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, closest: () => null,
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, matches: () => false,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
  return el;
}

function run(overrides = {}) {
  const listeners = new Map();
  const document = {
    documentElement: stubEl(),
    body: stubEl(),
    head: stubEl(),
    createElement: () => stubEl(),
    createTextNode: () => stubEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener() {},
    readyState: 'loading',
    ...overrides,
  };
  const sandbox = {
    document,
    console,
    location: { hash: '', pathname: '/', href: 'https://example.test/', search: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    history: { replaceState() {}, pushState() {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => fn(0),
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'site/app.js' }).runInContext(sandbox);
  return { listeners, sandbox };
}

// The script tag carries `defer`, so the IIFE does its work as it is
// evaluated rather than waiting for an event: running it is running all of it.
test('app.js evaluates without reading a binding before it is declared', () => {
  // The failure this catches reads "Cannot access 'x' before initialization",
  // and it takes every feature below the mistake down with it.
  assert.doesNotThrow(() => run());
});

test('app.js survives a page where every feature it looks for is absent', () => {
  const { sandbox } = run();
  assert.equal(typeof sandbox.document.body.dataset, 'object', 'the stub stood in for a real page');
});

// The compare page is the one feature that hands its work to a second file,
// and the branch that does so is skipped on all ~416k other pages — which is
// the shape of the bug the whole file is here to catch. The import itself
// cannot resolve in a vm; that it rejects rather than throws is the point.
test('app.js hands off to compare.js when the compare container is there', () => {
  assert.doesNotThrow(() => run({ querySelector: (s) => (s === '#compare' ? stubEl() : null) }));
});
