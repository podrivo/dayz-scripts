/* The secondary bar, on the pages that carry one.

   What is in it is the generator's business (src/generate/render/pagebar.js)
   and what the field and the chips do is site/app/filter.js. This is the bar
   itself: how tall it is, which the rest of the page has to know because the
   bar is sticky and everything that scrolls to a heading has to clear it, and
   the one thing in it that does not fit a phone. */

import { $ } from './dom.js';

/** Below this the seven access chips are a menu instead of a row. */
const NARROW = matchMedia('(max-width: 700px)');

/**
 * Publish the bar's height as --h-bar. Read by the anchor scroll offset in
 * styles.css and by the table of contents' scroll spy. Measured rather than
 * declared because the chips collapsing changes it.
 */
function trackHeight(bar) {
  const publish = () =>
    document.documentElement.style.setProperty('--h-bar', `${Math.round(bar.offsetHeight)}px`);
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
  // The chip itself is filter.js's to handle; all this wants is the name of
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

/**
 * The filter starts as an icon in the header search's box. Opening it
 * reveals the field; closing it (empty, and the focus has left) puts the
 * icon back. A value keeps it open, including one the browser restored
 * across a back navigation.
 */
function filterToggle(bar) {
  const wrap = $('.pb-filter', bar);
  const input = $('#pageFilter', wrap);
  const btn = $('.pb-search-btn', wrap);
  if (!wrap || !input || !btn) return;

  const setOpen = (on) => {
    wrap.classList.toggle('open', on);
    btn.setAttribute('aria-expanded', String(on));
    input.tabIndex = on ? 0 : -1;
    if (on) input.focus();
  };

  btn.addEventListener('click', () => setOpen(true));
  input.addEventListener('blur', () => {
    if (!input.value.trim()) setOpen(false);
  });
  // filter.js eats Escape when the field has a value, to clear it. An empty
  // field lets it through, and that is the way to put the icon back.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !input.value) setOpen(false);
  });
  if (input.value) setOpen(true);
}

/** Shut the letter picker when the click is outside it. */
function letterPick(bar) {
  const pick = $('.pb-pick', bar);
  if (!pick) return;
  addEventListener('click', (e) => {
    if (pick.open && !e.target.closest('.pb-pick')) pick.open = false;
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pick.open) {
      e.stopPropagation();
      pick.open = false;
    }
  });
}

export function initPageBar() {
  const bar = $('.pagebar');
  if (!bar) return;
  trackHeight(bar);
  filterToggle(bar);
  chipMenu(bar);
  letterPick(bar);
}
