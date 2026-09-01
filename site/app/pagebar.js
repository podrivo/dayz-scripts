/* The secondary bar, on the pages that carry one.

   What is in it is the generator's business (src/generate/render/pagebar.js).
   This is the bar itself: how tall it is, which the rest of the page has to
   know because the bar is sticky and everything that scrolls to a heading
   has to clear it, and the one thing in it that does not fit a phone. */

import { $ } from './dom.js';

/** Below this the seven access chips are a menu instead of a row. */
const NARROW = matchMedia('(max-width: 700px)');

/**
 * Publish the bar's height as --h-bar-size. --h-bar follows it in CSS so
 * hide-on-scroll can zero the offset without fighting this inline value.
 * Measured rather than declared because the chips collapsing changes it.
 */
function trackHeight(bar) {
  const publish = () =>
    document.documentElement.style.setProperty('--h-bar-size', `${Math.round(bar.offsetHeight)}px`);
  publish();
  new ResizeObserver(publish).observe(bar);
}

/**
 * The chips as a menu. Seven of them beside a field is a row nobody can read
 * on a phone, and the one in force is the only one worth the width, so it
 * becomes the label of a button the rest hang from.
 *
 * Built here rather than shipped in the HTML: it is no use without this
 * script, and a class page pays for its own bytes six thousand times over.
 */
function chipMenu(bar) {
  const chips = $('.pb-chips', bar);
  if (!chips) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pb-menu-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Filter by access');
  const label = () => ($('.pf.active', chips)?.textContent || 'All');
  const close = () => {
    bar.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', () => {
    const open = !bar.classList.contains('open');
    bar.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  // The chip click is whoever owns the chips; all this wants is the name of
  // the one that won and the menu shut behind it.
  chips.addEventListener('click', (e) => {
    if (!e.target.closest('button[data-mod]')) return;
    btn.textContent = label();
    close();
  });
  addEventListener('click', (e) => {
    if (bar.classList.contains('open') && !e.target.closest('.pb-chips, .pb-menu-btn')) close();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.classList.contains('open')) {
      e.stopPropagation();
      close();
    }
  });

  const apply = () => {
    const on = NARROW.matches;
    bar.classList.toggle('pb-has-menu', on);
    if (!on) {
      close();
      btn.remove();
      return;
    }
    btn.textContent = label();
    chips.before(btn);
  };
  NARROW.addEventListener('change', apply);
  apply();
}

/** File-list layer tabs (`#1_Core` …) hide the other trees instead of
 *  scrolling to a heading. A deeper hash (`#4_World/Plugins/…`) still
 *  filters to that layer; site/app/tree.js opens the folder path. File pages
 *  wear the same tabs as links back to the index; only the files index ships
 *  a tree to filter. */
function fileLayerTabs() {
  const layerTabs = [...document.querySelectorAll('.pb-tab[href*="#"]')];
  const main = $('.main');
  const trees = [...(main?.querySelectorAll('ul.tree') ?? [])];
  if (!layerTabs.length || !trees.length) return;
  const headingCount = $('h1 .count', main);
  const allCount = headingCount?.textContent ?? '';
  const layerOf = (tab) => {
    const href = tab.getAttribute('href') || '';
    const i = href.indexOf('#');
    return i === -1 ? '' : decodeURIComponent(href.slice(i + 1));
  };
  // `#4_World/Plugins` filters like `#4_World`; the rest of the path is the
  // folder tree.js reveals.
  const layerFrom = (hash) => {
    const path = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash);
    if (!path) return '';
    const i = path.indexOf('/');
    return i === -1 ? path : path.slice(0, i);
  };
  let layer = layerFrom(location.hash);

  const apply = () => {
    let layerCount = '';
    for (const t of trees) {
      for (const li of t.children) {
        const hide = !!(layer && li.dataset.layer !== layer);
        li.hidden = hide;
        if (!hide && layer) layerCount = $('.count', li)?.textContent || '';
      }
    }
    if (headingCount) headingCount.textContent = layer ? layerCount || allCount : allCount;
    for (const tab of document.querySelectorAll('.pb-tab')) {
      const on = layerOf(tab) === layer;
      tab.classList.toggle('active', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  };

  const tabs = layerTabs[0].parentElement;
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('a.pb-tab');
    if (!tab || !tabs.contains(tab)) return;
    e.preventDefault();
    const next = layerOf(tab);
    if (next === layer && !location.hash.slice(1).includes('/')) return;
    history.pushState(null, '', next ? `#${next}` : location.pathname + location.search);
    layer = next;
    apply();
  });
  // Only tab clicks, the initial hash, and back/forward change the layer.
  // tree.js replaceStates the folder path as you arrow — that must not light
  // these tabs or hide roots mid-browse.
  addEventListener('popstate', () => {
    layer = layerFrom(location.hash);
    apply();
  });
  if (layer) apply();
}

/**
 * Left and right along a strip of links.
 *
 * The bar is a row, so the arrows that mean "along a row" everywhere else on
 * the page should mean it here too. Until this they meant nothing at all: the
 * files tree gives the arrows up whenever focus is inside the bar
 * (site/app/tree.js), on the grounds that the bar is not the tree, and
 * nothing on the other side picked them up — so tabbing into the bar left
 * four dead keys and no way on without the pointer.
 *
 * Focus only, never activation. These are links to other pages, and a strip
 * that opened one every time an arrow moved along it could not be walked at
 * all; Enter opens the one you stop on, the same as for any other link. Tab
 * still reaches each of them, so this adds a way through without taking the
 * ordinary one away.
 *
 * Listening on the bar rather than on the strips inside it: site/app/swap.js
 * rewrites what the bar holds on every file it swaps in, and a listener on a
 * strip would go out with the markup it was attached to.
 */
function arrowRows(bar) {
  bar.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const nav = document.activeElement?.closest?.('.pb-tabs, .pb-letters');
    if (!nav) return;
    const links = [...nav.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (i === -1) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    let to;
    if (step) to = (i + step + links.length) % links.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = links.length - 1;
    else return;
    e.preventDefault();
    links[to].focus();
  });
}

export function initPageBar() {
  const bar = $('.pagebar');
  if (!bar) return;
  trackHeight(bar);
  chipMenu(bar);
  fileLayerTabs();
  // The section tabs, and the A–Z of the members index: both are one row of
  // links, and twenty-seven letters is a long way round by Tab alone.
  arrowRows(bar);
}
