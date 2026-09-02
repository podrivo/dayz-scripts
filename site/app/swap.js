/* Moving between source files without reloading the page.

   A file page and the one next to it differ in one thing: the listing. The
   header, the build picker, the search palette and — the expensive one — the
   2,825-row tree in the left column are the same on both, and a full
   navigation throws all of it away and builds it again: refetch files.json,
   re-render the tree, lose the reader's place in it, rebuild the minimap,
   re-highlight the code. That work is why switching files feels like
   something happening rather than something arriving, even though the HTML
   itself is quick.

   So the document stays and only the parts that differ are replaced: what is
   inside <main>, what is inside the page bar, the title, and the two data
   attributes that say which page this is. Then the handful of features that
   describe a listing rather than the site are run again over the new markup.
   The tree, and the reader's scroll position in it, are never touched.

   What this is not: a router. Only same-build source pages are taken, and
   only from a plain left click. Anything else — another build, a class page,
   a new tab, no History API, a fetch that fails — is left to the browser,
   which is also the fallback when any of this goes wrong. Every URL is a real
   page that stands on its own; this only saves the trip.

   Deep links, back and forward keep working because the URL is pushed before
   the page is painted: everything downstream reads location, and links.json
   is fetched relative to it. */

import { $, VPATH, pathBuild, setPage } from './dom.js';
import { initSourceView } from './source.js';
import { initShare } from './share.js';
import { initInlineCode } from './highlight.js';
import { initCopyBlocks } from './copy.js';
import { initMinimap } from './minimap.js';
import { recordVisit } from './recent.js';
import { identity, stampBuild } from './builds.js';
import { openColumn, showFile } from './filetree.js';

/** Prefix every URL of this build shares, '/' or '/v/<build>/'. */
const root = () => (pathBuild ? `/v/${pathBuild}/` : '/');

/**
 * The build-relative path of a URL, if it is a source page of this build:
 * `files/1_Core/param.c/`. Everything else, /files/ and other builds
 * included, is the browser's to navigate.
 */
function filePath(url) {
  if (url.origin !== location.origin) return null;
  const at = root();
  if (!url.pathname.startsWith(at)) return null;
  const rel = decodeURIComponent(url.pathname.slice(at.length));
  // Every script in the sources is a .c; see files.json in src/generate/routes.js.
  return /^files\/.+\.c\/$/.test(rel) ? rel : null;
}

/* The document each URL answered with, so going back to a file already read
   is free rather than merely quick. Keyed by build-relative path; the bodies
   are a few KB of text each and a reader gets through tens of files, not
   thousands. */
const seen = new Map();

const fetchPage = (url, rel) => {
  const held = seen.get(rel);
  if (held) return Promise.resolve(held);
  return fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((html) => {
      seen.set(rel, html);
      return html;
    });
};

/** Depth-to-root prefix for a build-relative directory, as layout() writes it. */
const baseFor = (rel) => '../'.repeat(rel.replace(/\/$/, '').split('/').length);

/**
 * Put a fetched document on screen. Only the pieces that belong to the page
 * are taken from it; the elements holding them are kept, so a listener laid
 * on <main> or on the page bar by something wired once survives.
 */
function paint(html, rel) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = $('.main');
  const fresh = $('.main', doc);
  if (!main || !fresh) return false;

  main.innerHTML = fresh.innerHTML;

  const bar = $('.pagebar');
  const freshBar = $('.pagebar', doc);
  if (bar && freshBar) bar.innerHTML = freshBar.innerHTML;

  document.title = doc.title;
  const base = doc.body.dataset.base ?? baseFor(rel);
  document.body.dataset.base = base;
  document.body.dataset.vpath = rel;
  setPage(base, rel);
  return true;
}

/** Run the features that describe a listing over the page now showing. */
function reinit() {
  // Which file, then the column: told first, a column going up for the first
  // time is built with this file already marked and its folders open.
  showFile(VPATH);
  openColumn();

  // Before the source view: it repaints the lines and asks share.js to put
  // the selection back on, which it can only do once it knows the new file.
  initShare();
  initSourceView();
  initInlineCode();
  initCopyBlocks();
  initMinimap();
  recordVisit();
  // The GitHub link on the new page still says `main`; pin it to this build.
  identity().then(stampBuild);
}

let at = VPATH;

/**
 * Show a page already known to be one of ours. `push` is false when the
 * browser moved through history and the URL is already right.
 */
function go(url, rel, push) {
  return fetchPage(url, rel)
    .then((html) => {
      // The URL first: links.json is named relative to the page, and the
      // hash decides which lines land highlighted.
      if (push) history.pushState(null, '', url);
      if (!paint(html, rel)) {
        location.assign(url);
        return;
      }
      at = rel;
      // A different file starts at its own top. A link naming a line is left
      // alone: initSourceView scrolls to it once the listing is painted.
      if (!url.hash) scrollTo({ top: 0 });
      reinit();
    })
    .catch(() => {
      // A page that will not come over the wire is still a page the browser
      // can fetch the ordinary way, and saying so beats doing nothing.
      if (push) location.assign(url);
      else location.reload();
    });
}

/**
 * Resolve the chrome's links against the page that served them. Header and
 * footer are written relative to their own depth and are the one thing a swap
 * leaves standing while the URL moves beneath it: the nav /files/ arrives with
 * says `../files/`, which four directories down is
 * /files/2_GameLib/components/files/. Read once, as absolute paths, they hold
 * wherever the reader goes next.
 */
function pinChrome() {
  for (const a of document.querySelectorAll('.top a[href], .foot a[href]')) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('/') || href.startsWith('#')) continue;
    if (a.origin !== location.origin) continue;
    a.setAttribute('href', a.pathname + a.search + a.hash);
  }
}

export function initSwap() {
  if (!window.history?.pushState || !window.DOMParser) return;

  pinChrome();

  document.addEventListener('click', (e) => {
    // Everything the browser has its own answer for: a modified click is a
    // new tab or a download, and a middle click is a new tab as well.
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;

    const url = new URL(a.href);
    const rel = filePath(url);
    if (!rel) return;
    // The listing already on screen. A line link belongs to share.js, which
    // selects lines without going anywhere; a plain one — the tree's own row
    // for the open file — has nowhere to go, and refetching it to land back
    // at the top of the file it is already showing is not what it means.
    if (rel === at) {
      if (!url.hash) e.preventDefault();
      return;
    }

    e.preventDefault();
    go(url, rel, true);
  });

  addEventListener('popstate', () => {
    const url = new URL(location.href);
    const rel = filePath(url);
    // Back out of the set of pages this handles — to a class page, say — and
    // the browser has to do it, since the document it wants is not this one.
    if (!rel) {
      location.reload();
      return;
    }
    if (rel === at) return; // a hash step within the file showing
    go(url, rel, false);
  });
}
