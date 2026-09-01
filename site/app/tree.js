/* Arrow-key walking of a files tree: the page at /files/, and the same tree
   as a column beside a source file (site/app/filetree.js).

   Folders are native <details>; files are links. This moves focus among the
   rows that are currently visible (open ancestors, not layer-filtered), expands
   or collapses with the usual arrow keys, and keeps the URL hash on the
   focused folder (`#4_World/Entities/Creatures`) so a selection is shareable
   the same way a breadcrumb link is. */

import { $, typing, VPATH } from './dom.js';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** The arrows alone, for a tree that is a column beside a page rather than the
    page itself: there Home and End still belong to the source. */
export const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function visibleItems(tree) {
  const out = [];
  const walk = (ul) => {
    for (const li of ul.children) {
      if (li.hidden) continue;
      const details = li.querySelector(':scope > details');
      if (details) {
        const summary = details.querySelector(':scope > summary');
        if (summary) out.push(summary);
        if (details.open) {
          const nested = details.querySelector(':scope > ul');
          if (nested) walk(nested);
        }
        continue;
      }
      const a = li.querySelector(':scope > a');
      if (a) out.push(a);
    }
  };
  walk(tree);
  return out;
}

function parentOf(el) {
  const wrap = el.tagName === 'SUMMARY' ? el.parentElement.parentElement : el.parentElement;
  const outer = wrap?.parentElement?.closest('details');
  return outer?.querySelector(':scope > summary') ?? null;
}

function firstChildOf(summary) {
  const details = summary.parentElement;
  if (!details.open) return null;
  const ul = details.querySelector(':scope > ul');
  if (!ul) return null;
  for (const li of ul.children) {
    if (li.hidden) continue;
    const nested = li.querySelector(':scope > details > summary');
    if (nested) return nested;
    const a = li.querySelector(':scope > a');
    if (a) return a;
  }
  return null;
}

/** Walk `ul.tree` along a display path, opening each folder; return its summary. */
export function openPath(tree, path) {
  if (!path) return null;
  let ul = tree;
  let summary = null;
  for (const part of path.split('/')) {
    let found = null;
    for (const li of ul.children) {
      if (li.hidden) continue;
      const details = li.querySelector(':scope > details');
      if (!details) continue;
      const s = details.querySelector(':scope > summary');
      if (s?.querySelector('code')?.textContent !== part) continue;
      found = details;
      summary = s;
      break;
    }
    if (!found) return null;
    found.open = true;
    ul = found.querySelector(':scope > ul');
    if (!ul) return summary;
  }
  return summary;
}

/** Display path of a folder summary, e.g. `4_World/Entities/Creatures`. */
function pathOf(summary) {
  const parts = [];
  for (let el = summary; el?.tagName === 'SUMMARY'; el = parentOf(el)) {
    parts.unshift(el.querySelector('code')?.textContent || '');
  }
  return parts.join('/');
}

/* Which folders the reader left open.

   The tree arrives shut. 2,825 files under six roots is a wall of names, and
   the ones a modder wants are the two or three folders they live in for
   weeks — so the folders they open are kept, by path, and the tree comes back
   the way they left it: here, and in the column beside a source file.

   Only the open ones are written; shut is the default and costs nothing to
   say. A saved path that no longer names a folder, a build having moved it,
   opens as much of itself as still exists and falls out on the next write. */
const STORE = 'tree';

const readOpen = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch { return []; /* private mode */ }
};

/* Read off the tree rather than tracked, so it does not matter what opened a
   folder, and once per turn rather than per folder: restoring a dozen of them
   fires a toggle for each, and so does revealing the file being read. */
let queued = false;
function saveOpen(tree) {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    const open = [...tree.querySelectorAll('details[open] > summary')].map((s) => pathOf(s));
    try { localStorage.setItem(STORE, JSON.stringify(open)); } catch { /* private mode */ }
  });
}

/**
 * Wire the arrows to one `ul.tree`.
 *
 * opts:
 *   claim  which of KEYS this tree answers to, on the document. A tree that is
 *          the page takes all of them; one that is a column beside a page
 *          takes the arrows and leaves Home and End to the page, where they
 *          mean the top and bottom of the source rather than the first and
 *          last of three thousand rows.
 *   hash   whether the focused folder is written to the URL. Only at /files/:
 *          on a file page the hash is a line range (site/app/share.js).
 *   start  the row to begin at, and the tree's single tab stop. Given one,
 *          the rows stop being individual tab stops the way a tree widget's
 *          do: Tab lands on the open file rather than walking three thousand
 *          rows to reach it, and the arrows do the rest.
 *   box    the element the tree scrolls inside, where it is not the page.
 *          Walking the sidebar has to move the sidebar and nothing else, and
 *          scrollIntoView reaches past a sticky column to the document and
 *          takes the source along with it.
 */
