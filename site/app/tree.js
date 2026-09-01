/* Arrow-key walking of the files tree at /files/.

   Folders are native <details>; files are links. This only moves focus among
   the rows that are currently visible (open ancestors, not layer-filtered),
   and expands or collapses with the same keys a desktop file tree uses. */

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

export function initTree() {
  if (VPATH !== 'files/') return;
  const tree = $('.main ul.tree');
  if (!tree) return;

  let cur = null;

  const focusItem = (el) => {
    if (!el) return;
    cur?.classList.remove('tree-cur');
    cur = el;
    cur.classList.add('tree-cur');
    cur.focus({ preventScroll: true });
    cur.scrollIntoView({ block: 'nearest' });
  };

  tree.addEventListener('focusin', (e) => {
    const t = e.target.closest('summary, .tree-file > a');
    if (!t || !tree.contains(t)) return;
    if (cur === t) return;
    cur?.classList.remove('tree-cur');
    cur = t;
    cur.classList.add('tree-cur');
  });

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
