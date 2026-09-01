/* Arrow-key walking of the files tree at /files/.

   Folders are native <details>; files are links. This moves focus among the
   rows that are currently visible (open ancestors, not layer-filtered), expands
   or collapses with the usual arrow keys, and keeps the URL hash on the
   focused folder (`#4_World/Entities/Creatures`) so a selection is shareable
   the same way a breadcrumb link is. */

import { $, typing, VPATH } from './dom.js';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

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
function openPath(tree, path) {
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

export function initTree() {
  if (VPATH !== 'files/') return;
  const tree = $('.main ul.tree');
  if (!tree) return;

  let cur = null;
  let syncing = false;

  const syncHash = (el) => {
    if (syncing || !el) return;
    const folder = el.tagName === 'SUMMARY' ? el : parentOf(el);
    const path = folder ? pathOf(folder) : '';
    if (decodeURIComponent(location.hash.slice(1)) === path) return;
    // replaceState: arrowing through folders must not flood the history stack.
    history.replaceState(null, '', path ? `#${path}` : location.pathname + location.search);
    dispatchEvent(new Event('files-hash'));
  };

  const focusItem = (el) => {
    if (!el) return;
    cur?.classList.remove('tree-cur');
    cur = el;
    cur.classList.add('tree-cur');
    cur.focus({ preventScroll: true });
    cur.scrollIntoView({ block: 'nearest' });
    syncHash(el);
  };

  const revealHash = () => {
    const path = decodeURIComponent(location.hash.slice(1));
    if (!path) return;
    syncing = true;
    try {
      const summary = openPath(tree, path);
      if (summary) {
        cur?.classList.remove('tree-cur');
        cur = summary;
        cur.classList.add('tree-cur');
        cur.focus({ preventScroll: true });
        cur.scrollIntoView({ block: 'nearest' });
      }
    } finally {
      syncing = false;
    }
  };

  tree.addEventListener('focusin', (e) => {
    const t = e.target.closest('summary, .tree-file > a');
    if (!t || !tree.contains(t)) return;
    if (cur !== t) {
      cur?.classList.remove('tree-cur');
      cur = t;
      cur.classList.add('tree-cur');
    }
    syncHash(t);
  });

  addEventListener('popstate', revealHash);
  revealHash();

  document.addEventListener('keydown', (e) => {
    if (!KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing() || document.body.classList.contains('palette-open')) return;

    const list = visibleItems(tree);
    if (!list.length) return;
    if (cur && !list.includes(cur)) {
      cur.classList.remove('tree-cur');
      cur = null;
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
      if (el.tagName === 'SUMMARY') {
        const details = el.parentElement;
        if (!details.open) {
          details.open = true;
          return;
        }
        focusItem(firstChildOf(el));
      }
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
  });
}
