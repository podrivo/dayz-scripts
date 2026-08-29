/* The header's navigation bar: hover menus on a desktop, a drawer on a phone. */

import { $, BASE } from './dom.js';

export function initNav() {
  const menuBtn = $('#menuBtn');
  const nav = $('#nav');
  const setNavOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
    if (open && nav) for (const d of nav.querySelectorAll('.nav-here')) d.open = true;
  };
  menuBtn?.addEventListener('click', () => setNavOpen(!document.body.classList.contains('nav-open')));
  document.addEventListener('click', (e) => {
    if (e.target.closest('#nav') || e.target.closest('#menuBtn')) return;
    if (document.body.classList.contains('nav-open')) setNavOpen(false);
    for (const d of nav?.querySelectorAll(':scope > .nav-sec') || []) d.open = false;
  });
  nav?.addEventListener('toggle', (e) => {
    const sec = e.target;
    if (sec.parentElement !== nav || !sec.open) return;
    for (const d of nav.querySelectorAll(':scope > .nav-sec')) if (d !== sec) d.open = false;
  });
  const desktopNav = () => window.matchMedia('(min-width: 901px)').matches;
  nav?.querySelectorAll(':scope > .nav-sec').forEach((sec) => {
    sec.addEventListener('mouseenter', () => { if (desktopNav()) sec.open = true; });
    sec.addEventListener('mouseleave', () => { if (desktopNav()) sec.open = false; });
    sec.querySelector(':scope > summary')?.addEventListener('click', (e) => {
      if (!desktopNav() || e.target.closest('a')) return;
      e.preventDefault();
    });
  });
}

/* The list of module topics belongs to a build, and the pages do not, so the
   nav leaves a hole for it and fills it from this build's nav.json the first
   time the section is opened. Without JavaScript the section heading is
   still a link to the full list. */
export function initNavTopics() {
  let navPromise;
  for (const box of document.querySelectorAll('.nav-kids[data-nav]')) {
    const details = box.closest('details');
    const fill = () => {
      navPromise ||= fetch(BASE + 'nav.json').then((r) => r.json());
      navPromise.then(({ topics }) => {
        if (box.dataset.filled) return;
        box.dataset.filled = '1';
        const active = box.dataset.active;
        box.append(...topics.map(([name, title]) => {
          const a = document.createElement('a');
          a.className = 'nav-sub';
          a.href = `${BASE}topics/${name}/`;
          a.textContent = title;
          if (active === `topics/${name}/`) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
          }
          return a;
        }));
      }).catch(() => {});
    };
    if (details.open) fill();
    details.addEventListener('toggle', () => details.open && fill(), { once: false });
    details.addEventListener('mouseenter', fill, { once: true });
  }
}