export function wireTree(tree, { claim = KEYS, hash = false, start = null, box = null } = {}) {
  // Everything below hangs off this so the wiring can be taken down again.
  // The keydown listener is on the document, not the tree, so a tree whose
  // rows have been replaced under it — the index's, once site/app/swap.js
  // puts a listing where the index was — would go on answering the arrows
  // and moving focus into a handful of detached rows.
  const off = new AbortController();
  const { signal } = off;
  let cur = null;
  let syncing = false;

  /* Put back what was left open, and only that: folders are opened here,
     never shut. A column is built with the way down to the file it stands
     beside already expanded (site/app/filetree.js), which is the one folder
     the reader did not ask for but does have to see. */
  for (const path of readOpen()) openPath(tree, path);
  // A <details> toggle does not bubble, so it is taken on the way down. Every
  // way a folder moves arrives here: a click, an arrow, a file revealed.
  tree.addEventListener('toggle', () => saveOpen(tree), { capture: true, signal });

  const rows = () => tree.querySelectorAll('summary, .tree-file > a');
  let stop = null;
  const holdStop = (el) => {
    const next = el || start;
    if (!start || next === stop) return;
    if (stop) stop.tabIndex = -1;
    stop = next;
    if (stop) stop.tabIndex = 0;
  };
  if (start) {
    for (const r of rows()) r.tabIndex = -1;
    holdStop(start);
  }

  // Focus stays on summary / file link; the highlight paints the whole row
  // (summary, or the li.tree-file) so files match folders.
  const paint = (el) => (el.tagName === 'SUMMARY' ? el : el.closest('li.tree-file'));
  const mark = (el) => {
    if (cur) paint(cur)?.classList.remove('tree-cur');
    cur = el;
    if (cur) paint(cur)?.classList.add('tree-cur');
    holdStop(cur);
  };
  if (start) mark(start);

  const syncHash = (el) => {
    if (!hash || syncing || !el) return;
    const folder = el.tagName === 'SUMMARY' ? el : parentOf(el);
    const path = folder ? pathOf(folder) : '';
    if (decodeURIComponent(location.hash.slice(1)) === path) return;
    // replaceState only — pagebar listens to popstate/clicks, not this, so
    // arrowing does not activate a layer tab or hide the other roots.
    history.replaceState(null, '', path ? `#${path}` : location.pathname + location.search);
  };

  const reveal = (el) => {
    if (!box) {
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
    // offsetParent is the column itself, which is positioned.
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  };

  const focusItem = (el) => {
    if (!el) return;
    mark(el);
    cur.focus({ preventScroll: true });
    reveal(cur);
    syncHash(el);
  };

  const revealHash = () => {
    const path = decodeURIComponent(location.hash.slice(1));
    if (!path) return;
    syncing = true;
    try {
      const summary = openPath(tree, path);
      if (summary) {
        mark(summary);
        cur.focus({ preventScroll: true });
        reveal(cur);
      }
    } finally {
      syncing = false;
    }
  };

  tree.addEventListener('focusin', (e) => {
    const t = e.target.closest('summary, .tree-file > a');
    if (!t || !tree.contains(t)) return;
    if (cur !== t) mark(t);
    syncHash(t);
  }, { signal });

  if (hash) {
    addEventListener('popstate', revealHash, { signal });
    revealHash();
  }

  document.addEventListener('keydown', (e) => {
    if (!claim.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing() || document.body.classList.contains('palette-open')) return;
    // Leave arrows alone while focus is in the layer tabs — those are click-only.
    if (document.activeElement?.closest('.pagebar')) return;

    const list = visibleItems(tree);
    if (!list.length) return;
    if (cur && !list.includes(cur)) {
      mark(null);
    }

    const i = cur ? list.indexOf(cur) : -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (i === -1) {
        focusItem(e.key === 'ArrowDown' ? list[0] : list[list.length - 1]);
        return;
      }
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0);
      focusItem(list[next]);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      focusItem(list[0]);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      focusItem(list[list.length - 1]);
      return;
    }

    if (i === -1) return;
    const el = list[i];

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      // Right means "into this". A shut folder opens, an open one hands over
      // to its first row, and a file — which has nothing below it — opens
      // itself, the same as clicking it: beside a listing that is a swap
      // rather than a page load (site/app/swap.js), so the tree does not move
      // and the arrows carry on from the row that was just opened.
      if (el.tagName !== 'SUMMARY') {
        el.click();
        return;
      }
      const details = el.parentElement;
      if (!details.open) {
        details.open = true;
        return;
      }
      focusItem(firstChildOf(el));
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (el.tagName === 'SUMMARY') {
        const details = el.parentElement;
        if (details.open) {
          details.open = false;
          return;
        }
      }
      focusItem(parentOf(el));
    }
  }, { signal });

  return {
    /* Move the highlight and the tab stop from outside — for a column beside
       a page, when the page it sits next to is replaced without a reload and
       the reader got there by some other link than one of these rows. Focus
       is left where it is: the reader may be reading the source, and the
       arrows pick up from the marked row whether or not the tree holds it. */
    select(el) {
      if (!el || el === cur) return;
      mark(el);
      reveal(el);
    },
    destroy: () => off.abort(),
  };
}

/* The tree that is the /files/ page, while it is still the page. */
let index = null;

export function initTree() {
  if (VPATH !== 'files/') return;
  const tree = $('.main ul.tree');
  if (tree) index = wireTree(tree, { hash: true });
}

/** Let the index's tree go, when a listing has taken the place it was in. */
export function dropIndexTree() {
  index?.destroy();
  index = null;
}
