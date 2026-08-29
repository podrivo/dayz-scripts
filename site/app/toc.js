/* Table of contents.

   Doxygen's page-nav panel: the sections of this page, beside it, with the
   one you are in marked. Built from the headings the page already has, so
   it costs the generated HTML nothing and cannot fall out of step with it.
   Wide viewports only — there is no room for a third column below that, and
   the headings are a short scroll away on a phone. */

import { $ } from './dom.js';

/* Set by buildToc, and called by the page filter when a whole section
   disappears. A no-op on every page that has no contents panel. */
let refresh = () => {};

/** Re-mark the panel after something on the page was hidden or shown. */
export const refreshToc = () => refresh();

function buildToc(main) {
  if ($('.toc')) return;
  const heads = [...main.children].filter((el) => el.tagName === 'H2' || el.tagName === 'H3');
  if (heads.length < 3) return;

  const toc = document.createElement('aside');
  toc.className = 'toc';
  toc.setAttribute('aria-label', 'On this page');
  const nav = document.createElement('nav');

  // The page title is the way back to the top: above the first section there
  // is otherwise nothing to mark, and "Index" / "Start" would collide with
  // real pages. Strip the chrome the h1 carries for the page itself.
  const title = $('h1', main);
  let titleLink = null;
  if (title) {
    if (!title.id) title.id = 'top';
    titleLink = document.createElement('a');
    titleLink.href = `#${title.id}`;
    titleLink.className = 'toc-1';
    const label = title.cloneNode(true);
    label.querySelectorAll('.count, .kw, .badge, .generics').forEach((el) => el.remove());
    titleLink.textContent = label.textContent.trim();
    nav.append(titleLink);
  }

  const links = heads.map((h) => {
    // Most headings are anchored already; the rest are given one here rather
    // than in the generator, where it would be an id nothing links to.
    if (!h.id) h.id = (h.textContent.trim().toLowerCase().match(/[\w]+/g) || ['section']).join('-');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.className = h.tagName === 'H3' ? 'toc-3' : 'toc-2';
    // not the count badge: the number is on the heading itself already
    const label = h.cloneNode(true);
    label.querySelector('.count')?.remove();
    a.textContent = label.textContent.trim();
    nav.append(a);
    return a;
  });
  toc.append(Object.assign(document.createElement('p'), { className: 'toc-title', textContent: 'On this page' }), nav);
  main.after(toc);

  const margins = heads.map((h) => parseFloat(getComputedStyle(h).marginTop) || 0);

  /** Last heading whose section has reached the sticky chrome — the header,
      and the page bar under it where there is one. Count the heading's top
      margin: that gap is this section, not the previous one, and a TOC click
      parks the heading on scroll-padding-top, which sat below the old
      heading-box threshold. Above every section, the title. */
  const spy = () => {
    let cur = titleLink;
    const css = getComputedStyle(document.documentElement);
    const px = (name, fallback) => parseFloat(css.getPropertyValue(name)) || fallback;
    const line = px('--h-top', 56) + px('--h-bar', 0);
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].hidden) continue;
      if (heads[i].getBoundingClientRect().top - margins[i] > line) break;
      cur = links[i];
    }
    if (titleLink) titleLink.classList.toggle('cur', titleLink === cur);
    for (const a of links) a.classList.toggle('cur', a === cur);
  };
  addEventListener('scroll', spy, { passive: true });

  refresh = () => {
    let any = false;
    heads.forEach((h, i) => {
      links[i].hidden = h.hidden;
      if (!h.hidden) any = true;
    });
    toc.hidden = !any;
    spy();
  };
  refresh();
}

export function initToc() {
  const main = $('.main');
  if (!main) return;
  const roomForToc = matchMedia('(min-width: 1180px)');
  roomForToc.addEventListener('change', () => roomForToc.matches && buildToc(main));
  if (roomForToc.matches) buildToc(main);
}
