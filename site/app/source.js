/* A script file's page: the listing, its links, and its folds.

   Everything here runs only on /files/…/, which is the one kind of page that
   ships raw source. */

import { $, BASE, VPATH, anchorOf, pathBuild, track } from './dom.js';
import { index, loadIndex } from './search-index.js';
import { loadPagesMap } from './builds.js';
import { TOKEN_RE, highlight, newlines } from './highlight.js';
import { parseHash, showSelection } from './share.js';

/**
 * Where a name written in source goes. Doxygen linked every name in its
 * source pages to the declaration it resolved to, which is most of what made
 * them worth reading when 89% of members carry no documentation. It resolved
 * by scope, and so does this: the file's links.json says which class body
 * each line falls inside and what that class inherits from, and search.json
 * says which classes declare a name, so a bare call inside a method is
 * looked up against its own class and then up the chain.
 *
 * A name that no enclosing class answers to falls back to the build-wide
 * index, where it is linked only if exactly one declaration claims it.
 * Anything still ambiguous is left as plain text, which is what Doxygen did
 * with a name it could not resolve either.
 *
 * A quoted string that is exactly a class or enum name, or that names a
 * script file this build has (uniquely, by path or basename), is linked
 * the same way. Game-data paths are left alone: those files are not here.
 */
export function sourceResolver(links) {
  const map = new Map();
  const claim = (n, url) => {
    const seen = map.get(n);
    if (seen === undefined) map.set(n, url);
    else if (seen !== url) map.set(n, null);
  };
  const list = (k) => index[k] || [];

  // Kept as a map of its own as well, since resolve.str below asks the same
  // question of a quoted name.
  const types = new Map();
  for (const n of list('classes')) { types.set(n, `classes/${n}/`); claim(n, `classes/${n}/`); }
  for (const n of list('enums')) { types.set(n, `enum/${n}/`); claim(n, `enum/${n}/`); }
  // Enforce declares a bare `typedef X;` beside `class X` for a couple of dozen
  // names — BaseContainer, Physics, ResourceName. The two spell one thing, so
  // the type wins the name instead of the pair cancelling each other out and
  // leaving it unlinked wherever it is written.
  for (const n of list('typedefs')) if (!types.has(n)) claim(n, `globals/typedefs/#${anchorOf(n)}`);
  for (const n of list('funcs')) claim(n, `globals/functions/#${anchorOf(n)}`);
  for (const n of list('consts')) claim(n, `globals/constants/#${anchorOf(n)}`);
  // Kept as a set of its own as well, for resolve.macro below.
  const macros = new Set(list('macros'));
  for (const n of macros) claim(n, `globals/macros/#${anchorOf(n)}`);
  for (const [ei, v] of list('values')) claim(v, `enum/${index.enums[ei]}/#${v}`);
  for (const [ci, m] of list('methods')) claim(m, `classes/${index.classes[ci]}/#${anchorOf(m)}`);
  for (const [ci, v] of list('vars')) claim(v, `classes/${index.classes[ci]}/#${anchorOf(v)}`);

  // Which classes declare each member name, which is the question a scoped
  // lookup asks of every class in the chain.
  const owners = new Map();
  const own = (ci, n) => {
    const a = owners.get(n);
    if (a) { if (!a.includes(ci)) a.push(ci); }
    else owners.set(n, [ci]);
  };
  for (const [ci, m] of list('methods')) own(ci, m);
  for (const [ci, v] of list('vars')) own(ci, v);

  const byName = new Map(index.classes.map((n, i) => [n, i]));
  const scopes = (links?.scopes || []).map(([from, to, chain]) => [
    from, to, chain.map((n) => byName.get(n)).filter((i) => i !== undefined),
  ]);

  /** The innermost class body a line sits in, as its inheritance chain. */
  const chainAt = (line) => {
    let best = null;
    for (const s of scopes) if (line >= s[0] && line <= s[1] && (!best || s[0] > best[0])) best = s;
    return best?.[2];
  };

  const fileByLower = new Map();
  const fileByBase = new Map();
  for (const p of list('files')) {
    // Looked up case-insensitively, since a path in source can be spelled
    // any way; the URL it resolves to is the indexed spelling.
    const url = `files/${p}/`;
    fileByLower.set(p.toLowerCase(), url);
    const base = p.split('/').pop().toLowerCase();
    fileByBase.set(base, fileByBase.has(base) ? null : url);
  }

  const resolve = (name, line) => {
    const chain = line && chainAt(line);
    const os = chain && owners.get(name);
    if (os) {
      for (const ci of chain) {
        if (os.includes(ci)) return `${BASE}classes/${index.classes[ci]}/#${anchorOf(name)}`;
      }
    }
    const url = map.get(name);
    return url ? BASE + url : null;
  };

  // A name in a #define/#ifdef/#ifndef is a macro by position, so it is looked
  // up in that one list rather than the build-wide map: SERVER is a macro here
  // even though the map has it cancelled out by whatever else declares it.
  resolve.macro = (name) => (macros.has(name) ? `${BASE}globals/macros/#${anchorOf(name)}` : null);

  resolve.str = (quoted) => {
    const inner = quoted.slice(1, -1).replace(/\\(.)/g, '$1');
    if (!inner) return null;
    const type = types.get(inner);
    if (type) return BASE + type;
    const path = inner.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^scripts\//i, '');
    const exact = fileByLower.get(path.toLowerCase());
    if (exact) return BASE + exact;
    const base = path.split('/').pop().toLowerCase();
    if (base.includes('.') && fileByBase.get(base)) return BASE + fileByBase.get(base);
    return null;
  };

  return resolve;
}

