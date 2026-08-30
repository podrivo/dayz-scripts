/* Recent & pinned pages.

   What the empty palette shows instead of nothing: the pages this browser
   keeps coming back to. A modder lives in the same five classes for weeks,
   and the fastest search is the one that is already answered when the box
   opens. Entries are the search index's own [kind, name, owner] tuples, so
   the palette's result renderer and urlFor serve them unchanged; they are
   stored as version-relative URLs and resolved against BASE, so a list built
   on one build follows you into another. */

import { $, BASE, VPATH, esc, track, pageType } from './dom.js';
import { KIND, ctxFor, urlFor } from './search-index.js';

const RECENT_MAX = 12;

const readPages = (key) => {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list)
      ? list.filter((e) => Array.isArray(e) && KIND[e[0]] && typeof e[1] === 'string' && typeof e[2] === 'string')
      : [];
  } catch { return []; }
};

const writePages = (key, list) => {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
};

/* The pages worth remembering are the ones naming a declaration you came
   looking for: a class, an enum, a topic, a source file. The indexes above
   them — the class list, the hierarchy, the globals tabs, the changelog —
   are one click away in the nav and would only crowd out the five pages
   someone is actually working in.
   Two spellings have to be read off the page rather than the URL: a file's
   display casing, since the URL only knows the lowercase form, and a
   topic's label, since its URL carries the \defgroup name instead. */
function pageEntry() {
  if (pageType) return [pageType.kind === 'class' ? 'c' : 'e', pageType.name, pageType.name];
  const m = /^topics\/([^/]+)\/$/.exec(VPATH);
  if (m) {
    const label = $('.main h1')?.textContent.trim();
    if (label) return ['g', label, m[1]];
  }
  if (/^files\/.+\//.test(VPATH)) {
    const display = $('.file-title code')?.textContent;
    if (display) return ['F', display.split('/').pop(), display];
  }
  return null;
}

/** Remember this page, if it is one of the kinds worth remembering. */
export function recordVisit() {
  const here = pageEntry();
  if (!here) return;
  const prev = readPages('recent');
  if (prev.some((e) => urlFor(e) === urlFor(here))) track('return_visit', { content_type: KIND[here[0]][0] });
  const rec = prev.filter((e) => urlFor(e) !== urlFor(here));
  rec.unshift(here);
  writePages('recent', rec.slice(0, RECENT_MAX));
}

/**
 * The palette's home state, as rows and the markup for them, or null when
 * this browser has nothing to show yet. The rows come back so the caller can
 * map a pin button's index onto the entry it belongs to.
 */
export function homeList() {
  const pinned = readPages('pinned');
  const pinnedUrls = new Set(pinned.map(urlFor));
  // A pinned page does not need saying twice. The page under the palette
  // stays first so the list includes where you already are.
  const recent = readPages('recent').filter((e) => !pinnedUrls.has(urlFor(e)));
  if (!pinned.length && !recent.length) return null;

  const row = (e, i, on) => {
    const ctx = ctxFor(e);
    return /* html */ `<a href="${BASE}${urlFor(e)}"><span class="tag tag-${e[0]}">${KIND[e[0]][0]}</span><span class="search-main"><span>${esc(e[1])}</span></span>${ctx ? `<span class="ctx">${esc(ctx)}</span>` : ''}<button type="button" class="pin${on ? ' on' : ''}" data-i="${i}" title="${on ? 'Unpin' : 'Pin to the top of this list'}" aria-label="${on ? 'Unpin' : 'Pin'} ${esc(e[1])}"><i class="ic ic-pin" aria-hidden="true"></i></button></a>`;
  };
  const sec = (label, rows) => (rows.length ? `<div class="search-sec">${label}</div>${rows.join('')}` : '');

  return {
    rows: [...pinned, ...recent],
    html:
      sec('Pinned', pinned.map((e, i) => row(e, i, true))) +
      sec('Recently viewed', recent.map((e, i) => row(e, pinned.length + i, false))),
  };
}

/** Pin an entry, or unpin it if it is pinned already. */
export function togglePin(entry) {
  const pinned = readPages('pinned');
  const at = pinned.findIndex((p) => urlFor(p) === urlFor(entry));
  if (at >= 0) pinned.splice(at, 1);
  else pinned.push(entry);
  writePages('pinned', pinned);
  track('pin', { pinned: at < 0 });
}
