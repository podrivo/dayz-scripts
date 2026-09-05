/* This build's search.json: every declared name, what kind it is, and where
   its page is.

   Four features read it — the search palette, the source view's link
   resolver, the all-members table and the data-fields index — so it lives
   here rather than in any one of them, and is fetched at most once whichever
   of them asks first. Written by src/generate/search.js. */

import { BASE, ROOT, anchorOf } from './dom.js';

/* An entry is [kind, name, owner, text]. `owner` is whatever the URL needs
   beside the name — the declaring class, the enum, the topic, the file path —
   and is the name itself for the kinds that stand alone. `text` is the doc
   brief and community note, joined, which is what a query also searches. */
export const KIND = {
  c: ['class', (n, o) => `classes/${o}/`],
  m: ['method', (n, o) => `classes/${o}/#${anchorOf(n)}`],
  v: ['field', (n, o) => `classes/${o}/#${anchorOf(n)}`],
  e: ['enum', (n, o) => `enum/${o}/`],
  V: ['value', (n, o) => `enum/${o}/#${n}`],
  t: ['typedef', (n, o) => `globals/typedefs/#${o}`],
  k: ['const', (n, o) => `globals/constants/#${o}`],
  f: ['func', (n, o) => `globals/functions/#${o}`],
  d: ['macro', (n, o) => `globals/macros/#${o}`],
  g: ['topic', (n, o) => `topics/${o}/`],
  // Paths are indexed as displayed, which is also how the URL spells them.
  F: ['file', (n, o) => `files/${o}/`],
  // Site pages, not a declaration. `owner` is the version-relative URL.
  p: ['page', (n, o) => o],
};

/** Which kinds carry a real owner, and so can be narrowed by one. */
export const SCOPED = new Set(['m', 'v', 'V']);

/* Hand-written destinations the API index does not name. Same on every build,
   so they live here rather than in search.json — archived indexes stay
   searchable for them without being regenerated. */
const PAGES = [
  ['Home', '', 'Browsable documentation for the DayZ Enforce Script sources'],
  ['Community', 'community/', 'Official references, Discord servers, editors, build tools and community notes'],
  ['About', 'about/', 'Agents, the stack, and how to collaborate'],
  ['Credits', 'credits/', 'The DayZ credits roll, across every documented build'],
  ['Changelog', 'changelog/', 'What changed in the script API between two game builds'],
  ['Hierarchy', 'classes/hierarchy/', 'What extends what, from engine types down through every scripted subclass'],
  ['Guides', 'guides/', 'Conceptual maps for the DayZ script API', true],
  ['Script layers', 'guides/script-layers/', 'How 1_Core through 5_Mission compose and what belongs in each layer', true],
  ['Engine APIs and script code', 'guides/engine-and-script/', 'How to distinguish engine declarations from readable script implementations', true],
];

/* The raw index and the flat entry list, as live bindings: whoever awaited
   loadIndex() sees them filled in. */
export let index = null;
export let entries = null;

let loading = null;

export function loadIndex() {
  return (loading ||= (async () => {
    const [res, notes] = await Promise.all([
      fetch(BASE + 'search.json'),
      fetch(ROOT + 'assets/notes.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    index = await res.json();
    entries = [];
    // Older builds predate some of these lists, so every one is optional.
    const list = (k) => index[k] || [];
    for (const n of list('classes')) entries.push(['c', n, n]);
    for (const n of list('enums')) entries.push(['e', n, n]);
    for (const n of list('typedefs')) entries.push(['t', n, n]);
    for (const [ci, m] of list('methods')) entries.push(['m', m, index.classes[ci]]);
    for (const [ci, v] of list('vars')) entries.push(['v', v, index.classes[ci]]);
    for (const [ei, v] of list('values')) entries.push(['V', v, index.enums[ei]]);
    for (const n of list('consts')) entries.push(['k', n, n]);
    for (const n of list('funcs')) entries.push(['f', n, n]);
    for (const n of list('macros')) entries.push(['d', n, n]);
    for (const [name, title] of list('topics')) entries.push(['g', title, name]);
    for (const p of list('files')) entries.push(['F', p.split('/').pop(), p]);
    for (const e of entries) {
      const noteKey = SCOPED.has(e[0]) ? `${e[2]}.${e[1]}` : e[1];
      e[3] = [index.docs?.[urlFor(e)], notes[noteKey]].filter(Boolean).join(' ');
    }
    for (const [title, path, desc, development] of PAGES) {
      if (!development || document.body.hasAttribute('data-development')) entries.push(['p', title, path, desc]);
    }
  })());
}

/** An entry's page, relative to the build root. */
export function urlFor(e) {
  return KIND[e[0]][1](e[1], e[2]);
}

/** The dimmed line beside a result: what owns it, or which directory it is in. */
export function ctxFor(e) {
  if (SCOPED.has(e[0])) return e[2];
  if (e[0] === 'F') return e[2].split('/').slice(0, -1).join('/');
  return '';
}