/* ---------- code folding ----------
   Every brace pair worth collapsing, found by scanning the source with the
   same tokenizer that highlights it, so a brace inside a string or a comment
   is not one. A class body opening on line 49 and closing on 9788 is the
   reason this exists: without it the only way past a method is to scroll it.

   The braces are counted here rather than read off the DOM because the DOM
   has no structure to read — the page is a flat run of line spans, which is
   what lets a six-thousand-line file paint at all. */
const FOLD_MIN = 2; // lines hidden before a fold is worth offering

function foldRanges(text) {
  const stack = [];
  const out = [];
  let line = 1;
  let last = 0;
  for (let m; (m = TOKEN_RE.exec(text)); ) {
    const gap = text.slice(last, m.index);
    last = TOKEN_RE.lastIndex;
    // braces only ever live in the gaps between tokens: the tokenizer
    // matches comments, strings, preprocessor lines, numbers and names.
    for (let i = 0; i < gap.length; i++) {
      const c = gap.charCodeAt(i);
      if (c === 10) line++;
      else if (c === 123) stack.push(line); // {
      else if (c === 125 && stack.length) { // }
        const from = stack.pop();
        if (line - from > FOLD_MIN) out.push([from, line]);
      }
    }
    line += newlines(m[0]);
  }
  return out;
}

function addFolds(srcEl, text) {
  const lines = srcEl.children;
  const byStart = new Map();
  for (const [from, to] of foldRanges(text)) {
    // the widest range starting on a line is the one that line folds
    const seen = byStart.get(from);
    if (!seen || to > seen) byStart.set(from, to);
  }
  if (!byStart.size) return;

  // Which folds are shut, and nothing else. Nesting then needs no
  // bookkeeping: a line is hidden if any shut fold covers it, so opening one
  // cannot reveal what another is still holding closed.
  const shut = new Map();
  const apply = () => {
    const hide = new Uint8Array(lines.length);
    for (const [from, to] of shut) {
      for (let i = from; i < to && i < hide.length; i++) hide[i] = 1;
    }
    for (let i = 0; i < lines.length; i++) lines[i].hidden = hide[i] === 1;
  };

  for (const [from, to] of byStart) {
    const el = lines[from - 1];
    if (!el) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fold';
    btn.setAttribute('aria-expanded', 'true');
    btn.title = `Fold lines ${from}–${to}`;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      el.classList.toggle('folded', open);
      if (open) shut.set(from, to);
      else shut.delete(from);
      apply();
    });
    // Both live in the gutter, and a class declaration opening a body has the
    // two of them, so they are ordered as they are drawn: icon then arrow.
    const doc = el.querySelector('.ldoc');
    if (doc) doc.after(btn);
    else el.prepend(btn);
  }
}

/** The listing: highlight, line numbers, deep links and folds. */
export function initSourceView() {
  const srcEl = $('#src code');
  if (!srcEl) return;
  $('#ghSrc')?.addEventListener('click', () => track('view_github', { source: 'page' }));

  const raw = srcEl.textContent;
  const paint = (resolve, decls) => {
    const declAt = decls && new Map(decls);
    srcEl.innerHTML = highlight(raw, resolve)
      .split('\n')
      .map((l, i) => {
        // A line that declares something carries an icon linking to the page
        // describing it — the reverse of the "src" link every member carries,
        // and the pair is what makes the two views one. It sits beside the
        // number rather than over it because the number belongs to the
        // selection now (see site/app/share.js).
        const url = declAt?.get(i + 1);
        const to = url ? `<a class="ldoc ic" href="${BASE}${url}" data-tip="Go to docs" aria-label="Documentation for this declaration"></a>` : '';
        return `<span class="line${url ? ' decl' : ''}" id="L${i + 1}">${to}${l}\n</span>`;
      })
      .join('');
    // Painting replaces the lines, and with them any highlight on the ones
    // being shared, so the selection is put back on every time.
    showSelection();
  };

  // Painted twice: once now, so the code is readable without waiting on a
  // network round trip, and again once the index and the file's link map
  // have arrived. Keeping the links out of the HTML is also what lets a file
  // page stay byte-identical across builds and keep its hard link.
  paint(null);
  const landed = parseHash(location.hash);
  if (landed) $(`#L${landed.from}`)?.scrollIntoView({ block: 'center' });

  // links.json sits beside the page, so it is named relative to it and
  // needs no knowledge of which build this is.
  Promise.all([
    loadIndex(),
    (pathBuild
      ? loadPagesMap().then((map) => {
          const rel = `${VPATH}links.json`;
          return fetch(map[rel] ? `/_b/${map[rel]}` : `/${rel}`);
        })
      : fetch('links.json')
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([, links]) => {
    paint(sourceResolver(links), links?.decls);
    addFolds(srcEl, raw);
  });
}
