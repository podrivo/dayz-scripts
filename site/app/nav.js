/* The header's navigation bar: hover menus on a desktop, a drawer on a phone. */

import { $ } from './dom.js';

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
