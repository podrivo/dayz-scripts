/* The page filter.

   What the search palette does for the whole build, this does for the page
   you are already on. Every long page here is one of four shapes — a table,
   a grid of names, a tree, or a run of member blocks — so one pass over
   those four covers the class index, the hierarchy, the file list, the
   globals tabs and a nine-hundred-member class alike. Nothing is fetched
   and nothing is added to the HTML but the field itself. */

import { $, track } from './dom.js';
import { refreshToc } from './toc.js';

/* Set by initFilter, and called by members.js once the one page whose rows
   arrive late has built them. A no-op on every page with no filter field. */
let rescan = () => {};

/** Take the page's units in again, then re-apply whatever is typed. */
export const rescanFilter = () => rescan();

/** Expand all / collapse all, on the pages that ship a tree. */
export function initTreeTools() {
  $('#expandAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = true)));
  $('#collapseAll')?.addEventListener('click', () =>
    document.querySelectorAll('ul.tree details').forEach((d) => (d.open = false)));
}

export function initFilter() {
  const main = $('.main');
  const filterInput = $('#pageFilter');
  const filterCount = $('#filterCount');
  if (!filterInput || !main) return;

  const UNIT = 'table.list > tbody > tr, .namegrid > a, dl.fields > dt, .member';

  /** What a unit is matched on. A member block is matched on its name and
      signature alone: its documentation and its list of callers are there to
      be read once you have found it, not to be searched. */
  const unitText = (el) =>
    el.classList.contains('member')
      ? `${$('.member-name', el)?.textContent || ''} ${$('.member-sig', el)?.textContent || ''}`
      : el.textContent;

  /** What the access chips ask about. The modifiers are already on the page
      as keyword spans inside the signature, and whether a member is
      documented is the presence of its doc block, so nothing has to be
      shipped to support any of this. */
  const modsOf = (el) => {
    const set = new Set([...el.querySelectorAll('.member-sig .kw')].map((k) => k.textContent));
    if ($('.member-doc', el)) set.add('@documented');
    return set;
  };

  let units = [];
  const scan = () => {
    units = [...main.querySelectorAll(UNIT)].map((el) => ({
      el,
      // a data field's <dt> and the <dd> listing its classes hide together
      also: el.tagName === 'DT' ? el.nextElementSibling : null,
      text: unitText(el).toLowerCase(),
      mods: el.classList.contains('member') ? modsOf(el) : null,
    }));
  };
  scan();
  const trees = [...main.querySelectorAll('ul.tree')];

  // File-list layer tabs (`#1_Core` …) filter the tree instead of scrolling
  // to a heading. Only the files index ships hash tabs over a tree.
  const layerTabs = [...document.querySelectorAll('.pb-tab[href*="#"]')];
  const layerOf = (tab) => {
    const href = tab.getAttribute('href') || '';
    const i = href.indexOf('#');
    return i === -1 ? '' : decodeURIComponent(href.slice(i + 1));
  };
  let layer = layerTabs.length ? decodeURIComponent(location.hash.slice(1)) : '';

  const syncLayerTabs = () => {
    for (const tab of document.querySelectorAll('.pb-tab')) {
      const on = layerOf(tab) === layer;
      tab.classList.toggle('active', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  };

  if (layerTabs.length) {
    const tabs = layerTabs[0].parentElement;
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('a.pb-tab');
      if (!tab || !tabs.contains(tab)) return;
      e.preventDefault();
      const next = layerOf(tab);
      if (next === layer) return;
      history.pushState(null, '', next ? `#${next}` : location.pathname + location.search);
      layer = next;
      syncLayerTabs();
      apply();
    });
    addEventListener('popstate', () => {
      layer = decodeURIComponent(location.hash.slice(1));
      syncLayerTabs();
      apply();
    });
    if (layer) syncLayerTabs();
  }

  // What each disclosure was showing before the filter took over, so
  // clearing it puts the tree back rather than to some canned state. Taken
  // when filtering starts, not at load, so an Expand all first survives it.
  let saved = null;

  /** A node's own label, which on a branch is its summary rather than
      everything nested under it. */
  const ownText = (li) => (li.querySelector(':scope > details > summary') || li).textContent.toLowerCase();
  const branch = (li) => li.querySelector(':scope > details');
  const kidsOf = (li) => (branch(li) || li).querySelector(':scope > ul');

  function showSubtree(ul) {
    for (const li of ul.children) {
      li.hidden = false;
      const det = branch(li);
      if (det) det.open = saved.get(det) ?? det.open;
      const kids = kidsOf(li);
      if (kids) showSubtree(kids);
    }
  }

  /** Hide what does not match, open what holds a match, and count the hits.
      A node whose own name matches keeps its whole subtree, since narrowing
      to a directory is one of the things this is for. */
  function filterTree(ul, q, roots) {
    let n = 0;
    for (const li of ul.children) {
      if (roots && layer && li.dataset.layer !== layer) {
        li.hidden = true;
        continue;
      }
      const det = branch(li);
      const kids = kidsOf(li);
      const self = ownText(li).includes(q);
      let deep = 0;
      if (self) {
        if (kids) showSubtree(kids);
      } else if (kids) {
        deep = filterTree(kids, q);
      }
      li.hidden = !self && !deep;
      if (det) det.open = deep > 0;
      n += (self ? 1 : 0) + deep;
    }
    return n;
  }

  /** Whether anything under a heading is still showing. Elements that hold
      no filterable unit at all — a paragraph, a tab strip — always count. */
  function holdsVisible(el) {
    if (el.matches(UNIT)) return !el.hidden;
    const inner = el.querySelectorAll(UNIT);
    if (inner.length) return [...inner].some((u) => !u.hidden);
    const lis = el.querySelectorAll('li');
    if (lis.length) return [...lis].some((li) => !li.hidden);
    return true;
  }

  /** Drop the headings whose whole section filtered away, so the page does
      not end up as a column of empty section titles. */
  function syncHeadings(active) {
    let head = null;
    let seen = false;
    for (const el of main.children) {
      if (el.tagName === 'H2' || el.tagName === 'H3') {
        if (head) head.hidden = active && !seen;
        head = el;
        seen = false;
      } else if (head && !seen && holdsVisible(el)) {
        seen = true;
      }
    }
    if (head) head.hidden = active && !seen;
  }

  // How many things there were to narrow, for the count beside the field.
  let treeTotal = 0;
  const total = () => units.length || (treeTotal ||= trees.reduce((n, t) => n + t.querySelectorAll('li').length, 0));

  // The access chip in force, as a predicate over a member's modifiers.
  // A leading "!" reads as "none of these", which is how public is spelled.
  let access = null;
  const chipTest = (spec) => {
    const negated = spec.startsWith('!');
    const want = spec.replace(/^!/, '').split(',');
    return (mods) => (negated ? !want.some((w) => mods.has(w)) : want.some((w) => mods.has(w)));
  };

  function apply() {
    const q = filterInput.value.trim().toLowerCase();
    const narrowed = !!q || !!access;
    if (narrowed && !saved) {
      saved = new Map();
      for (const t of trees) for (const d of t.querySelectorAll('details')) saved.set(d, d.open);
    }
    let n = 0;
    for (const u of units) {
      const on = (!q || u.text.includes(q)) && (!access || !u.mods || access(u.mods));
      u.el.hidden = !on;
      if (u.also) u.also.hidden = !on;
      if (on) n++;
    }
    for (const t of trees) {
      if (q) n += filterTree(t, q, true);
      else if (saved) showSubtree(t);
      for (const li of t.children) {
        if (layer && li.dataset.layer !== layer) li.hidden = true;
        else if (!q) li.hidden = false;
      }
    }
    if (!q) saved = null;
    syncHeadings(narrowed);
    if (filterCount) {
      filterCount.textContent = narrowed
        ? (n ? `${n.toLocaleString()} of ${total().toLocaleString()}` : 'no matches')
        : '';
    }
    refreshToc();
    return n;
  }

  function reportFilter(n) {
    const q = filterInput.value.trim();
    if (!q && !access) return;
    track('page_filter', {
      search_term: q.slice(0, 100),
      filter_matches: n,
      filter_access: !!access,
    });
  }

  $('.pb-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mod]');
    if (!btn) return;
    for (const el of btn.parentElement.children) {
      const on = el === btn;
      el.classList.toggle('active', on);
      el.setAttribute('aria-pressed', String(on));
    }
    access = btn.dataset.mod ? chipTest(btn.dataset.mod) : null;
    reportFilter(apply());
  });

  let pending;
  filterInput.addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(() => reportFilter(apply()), 60);
  });
  filterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && filterInput.value) {
      e.stopPropagation();
      filterInput.value = '';
      apply();
    }
  });
  // Browsers restore a search field's value across a back navigation, and
  // the page it is restored onto is unfiltered. A file-layer hash is the
  // same idea: the tree is still showing everything until we apply it.
  if (filterInput.value || layer) apply();

  // For the one page whose rows arrive after this ran.
  rescan = () => { scan(); apply(); };
}
